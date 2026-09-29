import "server-only";
import {
  checksBeforeCharge,
  checksOnCollected,
  strongestAction,
  virtualAccountLapsed,
  type CheckHit,
} from "~/lib/checks";
import type { Json, Tables } from "~/lib/database.types";
import {
  METHOD_LABEL,
  currency as currencyInfo,
  formatMoney,
  isCurrency,
  quoteCollection,
  usdEquivalent,
  type Currency,
  type PayMethod,
} from "~/lib/fees";
import {
  ISO3,
  VIRTUAL_ACCOUNT_BANK_CODE,
  VIRTUAL_ACCOUNT_MINUTES,
  findNetwork,
  normalisePhone,
  payoutRail,
} from "~/lib/payaza-codes";
import { payoutReference } from "~/lib/reference";
import type { StartPaymentInput } from "~/lib/schemas";
import type { TransactionStatus } from "~/lib/status";
import { sendEmail, sendToAdmin } from "../email/send";
import {
  businessReceipt,
  flagAlertEmail,
  payerReceipt,
  transactionFailedEmail,
  transactionHeldEmail,
} from "../email/templates";
import { env } from "../env";
import * as payaza from "../partners/payaza";
import { supabaseAdmin } from "../supabase";

// The collection state machine (TRD 6.2 and 6.4). Every status change is a
// conditional update: `where id = $1 and status = $expected`. Zero rows means
// someone else got there first, and the caller stops. Every change also writes
// a transaction_events row. Webhooks land in transaction_events before anything
// else, so a repeat hits the unique key and does nothing.

export type Tx = Tables<"transactions">;
export type PaymentRequest = Tables<"payment_requests">;
export type Business = Tables<"businesses">;
export type PayoutAccount = Tables<"payout_accounts">;

type EventSource = "system" | "payaza_webhook" | "admin" | "job";

/** What the payer needs to finish paying. Stored on transactions.payin_details. */
export type PayinDetails =
  | {
      kind: "momo";
      phone: string;
      network: string;
      requiresOtp: boolean;
      otpLength: number | null;
      beforeInstruction: string | null;
      afterInstruction: string | null;
      paymentToken: string | null;
      payee: string | null;
      paymentMethod: string | null;
      channel: string | null;
      redirectUrl: string | null;
      otpSubmitted?: boolean;
    }
  | {
      kind: "virtual_account";
      accountNumber: string;
      accountName: string;
      bankName: string;
      expiresAt: string;
    }
  | {
      kind: "checkout";
      merchantKey: string;
      connectionMode: "Test" | "Live";
      amount: number;
      currency: string;
      reference: string;
      email: string;
      firstName: string;
      lastName: string;
      phone: string;
    };

export class CollectError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/* --------------------------------- helpers -------------------------------- */

const db = () => supabaseAdmin();

async function logEvent(input: {
  transactionId: string;
  source: EventSource;
  from: string | null;
  to: string | null;
  payload?: unknown;
  key: string;
}): Promise<"inserted" | "duplicate"> {
  const { error } = await db()
    .from("transaction_events")
    .insert({
      transaction_id: input.transactionId,
      source: input.source,
      from_status: input.from,
      to_status: input.to,
      payload: (input.payload ?? null) as Json,
      idempotency_key: input.key,
    });
  if (!error) return "inserted";
  if (error.code === "23505") return "duplicate";
  throw new Error(`transaction_events insert failed: ${error.message}`);
}

/** Conditional status change. Returns the updated row or null when the state had already moved. */
async function transition(
  tx: Tx,
  from: TransactionStatus | TransactionStatus[],
  to: TransactionStatus,
  patch: Partial<Tx>,
  event: { source: EventSource; payload?: unknown; key?: string },
): Promise<Tx | null> {
  const froms = Array.isArray(from) ? from : [from];
  const { data, error } = await db()
    .from("transactions")
    .update({ ...patch, status: to })
    .eq("id", tx.id)
    .in("status", froms)
    .select()
    .maybeSingle();
  if (error) throw new Error(`transactions update failed: ${error.message}`);
  if (!data) return null;
  await logEvent({
    transactionId: tx.id,
    source: event.source,
    from: tx.status,
    to,
    payload: event.payload,
    key: event.key ?? `system:${tx.id}:${tx.status}->${to}:${Date.now()}`,
  });
  return data;
}

async function addFlags(tx: Tx, hits: CheckHit[], businessName: string) {
  if (hits.length === 0) return;
  const { error } = await db()
    .from("aml_flags")
    .insert(
      hits.map((h) => ({
        business_id: tx.business_id,
        transaction_id: tx.id,
        rule: h.rule,
        severity: h.severity,
        action_taken: h.action,
        evidence: { ...h.evidence, message: h.message } as NonNullable<Json>,
      })),
    );
  if (error) console.error("[collect] aml_flags insert failed", error.message);
  for (const h of hits) {
    if (h.severity === "high" || h.action !== "none") {
      await sendToAdmin(
        flagAlertEmail({
          rule: h.rule,
          severity: h.severity,
          businessName,
          reference: tx.reference,
          message: h.message,
        }),
      );
    }
  }
}

async function loadTx(id: string): Promise<Tx | null> {
  const { data } = await db().from("transactions").select().eq("id", id).maybeSingle();
  return data ?? null;
}

async function loadTxByReference(reference: string): Promise<Tx | null> {
  const { data } = await db()
    .from("transactions")
    .select()
    .eq("reference", reference)
    .maybeSingle();
  return data ?? null;
}

async function loadTxByPayoutReference(reference: string): Promise<Tx | null> {
  const { data } = await db()
    .from("transactions")
    .select()
    .eq("payout_reference", reference)
    .maybeSingle();
  return data ?? null;
}

async function loadRequest(id: string): Promise<PaymentRequest | null> {
  const { data } = await db().from("payment_requests").select().eq("id", id).maybeSingle();
  return data ?? null;
}

async function loadBusiness(id: string): Promise<Business | null> {
  const { data } = await db().from("businesses").select().eq("id", id).maybeSingle();
  return data ?? null;
}

async function loadPayoutAccount(id: string | null): Promise<PayoutAccount | null> {
  if (!id) return null;
  const { data } = await db().from("payout_accounts").select().eq("id", id).maybeSingle();
  return data ?? null;
}

/**
 * The account a request pays out to: the default in the request's currency, else
 * any account in that currency, else the business's first default (converted).
 */
export async function pickPayoutAccount(
  businessId: string,
  currency: string,
): Promise<PayoutAccount | null> {
  const { data } = await db()
    .from("payout_accounts")
    .select()
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });
  const accounts = data ?? [];
  return (
    accounts.find((a) => a.currency === currency && a.is_default) ??
    accounts.find((a) => a.currency === currency) ??
    accounts.find((a) => a.is_default) ??
    accounts[0] ??
    null
  );
}

export function describePayoutAccount(a: PayoutAccount | null): string {
  if (!a) return "your payout account";
  const d = a.details as Record<string, string>;
  const number = d["account_number"] ?? "";
  const masked = number.length > 4 ? `••••${number.slice(-4)}` : number;
  return `${d["bank_name"] || d["bank_code"] || (a.method === "momo" ? "mobile money" : "bank")} ${masked} (${a.currency})`;
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  const first = parts.shift() ?? "Customer";
  return { first, last: parts.join(" ") || first };
}

function payinOf(tx: Tx): PayinDetails | null {
  const payin = (tx.payin_details as PayinDetails | null) ?? null;
  // The checkout key and mode are config, not facts about the payment. Read them
  // fresh, so a key rotated after the attempt started still opens Payaza's checkout.
  if (payin?.kind === "checkout") {
    return {
      ...payin,
      merchantKey: env.payazaPublicKey,
      connectionMode: env.mode === "live" ? "Live" : "Test",
    };
  }
  return payin;
}

/**
 * The country Payaza's status query wants: where the wallet lives, which is the
 * network's country, not where the payer says they are. A Ghanaian paying a
 * Kenyan M-Pesa number is a KE query.
 */
function walletCountry(tx: Tx): string {
  const payin = payinOf(tx);
  if (payin?.kind === "momo") {
    const n = findNetwork(payin.network);
    if (n) return n.country;
  }
  if (isCurrency(tx.send_currency)) {
    const c = currencyInfo(tx.send_currency).countries[0];
    if (c) return c;
  }
  return tx.payer_country ?? "KE";
}

/* ------------------------------ public reads ------------------------------ */

export type PublicRequest = {
  reference: string;
  businessName: string;
  amount: number | null;
  currency: Currency;
  invoiceNumber: string | null;
  memo: string | null;
  status: PaymentRequest["status"];
  usage: string;
  expiresAt: string | null;
  hasPayoutAccount: boolean;
};

/** What the pay page shows. Loaded with the service role; never a table policy. */
export async function loadPublicRequest(reference: string): Promise<PublicRequest | null> {
  const { data: pr } = await db()
    .from("payment_requests")
    .select("*, businesses(name, trading_name)")
    .eq("reference", reference)
    .maybeSingle();
  if (!pr || !isCurrency(pr.currency)) return null;
  let status = pr.status;
  if (status === "active" && pr.expires_at && new Date(pr.expires_at) < new Date()) {
    status = "expired";
    await db().from("payment_requests").update({ status }).eq("id", pr.id).eq("status", "active");
  }
  const account = await pickPayoutAccount(pr.business_id, pr.currency);
  const biz = pr.businesses as unknown as { name: string; trading_name: string | null } | null;
  return {
    reference: pr.reference,
    businessName: biz?.trading_name || biz?.name || "A Meridian business",
    amount: pr.amount === null ? null : Number(pr.amount),
    currency: pr.currency,
    invoiceNumber: pr.invoice_number,
    memo: pr.memo,
    status,
    usage: pr.usage,
    expiresAt: pr.expires_at,
    hasPayoutAccount: account !== null,
  };
}

/* ------------------------------ start attempt ----------------------------- */

export type StartResult = {
  transactionId: string;
  reference: string;
  status: TransactionStatus;
  payin: PayinDetails | null;
  totalCharged: number;
};

/**
 * Step 3 of TRD 6.2. Locks the request and numbers the attempt in the database
 * (start_collection_attempt), runs the pre-charge checks, then calls Payaza.
 * The attempt reference is saved before Payaza hears about it.
 */
export async function startAttempt(
  input: StartPaymentInput & { origin: string },
): Promise<StartResult> {
  const pub = await loadPublicRequest(input.reference);
  if (!pub) throw new CollectError("not_found", "This payment link does not exist.");
  if (pub.status !== "active")
    throw new CollectError("closed", "This payment request is no longer open.");
  if (pub.amount === null)
    throw new CollectError("open_amount", "Open-amount requests are not available yet.");
  if (!pub.hasPayoutAccount) {
    throw new CollectError(
      "no_payout_account",
      `${pub.businessName} has not added a payout account yet.`,
    );
  }

  const currency = pub.currency;
  const method = input.method as PayMethod;
  const { data: prRow } = await db()
    .from("payment_requests")
    .select("id, business_id")
    .eq("reference", input.reference)
    .single();
  if (!prRow) throw new CollectError("not_found", "This payment link does not exist.");
  const business = await loadBusiness(prRow.business_id);
  if (!business) throw new CollectError("not_found", "This payment link does not exist.");
  if (business.kyb_status === "frozen") {
    throw new CollectError("closed", "This business cannot accept payments right now.");
  }
  const payoutAccount = await pickPayoutAccount(prRow.business_id, currency);

  // Method-specific inputs, checked before anything is written.
  const payerCountry = input.payer_country.toUpperCase();
  const phone = normalisePhone(input.payer_phone ?? "");
  let network = input.network?.toUpperCase() ?? "";
  if (method === "momo") {
    const n = findNetwork(network);
    if (!n || n.currency !== currency)
      throw new CollectError("invalid", "Pick your mobile money network.");
    if (!phone)
      throw new CollectError("invalid", "Enter your mobile money number with the country code.");
  }
  if (currency === "ZAR" && method === "bank") network = network || "EFTZAR";
  if (method === "bank" && currency !== "NGN" && currency !== "ZAR") {
    throw new CollectError("invalid", "Bank transfer is not available for this currency.");
  }
  if (method === "card" && currency !== "USD" && currency !== "NGN") {
    throw new CollectError("invalid", "Card payment is only available in USD and NGN.");
  }

  const quote = quoteCollection(pub.amount, method, currency);
  const usd = usdEquivalent(pub.amount, currency);
  const hits = checksBeforeCharge({ payerCountry, usdEquivalent: usd });

  const { data: created, error } = await db().rpc("start_collection_attempt", {
    p_reference: input.reference,
    p_amount: pub.amount,
    p_total_charged: quote.payerPays,
    p_partner_fee: quote.partnerFee,
    p_meridian_fee: quote.meridianFee,
    p_usd_equivalent: usd,
    p_pay_method: method,
    p_payout_account_id: payoutAccount?.id ?? "",
    p_payer: {
      name: input.payer_name,
      email: input.payer_email,
      phone: phone || null,
      country: payerCountry,
    },
    p_quote: { ...quote, network: network || null } as unknown as Json,
  });
  if (error || !created) {
    const msg = error?.message ?? "";
    if (msg.includes("request_already_paid") || msg.includes("request_not_active")) {
      throw new CollectError("closed", "This payment request has already been paid or closed.");
    }
    if (msg.includes("request_expired"))
      throw new CollectError("closed", "This payment link has expired.");
    console.error("[collect] start_collection_attempt failed", msg);
    throw new CollectError("db", "We could not start this payment. Please try again.");
  }
  let tx = created as unknown as Tx;
  await logEvent({
    transactionId: tx.id,
    source: "system",
    from: null,
    to: "awaiting_payin",
    payload: { method, currency, totalCharged: quote.payerPays },
    key: `system:${tx.id}:created`,
  });
  await addFlags(tx, hits, business.name);

  if (strongestAction(hits) === "block") {
    const reason = hits.find((h) => h.action === "block")?.message ?? "Blocked by a check.";
    await transition(
      tx,
      "awaiting_payin",
      "blocked",
      { failure_reason: reason },
      { source: "system", payload: { hits } },
    );
    throw new CollectError("blocked", reason);
  }

  const { first, last } = splitName(input.payer_name);
  const description =
    `${business.trading_name || business.name} ${pub.invoiceNumber ?? tx.reference}`.slice(0, 100);
  let payin: PayinDetails;

  if (method === "card") {
    payin = {
      kind: "checkout",
      merchantKey: env.payazaPublicKey,
      connectionMode: env.mode === "live" ? "Live" : "Test",
      amount: quote.payerPays,
      currency,
      reference: tx.reference,
      email: input.payer_email,
      firstName: first,
      lastName: last,
      phone: phone || "0000000000",
    };
  } else if (method === "bank" && currency === "NGN") {
    const r = await payaza.createDynamicVirtualAccount({
      reference: tx.reference,
      amount: quote.payerPays,
      accountName: (business.trading_name || business.name).slice(0, 40),
      firstName: first,
      lastName: last,
      email: input.payer_email,
      phone,
      description,
      bankCode: VIRTUAL_ACCOUNT_BANK_CODE,
      expiresInMinutes: VIRTUAL_ACCOUNT_MINUTES,
      transactionId: tx.id,
    });
    const d = r.data?.data;
    if (!r.ok || !d?.account_number) {
      await failAttempt(
        tx,
        `Payaza could not create a bank account: ${r.data?.message ?? r.status}`,
        "payment",
      );
      throw new CollectError(
        "partner",
        "We could not create a bank account for this payment. Please try again.",
      );
    }
    const minutes = d.expires_in_minutes ?? VIRTUAL_ACCOUNT_MINUTES;
    payin = {
      kind: "virtual_account",
      accountNumber: d.account_number,
      accountName: d.account_name,
      bankName: d.bank_name,
      expiresAt: new Date(Date.now() + minutes * 60_000).toISOString(),
    };
  } else {
    const r = await payaza.processMomoCollection({
      reference: tx.reference,
      amount: quote.payerPays,
      currency,
      country: findNetwork(network)?.country ?? payerCountry,
      networkCode: network,
      phone,
      email: input.payer_email,
      firstName: first,
      lastName: last,
      description,
      // Wave and ZAR bring the payer back here. Payaza's edge rejects non-https
      // URLs, so a localhost origin sends none (the payer keeps this tab open).
      redirectUrl:
        (currency === "XOF" || currency === "ZAR") && input.origin.startsWith("https://")
          ? `${input.origin}/pay/${input.reference}?attempt=${tx.id}`
          : undefined,
      transactionId: tx.id,
    });
    const d = r.data;
    if (!r.ok || !d || d.response_code !== "09") {
      const why = d?.response_message ?? (r.status ? `HTTP ${r.status}` : "no response");
      await failAttempt(tx, `Payaza refused the collection: ${why}`, "payment");
      throw new CollectError(
        "partner",
        `Payaza could not start this payment (${why}). Check the number and network, then try again.`,
      );
    }
    payin = {
      kind: "momo",
      phone,
      network,
      requiresOtp: d.requires_otp === true,
      otpLength: d.otp_length ?? null,
      beforeInstruction: d.before_payment_instruction || null,
      afterInstruction: d.after_payment_instruction || null,
      paymentToken: d.payment_token ?? null,
      payee: d.payee ?? null,
      paymentMethod: d.payment_method ?? null,
      channel: d.transaction_channel ?? null,
      redirectUrl: d.redirect_customer_to_url_processing
        ? (d.payment_completion_url ?? null)
        : null,
    };
  }

  const { data: saved } = await db()
    .from("transactions")
    .update({ payin_details: payin as unknown as Json })
    .eq("id", tx.id)
    .select()
    .single();
  tx = saved ?? tx;
  return {
    transactionId: tx.id,
    reference: tx.reference,
    status: tx.status as TransactionStatus,
    payin,
    totalCharged: quote.payerPays,
  };
}

/** XOF Orange Money: the payer types the SMS code on our page and we pass it on. */
export async function submitXofOtp(transactionId: string, otp: string): Promise<void> {
  const tx = await loadTx(transactionId);
  const payin = tx ? payinOf(tx) : null;
  if (!tx || !payin || payin.kind !== "momo" || !payin.requiresOtp || !payin.paymentToken) {
    throw new CollectError("invalid", "This payment does not need a code.");
  }
  const r = await payaza.processXofOtp({
    reference: tx.reference,
    otp,
    paymentToken: payin.paymentToken,
    payee: payin.payee ?? payin.phone,
    paymentMethod: payin.paymentMethod ?? "ORANGE_CI",
    channel: payin.channel ?? "MOMCIV",
    country: findNetwork(payin.network)?.country ?? "CI",
    transactionId: tx.id,
  });
  if (!r.ok || r.data?.response_code !== "09") {
    throw new CollectError("partner", r.data?.response_message ?? "That code was not accepted.");
  }
  await db()
    .from("transactions")
    .update({ payin_details: { ...payin, otpSubmitted: true } as unknown as Json })
    .eq("id", tx.id);
}

async function failAttempt(tx: Tx, reason: string, stage: "payment" | "payout") {
  const updated = await transition(
    tx,
    ["awaiting_payin", "collected", "paying_out", "held"],
    "failed",
    { failure_reason: reason },
    { source: "system", payload: { reason, stage } },
  );
  if (!updated) return;
  const business = await loadBusiness(tx.business_id);
  const amount = formatMoney(Number(tx.send_amount), tx.send_currency as Currency);
  const facts = {
    businessName: business?.name ?? "",
    reference: tx.reference,
    amount,
    stage,
    reason,
  };
  if (stage === "payout") {
    await addFlags(
      updated,
      [
        {
          rule: "H_PAYOUT_FAILED",
          severity: "high",
          action: "none",
          evidence: { reason },
          message: reason,
        },
      ],
      facts.businessName,
    );
    if (business?.contact_email) {
      await sendEmail({
        ...transactionFailedEmail({ ...facts, forAdmin: false }),
        to: business.contact_email,
      });
    }
  }
  await sendToAdmin(transactionFailedEmail({ ...facts, forAdmin: true }));
}

/* --------------------------------- polling -------------------------------- */

export type AttemptView = {
  id: string;
  reference: string;
  status: TransactionStatus;
  payin: PayinDetails | null;
  failureReason: string | null;
  totalCharged: number;
  currency: Currency;
  method: PayMethod;
  sandbox: boolean;
  payoutSimulated: boolean;
};

const STATUS_CHECK_AFTER_MS = 15_000;
const STATUS_CHECK_EVERY_MS = 12_000;

/**
 * What the pay page polls. While a payment is waiting, this also asks Payaza
 * for the status every so often (H-27), so a late webhook does not strand the payer.
 */
export async function attemptView(transactionId: string): Promise<AttemptView | null> {
  let tx = await loadTx(transactionId);
  if (!tx) return null;
  if (tx.status === "awaiting_payin") {
    const age = Date.now() - new Date(tx.created_at).getTime();
    const quote = (tx.quote ?? {}) as Record<string, unknown>;
    const last =
      typeof quote["lastStatusCheck"] === "number" ? (quote["lastStatusCheck"] as number) : 0;
    if (age > STATUS_CHECK_AFTER_MS && Date.now() - last > STATUS_CHECK_EVERY_MS) {
      await db()
        .from("transactions")
        .update({ quote: { ...quote, lastStatusCheck: Date.now() } as NonNullable<Json> })
        .eq("id", tx.id);
      await reconcileCollection(tx, "system");
      tx = (await loadTx(transactionId)) ?? tx;
    }
  }
  const quote = (tx.quote ?? {}) as Record<string, unknown>;
  return {
    id: tx.id,
    reference: tx.reference,
    status: tx.status as TransactionStatus,
    payin: payinOf(tx),
    failureReason: tx.failure_reason,
    totalCharged: Number(tx.total_charged),
    currency: tx.send_currency as Currency,
    method: tx.pay_method as PayMethod,
    sandbox: env.mode === "sandbox",
    payoutSimulated: quote["payoutSimulated"] === true,
  };
}

/* ------------------------------ collected leg ----------------------------- */

type CollectedFacts = {
  amountReceived: number | null;
  fee: number | null;
  currency: string | null;
  payerName: string | null;
  partnerReference: string | null;
};

/**
 * Steps 4 and 5 of TRD 6.2. Called by the webhook route after the signature
 * check, and by reconciliation after a status query. Both use the same
 * idempotency key, so whichever arrives second is a no-op.
 */
export async function handleCollectionOutcome(input: {
  reference: string;
  outcome: "success" | "failed";
  facts: CollectedFacts;
  source: EventSource;
  payload: unknown;
  /** Skip the confirming status query (already confirmed by the caller). */
  confirmed?: boolean;
}): Promise<"ok" | "duplicate" | "unknown_reference" | "ignored"> {
  const tx = await loadTxByReference(input.reference);
  if (!tx) return "unknown_reference";

  const key = `payaza:collection:${input.reference}:${input.outcome}`;
  const logged = await logEvent({
    transactionId: tx.id,
    source: input.source,
    from: tx.status,
    to: null,
    payload: input.payload,
    key,
  });
  if (logged === "duplicate") return "duplicate";
  if (tx.status !== "awaiting_payin") return "ignored";

  if (input.outcome === "failed") {
    await transition(
      tx,
      "awaiting_payin",
      "failed",
      {
        failure_reason: input.facts.payerName
          ? "Payment failed"
          : "Payment failed or was cancelled",
      },
      { source: input.source, payload: input.payload },
    );
    return "ok";
  }

  // Payaza's advice: confirm a webhook with the status query before acting on it.
  let facts = input.facts;
  if (!input.confirmed) {
    const state = await payaza.collectionState({
      reference: tx.reference,
      method: tx.pay_method as PayMethod,
      currency: tx.send_currency,
      country: walletCountry(tx),
      transactionId: tx.id,
    });
    if (state.state === "failed") {
      await transition(
        tx,
        "awaiting_payin",
        "failed",
        { failure_reason: "Payaza reports the payment failed" },
        { source: input.source, payload: state.raw },
      );
      return "ok";
    }
    if (state.state === "success") {
      facts = {
        amountReceived: state.amount ?? facts.amountReceived,
        fee: state.fee ?? facts.fee,
        currency: state.currency ?? facts.currency,
        payerName: facts.payerName ?? state.payerName,
        partnerReference: facts.partnerReference,
      };
    }
    // pending/unknown: the signed webhook is the best evidence we have; proceed.
  }

  const collected = await transition(
    tx,
    "awaiting_payin",
    "collected",
    {
      collected_at: new Date().toISOString(),
      partner_fee_reported: facts.fee,
      partner_in_ref: facts.partnerReference ?? tx.partner_in_ref,
      payer_name: tx.payer_name ?? facts.payerName,
    },
    { source: input.source, payload: facts },
  );
  if (!collected) return "ignored";

  const request = collected.payment_request_id
    ? await loadRequest(collected.payment_request_id)
    : null;
  const business = await loadBusiness(collected.business_id);
  const hits = checksOnCollected({
    expectedTotal: Number(collected.total_charged),
    amountReceived: facts.amountReceived,
    currency: collected.send_currency,
    reportedCurrency: facts.currency,
    request: request
      ? { status: request.status, usage: request.usage, paidCount: request.paid_count }
      : { status: "disabled", usage: "single", paidCount: 0 },
    expectedPartnerFee: Number(collected.partner_fee_in),
    reportedPartnerFee: facts.fee,
    sandbox: env.mode === "sandbox",
  });
  await addFlags(collected, hits, business?.name ?? "");

  if (strongestAction(hits) === "hold") {
    const held = await transition(
      collected,
      "collected",
      "held",
      {},
      { source: "system", payload: { hits } },
    );
    if (held && business) {
      const amount = formatMoney(Number(held.send_amount), held.send_currency as Currency);
      const reasons = hits.filter((h) => h.action === "hold").map((h) => h.message);
      await sendToAdmin(
        transactionHeldEmail({
          businessName: business.name,
          reference: held.reference,
          amount,
          reasons,
          forAdmin: true,
        }),
      );
      if (business.contact_email) {
        await sendEmail({
          ...transactionHeldEmail({
            businessName: business.name,
            reference: held.reference,
            amount,
            reasons,
            forAdmin: false,
          }),
          to: business.contact_email,
        });
      }
    }
    return "ok";
  }

  await startPayout(collected, "system");
  return "ok";
}

/** Ask Payaza what happened and, if it has an answer, run the same path as a webhook. */
export async function reconcileCollection(tx: Tx, source: EventSource): Promise<void> {
  if (tx.status !== "awaiting_payin") return;
  const state = await payaza.collectionState({
    reference: tx.reference,
    method: tx.pay_method as PayMethod,
    currency: tx.send_currency,
    country: walletCountry(tx),
    transactionId: tx.id,
  });
  if (state.state === "pending") {
    // A dynamic virtual account never turns "Failed"; unpaid, it just expires
    // (Payaza guide, step 3a). Payaza still says "Initialized" after the expiry
    // and grace period, so no money came: close the attempt.
    const payin = payinOf(tx);
    if (payin?.kind === "virtual_account" && virtualAccountLapsed(payin.expiresAt)) {
      await transition(
        tx,
        "awaiting_payin",
        "failed",
        { failure_reason: "The bank account expired before any money arrived." },
        { source, payload: { statusQuery: state.raw, expiresAt: payin.expiresAt } },
      );
    }
    return;
  }
  if (state.state !== "success" && state.state !== "failed") return;
  await handleCollectionOutcome({
    reference: tx.reference,
    outcome: state.state,
    facts: {
      amountReceived: state.amount,
      fee: state.fee,
      currency: state.currency,
      payerName: state.payerName,
      partnerReference: null,
    },
    source,
    payload: { statusQuery: state.raw },
    confirmed: true,
  });
}

/* --------------------------------- payout --------------------------------- */

/**
 * Step 5 of TRD 6.2. The payout reference is claimed with a conditional update
 * (`where payout_reference is null`), so only one caller ever makes the Transfers
 * call. A retry with the same reference is safe: Payaza rejects a duplicate.
 */
export async function startPayout(tx: Tx, source: EventSource): Promise<void> {
  if (tx.status !== "collected") return;
  const ref = payoutReference(tx.reference);
  const { data: claimed } = await db()
    .from("transactions")
    .update({ payout_reference: ref, partner_out: "payaza" })
    .eq("id", tx.id)
    .is("payout_reference", null)
    .select()
    .maybeSingle();
  if (!claimed) return; // Someone else holds the payout.
  await executePayout(claimed, source);
}

/** Makes (or re-makes) the Transfers call for a transaction that already holds its payout reference. */
async function executePayout(tx: Tx, source: EventSource): Promise<void> {
  const ref = tx.payout_reference!;
  const business = await loadBusiness(tx.business_id);
  const account =
    (await loadPayoutAccount(tx.payout_account_id)) ??
    (await pickPayoutAccount(tx.business_id, tx.receive_currency));
  if (!business || !account) {
    await failAttempt(tx, "No payout account on file for this business.", "payout");
    return;
  }
  if (account.currency !== tx.receive_currency) {
    // Cross-currency payouts wait on Payaza's answer to open question 7 (TRD 13).
    await failAttempt(
      tx,
      `Payment is in ${tx.receive_currency} but the payout account is in ${account.currency}. Cross-currency payout is not enabled yet.`,
      "payout",
    );
    return;
  }

  if (env.payazaSimulatePayouts) {
    const quote = {
      ...((tx.quote ?? {}) as Record<string, unknown>),
      payoutSimulated: true,
    } as NonNullable<Json>;
    const paying = await transition(
      tx,
      "collected",
      "paying_out",
      { quote },
      {
        source,
        payload: {
          simulated: true,
          reason: "PAYAZA_SIMULATE_PAYOUTS is on; the sandbox merchant has no payout float.",
        },
      },
    );
    if (paying) await settle(paying, { simulated: true }, source);
    return;
  }

  const pin = env.payazaTransactionPin;
  if (!pin) {
    await failAttempt(
      tx,
      "PAYAZA_TRANSACTION_PIN is not set, so payouts cannot be authorised.",
      "payout",
    );
    return;
  }
  const rail = payoutRail(account.currency as Currency, account.method as "bank" | "momo");
  if (!rail) {
    await failAttempt(
      tx,
      `Payaza has no ${account.method} payout rail for ${account.currency}.`,
      "payout",
    );
    return;
  }
  const accounts = await payaza.mainAccounts();
  const main = accounts.find((a) => a.currency === account.currency && a.status === "ACTIVE");
  if (!main) {
    await failAttempt(
      tx,
      `Meridian has no Payaza balance in ${account.currency} to pay out from.`,
      "payout",
    );
    return;
  }

  const d = account.details as Record<string, string>;
  const r = await payaza.initiateTransfer({
    rail,
    amount: Number(tx.receive_amount),
    currency: account.currency,
    country: ISO3[account.country] ?? account.country,
    accountReference: main.payazaAccountReference,
    pin,
    beneficiary: {
      accountNumber: d["account_number"] ?? "",
      accountName: d["account_name"] ?? business.name,
      bankCode: d["bank_code"] ?? "",
    },
    narration: `Meridian ${tx.reference}`.slice(0, 50),
    reference: ref,
    sender: { name: "Meridian by Appify", phone: "254700000000", address: "Nairobi, Kenya" },
    transactionId: tx.id,
  });
  const accepted = r.ok && (r.data?.resp_code === "09" || r.data?.response_code === 200);
  if (!accepted) {
    // Payaza says to check the status before trying again. Do that before calling it failed.
    const state = await payaza.transferState(ref, tx.id);
    if (state.state === "success") {
      const paying = await transition(
        tx,
        "collected",
        "paying_out",
        { partner_out_ref: ref },
        { source, payload: r.data },
      );
      if (paying) await settle(paying, { fee: state.fee }, source);
      return;
    }
    if (state.state === "pending") {
      await transition(
        tx,
        "collected",
        "paying_out",
        { partner_out_ref: ref },
        { source, payload: r.data },
      );
      return;
    }
    await failAttempt(
      tx,
      `Payaza refused the payout: ${r.data?.response_message ?? `HTTP ${r.status}`}`,
      "payout",
    );
    return;
  }
  await transition(
    tx,
    "collected",
    "paying_out",
    { partner_out_ref: ref },
    { source, payload: r.data },
  );
}

/** Step 6 of TRD 6.2. Transfer confirmed. Receipts to both sides, request marked paid. */
async function settle(
  tx: Tx,
  facts: { fee?: number | null; simulated?: boolean },
  source: EventSource,
): Promise<void> {
  const settled = await transition(
    tx,
    "paying_out",
    "settled",
    { settled_at: new Date().toISOString(), partner_fee_out: facts.fee ?? tx.partner_fee_out },
    { source, payload: facts },
  );
  if (!settled) return;

  if (settled.payment_request_id) {
    const { error } = await db().rpc("mark_request_paid", {
      p_request_id: settled.payment_request_id,
    });
    if (error) console.error("[collect] mark_request_paid failed", error.message);
  }

  const business = await loadBusiness(settled.business_id);
  const request = settled.payment_request_id ? await loadRequest(settled.payment_request_id) : null;
  const account = await loadPayoutAccount(settled.payout_account_id);
  const cur = settled.send_currency as Currency;
  const factsForEmail = {
    businessName: business?.trading_name || business?.name || "",
    reference: request?.reference ?? settled.reference.slice(0, 12),
    attemptReference: settled.reference,
    invoiceNumber: request?.invoice_number ?? null,
    memo: request?.memo ?? null,
    amount: formatMoney(Number(settled.send_amount), cur),
    totalCharged: formatMoney(Number(settled.total_charged), cur),
    totalFees: formatMoney(Number(settled.partner_fee_in) + Number(settled.meridian_fee), cur),
    method: METHOD_LABEL[settled.pay_method as PayMethod],
    payerName: settled.payer_name,
    payerEmail: settled.payer_email,
    settledAt: new Date(settled.settled_at ?? Date.now()).toUTCString(),
    payoutAccount: describePayoutAccount(account),
    sandbox: env.mode === "sandbox",
  };
  const sends: Promise<unknown>[] = [];
  if (settled.payer_email)
    sends.push(sendEmail({ ...payerReceipt(factsForEmail), to: settled.payer_email }));
  if (business?.contact_email)
    sends.push(sendEmail({ ...businessReceipt(factsForEmail), to: business.contact_email }));
  await Promise.all(sends);
}

/** Webhook or status query said something about a transfer. */
export async function handleTransferOutcome(input: {
  reference: string;
  outcome: "success" | "failed" | "pending";
  fee: number | null;
  message: string | null;
  source: EventSource;
  payload: unknown;
  confirmed?: boolean;
}): Promise<"ok" | "duplicate" | "unknown_reference" | "ignored"> {
  const tx = await loadTxByPayoutReference(input.reference);
  if (!tx) return "unknown_reference";
  if (input.outcome === "pending") return "ignored";

  const logged = await logEvent({
    transactionId: tx.id,
    source: input.source,
    from: tx.status,
    to: null,
    payload: input.payload,
    key: `payaza:transfer:${input.reference}:${input.outcome}`,
  });
  if (logged === "duplicate") return "duplicate";
  if (tx.status !== "paying_out" && tx.status !== "collected") return "ignored";

  let outcome = input.outcome;
  let fee = input.fee;
  if (!input.confirmed) {
    const state = await payaza.transferState(input.reference, tx.id);
    if (state.state === "success" || state.state === "failed") {
      outcome = state.state;
      fee = state.fee ?? fee;
    }
  }

  if (outcome === "success") {
    const paying =
      tx.status === "collected"
        ? await transition(tx, "collected", "paying_out", {}, { source: input.source })
        : tx;
    if (paying) await settle(paying, { fee }, input.source);
    return "ok";
  }
  await failAttempt(
    tx,
    `Payaza reports the payout failed${input.message ? `: ${input.message}` : ""}.`,
    "payout",
  );
  return "ok";
}

/* ---------------------------------- jobs ---------------------------------- */

/**
 * /api/jobs/payout-retry (TRD 11). Three sweeps:
 *   1. collected, no payout reference, older than 2 min: the payout never started. Start it.
 *   2. collected, has a payout reference: the call died mid-way. Ask Payaza, then retry with the same reference.
 *   3. paying_out older than 10 min: ask Payaza and settle or fail.
 * Also nudges awaiting_payin attempts older than 2 min with a status query.
 */
export async function runPayoutRetry(): Promise<{
  started: number;
  resumed: number;
  checked: number;
  reconciled: number;
}> {
  const out = { started: 0, resumed: 0, checked: 0, reconciled: 0 };
  const twoMinAgo = new Date(Date.now() - 2 * 60_000).toISOString();
  const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();

  const { data: collected } = await db()
    .from("transactions")
    .select()
    .eq("status", "collected")
    .lt("updated_at", twoMinAgo)
    .limit(50);
  for (const tx of collected ?? []) {
    if (!tx.payout_reference) {
      await startPayout(tx, "job");
      out.started++;
    } else {
      const state = await payaza.transferState(tx.payout_reference, tx.id);
      if (state.state === "not_found") {
        await executePayout(tx, "job");
        out.resumed++;
      } else if (state.state === "success" || state.state === "failed") {
        await handleTransferOutcome({
          reference: tx.payout_reference,
          outcome: state.state,
          fee: state.fee,
          message: state.message,
          source: "job",
          payload: state.raw,
          confirmed: true,
        });
        out.resumed++;
      }
    }
  }

  const { data: paying } = await db()
    .from("transactions")
    .select()
    .eq("status", "paying_out")
    .lt("updated_at", tenMinAgo)
    .limit(50);
  for (const tx of paying ?? []) {
    if (!tx.payout_reference) continue;
    const state = await payaza.transferState(tx.payout_reference, tx.id);
    out.checked++;
    if (state.state === "success" || state.state === "failed") {
      await handleTransferOutcome({
        reference: tx.payout_reference,
        outcome: state.state,
        fee: state.fee,
        message: state.message,
        source: "job",
        payload: state.raw,
        confirmed: true,
      });
    }
  }

  const { data: waiting } = await db()
    .from("transactions")
    .select()
    .eq("status", "awaiting_payin")
    .lt("created_at", twoMinAgo)
    .gt("created_at", new Date(Date.now() - 24 * 3600_000).toISOString())
    .limit(50);
  for (const tx of waiting ?? []) {
    await reconcileCollection(tx, "job");
    out.reconciled++;
  }
  return out;
}

/* ---------------------------------- admin --------------------------------- */

export async function adminRelease(tx: Tx, adminId: string, note: string): Promise<void> {
  if (tx.status !== "held")
    throw new CollectError("invalid", "Only a held payment can be released.");
  await db()
    .from("aml_flags")
    .update({
      status: "cleared",
      resolved_by: adminId,
      resolved_at: new Date().toISOString(),
      note: note || null,
    })
    .eq("transaction_id", tx.id)
    .eq("status", "open");
  const collected = await transition(
    tx,
    "held",
    "collected",
    {},
    { source: "admin", payload: { note, adminId } },
  );
  if (collected) await startPayout(collected, "admin");
}

export async function adminReject(tx: Tx, adminId: string, note: string): Promise<void> {
  if (tx.status !== "held")
    throw new CollectError("invalid", "Only a held payment can be rejected.");
  await db()
    .from("aml_flags")
    .update({
      status: "escalated",
      resolved_by: adminId,
      resolved_at: new Date().toISOString(),
      note: note || null,
    })
    .eq("transaction_id", tx.id)
    .eq("status", "open");
  await transition(
    tx,
    "held",
    "failed",
    { failure_reason: `Rejected by admin${note ? `: ${note}` : ""}. Refund due.` },
    { source: "admin", payload: { note, adminId } },
  );
}

export async function adminRetryPayout(tx: Tx, adminId: string): Promise<void> {
  if (tx.status !== "failed" || !tx.collected_at)
    throw new CollectError("invalid", "Only a failed payout can be retried.");
  const back = await transition(
    tx,
    "failed",
    "collected",
    { failure_reason: null },
    { source: "admin", payload: { adminId, action: "retry_payout" } },
  );
  if (!back) return;
  if (back.payout_reference) {
    const state = await payaza.transferState(back.payout_reference, back.id);
    if (state.state === "success") {
      await handleTransferOutcome({
        reference: back.payout_reference,
        outcome: "success",
        fee: state.fee,
        message: state.message,
        source: "admin",
        payload: state.raw,
        confirmed: true,
      });
      return;
    }
    if (state.state === "pending") {
      await transition(
        back,
        "collected",
        "paying_out",
        {},
        { source: "admin", payload: state.raw },
      );
      return;
    }
    await executePayout(back, "admin");
    return;
  }
  await startPayout(back, "admin");
}

export async function adminMarkRefunded(tx: Tx, adminId: string, note: string): Promise<void> {
  if (tx.status !== "failed" && tx.status !== "held")
    throw new CollectError("invalid", "Only a failed or held payment can be marked refunded.");
  await transition(
    tx,
    ["failed", "held"],
    "refunded",
    {},
    { source: "admin", payload: { note, adminId } },
  );
}

/* -------------------------------- sandbox --------------------------------- */

/**
 * Sandbox only. Records a bank transfer into a test virtual account that Payaza's
 * sandbox would not fund. The event payload and the quote both say "simulated",
 * so the history shows plainly that Payaza did not confirm this money.
 */
async function simulateVirtualAccountPayment(tx: Tx, payazaMessage: string): Promise<void> {
  if (env.mode !== "sandbox") throw new CollectError("invalid", "Only in sandbox mode.");
  const reason = `Payaza's sandbox would not fund the test account (${payazaMessage}), so Meridian simulated the transfer.`;
  await db()
    .from("transactions")
    .update({
      quote: {
        ...((tx.quote ?? {}) as Record<string, unknown>),
        collectionSimulated: true,
      } as NonNullable<Json>,
    })
    .eq("id", tx.id);
  await handleCollectionOutcome({
    reference: tx.reference,
    outcome: "success",
    facts: {
      amountReceived: Number(tx.total_charged),
      fee: null,
      currency: tx.send_currency,
      payerName: tx.payer_name,
      partnerReference: null,
    },
    source: "system",
    payload: { simulated: true, reason },
    confirmed: true,
  });
}

/** Sandbox only: plays the payer approving on their phone or paying the virtual account. */
export async function simulatePayerApproval(transactionId: string): Promise<void> {
  if (env.mode !== "sandbox") throw new CollectError("invalid", "Only in sandbox mode.");
  const tx = await loadTx(transactionId);
  const payin = tx ? payinOf(tx) : null;
  if (!tx || !payin || tx.status !== "awaiting_payin")
    throw new CollectError("invalid", "Nothing to approve.");
  if (payin.kind === "momo") {
    const country = findNetwork(payin.network)?.country ?? tx.payer_country ?? "KE";
    const r = await payaza.fundTestCollection(tx.reference, country, tx.id);
    if (r.data?.response_code !== "00")
      throw new CollectError(
        "partner",
        r.data?.response_message ?? "Payaza did not accept the test funding.",
      );
  } else if (payin.kind === "virtual_account") {
    const r = await payaza.fundTestVirtualAccount({
      accountName: payin.accountName,
      accountNumber: payin.accountNumber,
      reference: tx.reference,
      amount: Number(tx.total_charged),
      payerName: tx.payer_name ?? "Test Payer",
      transactionId: tx.id,
    });
    if (!r.data?.success) {
      // Payaza's sandbox refuses to fund dynamic accounts ("Failed to fund virtual
      // account" on 78 Finance, "Providus funding NA-01" on Globus), even with the
      // documented request. Checked 29 September 2026. So in sandbox we record the
      // transfer ourselves, marked simulated, and carry on as the webhook would.
      await simulateVirtualAccountPayment(tx, r.data?.message ?? `HTTP ${r.status}`);
      return;
    }
  } else {
    throw new CollectError("invalid", "Use a Payaza test card in the checkout.");
  }
  // Payaza sends the webhook. If it cannot reach us (no tunnel), the poll reconciles.
  await reconcileCollection((await loadTx(tx.id)) ?? tx, "system");
}

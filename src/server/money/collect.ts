import "server-only";
import type { CheckHit } from "~/lib/checks";
import type { Json, Tables } from "~/lib/database.types";
import { METHOD_LABEL, formatMoney, isCurrency, type Currency, type PayMethod } from "~/lib/fees";
import type { TransactionStatus } from "~/lib/status";
import { sendEmail, sendToAdmin } from "../email/send";
import { businessReceipt, flagAlertEmail, payerReceipt } from "../email/templates";
import { env } from "../env";
import type { PayinInstructions } from "../partners/adapters";
import { supabaseAdmin } from "../supabase";

// The payment state machine (TRD 6.2 and 6.4), shared by every routed provider.
// Taking the money in and paying it out are each provider's own (routed.ts and
// partners/adapters.ts); this holds the moves between statuses, the checks,
// settling, and what the pay page and admin read. Every status change is a
// conditional update: `where id = $1 and status = $expected`. Zero rows means
// someone else got there first, and the caller stops. Every change also writes
// a transaction_events row. Webhooks land in transaction_events before anything
// else, so a repeat hits the unique key and does nothing.

export type Tx = Tables<"transactions">;
export type PaymentRequest = Tables<"payment_requests">;
export type Business = Tables<"businesses">;
export type PayoutAccount = Tables<"payout_accounts">;

export type EventSource =
  "system" | "kotani_webhook" | "yellowcard_webhook" | "klasha_webhook" | "admin" | "job";

/** What the payer needs to finish paying. Stored on transactions.payin_details. */
export type PayinDetails = PayinInstructions;

export class CollectError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const ROUTED_METHOD_LABEL: Record<string, string> = {
  virtual_account: "International bank transfer",
  wallet: "Alipay / WeChat Pay",
};

/* --------------------------------- helpers -------------------------------- */

const db = () => supabaseAdmin();

export async function logEvent(input: {
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
export async function transition(
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

export async function addFlags(tx: Tx, hits: CheckHit[], businessName: string) {
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

export async function loadTx(id: string): Promise<Tx | null> {
  const { data } = await db().from("transactions").select().eq("id", id).maybeSingle();
  return data ?? null;
}

async function loadRequest(id: string): Promise<PaymentRequest | null> {
  const { data } = await db().from("payment_requests").select().eq("id", id).maybeSingle();
  return data ?? null;
}

export async function loadBusiness(id: string): Promise<Business | null> {
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

function payinOf(tx: Tx): PayinDetails | null {
  return (tx.payin_details as PayinDetails | null) ?? null;
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

/* --------------------------------- polling -------------------------------- */

export type AttemptView = {
  id: string;
  reference: string;
  status: TransactionStatus;
  payin: PayinDetails | null;
  failureReason: string | null;
  totalCharged: number;
  /** The payer's currency. */
  currency: Currency | (string & {});
  method: PayMethod | "virtual_account" | "wallet";
  sandbox: boolean;
  payoutSimulated: boolean;
  /** Set for a routed payment: the provider carrying it, and those tried before it. */
  provider: string | null;
  attempts: { provider: string; ok: boolean; error?: string }[];
};

/**
 * What the pay page polls. The page's poll asks the provider about a late
 * payment first (pollRoutedStatus in routed.ts); this only reads.
 */
export async function attemptView(transactionId: string): Promise<AttemptView | null> {
  const tx = await loadTx(transactionId);
  if (!tx) return null;
  const quote = (tx.quote ?? {}) as Record<string, unknown>;
  return {
    id: tx.id,
    reference: tx.reference,
    status: tx.status as TransactionStatus,
    payin: payinOf(tx),
    failureReason: tx.failure_reason,
    totalCharged: Number(tx.total_charged),
    currency: tx.send_currency,
    method: tx.pay_method as AttemptView["method"],
    sandbox: env.mode === "sandbox",
    payoutSimulated: quote["payoutSimulated"] === true,
    provider: tx.partner_in,
    attempts: Array.isArray(quote["attempts"])
      ? (quote["attempts"] as AttemptView["attempts"])
      : [],
  };
}

export async function settle(
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
  const cur = settled.send_currency;
  const factsForEmail = {
    businessName: business?.trading_name || business?.name || "",
    reference: request?.reference ?? settled.reference.slice(0, 12),
    attemptReference: settled.reference,
    invoiceNumber: request?.invoice_number ?? null,
    memo: request?.memo ?? null,
    // What the business gets, in its currency. A routed payer may have paid in another currency.
    amount: formatMoney(Number(settled.receive_amount), settled.receive_currency),
    totalCharged: formatMoney(Number(settled.total_charged), cur),
    totalFees: formatMoney(Number(settled.partner_fee_in) + Number(settled.meridian_fee), cur),
    method:
      METHOD_LABEL[settled.pay_method as PayMethod] ??
      ROUTED_METHOD_LABEL[settled.pay_method] ??
      settled.pay_method,
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

/* ---------------------------------- admin --------------------------------- */

/** `payout` starts the payout once released, through the provider holding the money. */
export async function adminRelease(
  tx: Tx,
  adminId: string,
  note: string,
  payout: (tx: Tx, source: EventSource) => Promise<void>,
): Promise<void> {
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
  if (collected) await payout(collected, "admin");
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

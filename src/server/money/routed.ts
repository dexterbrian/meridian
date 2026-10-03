import "server-only";
import { checksBeforeCharge, strongestAction } from "~/lib/checks";
import type { Json, Tables } from "~/lib/database.types";
import { currency as currencyInfo, isCurrency } from "~/lib/fees";
import type { Recipient } from "~/lib/partner-requests";
import { provider as providerProfile, type ProviderId, type Rail } from "~/lib/providers";
import { makeTransferReference } from "~/lib/reference";
import {
  REFERENCE_PER_USD,
  executeWithFallback,
  priceRoute,
  type Attempt,
  type RoutePlan,
  type RouteQuote,
  type RouteRequest,
} from "~/lib/routing";
import { env } from "../env";
import { ADAPTERS, type PayinInstructions } from "../partners/adapters";
import { supabaseAdmin } from "../supabase";
import {
  CollectError,
  loadBusiness,
  loadTx,
  pickPayoutAccount,
  settle,
  transition,
  type EventSource,
  type PayoutAccount,
  type Tx,
} from "./collect";
import { planRoute } from "./router";

// Payments carried by a routed provider (Kotani, Yellow Card, Klasha, Minisend),
// in both directions:
//  - a payer abroad or in another African currency pays a Meridian request, and
//    the business still receives the exact request amount in its own currency;
//  - a business pays a supplier, at home or abroad (EUR, USD, JPY, CNY ...).
//
// Each payment uses one provider end to end (PRD 5.6: no float to mix
// providers). Fallback happens when the payment is opened: providers are tried
// cheapest first, and one that is down or refuses hands over to the next. Once
// the payer has paid a provider, that provider pays out; if it then fails, the
// money is with it, so the payment is marked failed for an admin rather than
// sent again through someone else.

const db = () => supabaseAdmin();

const WHOLE = new Set(["JPY", "IDR", "LKR", "RWF", "MWK"]);
const wholeUnits = (c: string) =>
  isCurrency(c) ? currencyInfo(c).chargeDecimals === 0 : WHOLE.has(c);
const toUsd = (amount: number, c: string) =>
  Math.round((amount / (REFERENCE_PER_USD[c] ?? 1)) * 100) / 100;

/* --------------------------------- quotes --------------------------------- */

export type PricedQuote = RouteQuote & {
  providerName: string;
  price: ReturnType<typeof priceRoute>;
};

export type PricedPlan = {
  request: RouteRequest;
  /** Cheapest first. [0] is used; the rest are fallbacks in order. */
  quotes: PricedQuote[];
  unavailable: { provider: ProviderId; providerName: string; reason: string }[];
};

function priced(plan: RoutePlan): PricedPlan {
  return {
    request: plan.request,
    quotes: plan.quotes.map((q) => ({
      ...q,
      providerName: providerProfile(q.provider).name,
      price: priceRoute(q, wholeUnits(q.sendCurrency)),
    })),
    unavailable: plan.unavailable.map((u) => ({
      ...u,
      providerName: providerProfile(u.provider).name,
    })),
  };
}

export async function quoteRoute(req: RouteRequest): Promise<PricedPlan> {
  return priced(await planRoute(req));
}

/* ------------------------------- recipients ------------------------------- */

type RecipientRow = Tables<"recipients">;

/** A business's payout account, as somewhere a routed provider can pay. */
export function recipientFromAccount(a: PayoutAccount, fallbackName: string): Recipient {
  const d = (a.details ?? {}) as Record<string, string | undefined>;
  return {
    name: d["account_name"] || fallbackName,
    country: a.country,
    currency: a.currency,
    rail: a.method === "momo" ? "momo" : "bank",
    accountNumber: d["account_number"] ?? "",
    bankName: d["bank_name"],
    bankCode: d["bank_code"],
    network: a.method === "momo" ? d["bank_name"] : undefined,
  };
}

export function recipientFromRow(r: RecipientRow): Recipient {
  const d = (r.details ?? {}) as Record<string, string | undefined>;
  return {
    name: r.name,
    country: r.country,
    currency: r.currency,
    rail: r.method as Recipient["rail"],
    accountNumber: d["account_number"] ?? "",
    bankName: d["bank_name"],
    bankCode: d["bank_code"],
    network: d["network"],
    swiftCode: d["swift_code"],
    iban: d["iban"],
    address: d["address"],
    email: d["email"],
  };
}

/* --------------------------------- opening -------------------------------- */

type Stored = {
  routed: true;
  plan: PricedPlan;
  chosen?: ProviderId;
  attempts?: Attempt[];
  payoutSimulated?: boolean;
  collectionSimulated?: boolean;
};

/**
 * Asks each provider, cheapest first, for the payer's instructions. Nothing has
 * moved yet, so a provider that fails just hands over to the next.
 */
async function openWithFallback(
  tx: Tx,
  plan: PricedPlan,
  rail: Rail,
  payoutTo: Recipient,
  source: EventSource,
): Promise<Tx> {
  const stored = (tx.quote ?? {}) as unknown as Stored;
  try {
    const { result, quote, attempts } = await executeWithFallback(plan.quotes, (q) =>
      ADAPTERS[q.provider].collect({
        quote: q,
        rail,
        reference: tx.reference,
        payoutTo,
        transactionId: tx.id,
      }),
    );
    const q = quote as PricedQuote;
    const payin: PayinInstructions = { ...result, amount: q.price.total };
    const next = await transition(
      tx,
      tx.status as "quoted" | "awaiting_payin",
      "awaiting_payin",
      {
        partner_in: q.provider,
        partner_out: q.provider,
        send_currency: q.sendCurrency,
        send_amount: q.price.amount,
        partner_fee_in: q.price.providerFee,
        meridian_fee: q.price.meridianFee,
        total_charged: q.price.total,
        usd_equivalent: toUsd(q.price.total, q.sendCurrency),
        payin_details: payin as unknown as NonNullable<Json>,
        quote_expires_at: q.expiresAt,
        quote: { ...stored, chosen: q.provider, attempts } as unknown as NonNullable<Json>,
      },
      { source, payload: { provider: q.provider, attempts, simulated: result.simulated } },
    );
    if (!next)
      throw new CollectError("conflict", "This payment changed while it was being opened.");
    return next;
  } catch (e) {
    if (e instanceof CollectError) throw e;
    const attempts = (e as { attempts?: Attempt[] }).attempts ?? [];
    const reason = `No provider could take this payment: ${attempts
      .map((a) => `${providerProfile(a.provider).name} (${a.error ?? "failed"})`)
      .join("; ")}`;
    await transition(
      tx,
      tx.status as "quoted" | "awaiting_payin",
      "failed",
      { failure_reason: reason, quote: { ...stored, attempts } as unknown as NonNullable<Json> },
      { source, payload: { attempts } },
    );
    throw new CollectError(
      "partner",
      "No provider could take this payment right now. Please try again shortly.",
    );
  }
}

/* ------------------------- routed request payments ------------------------ */

export type RoutedPayInput = {
  reference: string;
  currency: string;
  rail: Rail;
  payer_name: string;
  payer_email: string;
  payer_phone?: string;
  payer_country: string;
};

/** Where a request's money lands: the business's payout account for the request currency. */
async function requestDestination(reference: string) {
  const { data: pr } = await db()
    .from("payment_requests")
    .select()
    .eq("reference", reference)
    .maybeSingle();
  if (!pr) throw new CollectError("not_found", "This payment link does not exist.");
  if (pr.status !== "active")
    throw new CollectError("closed", "This payment request is no longer open.");
  if (pr.amount === null)
    throw new CollectError("open_amount", "Open-amount requests are not available yet.");
  const business = await loadBusiness(pr.business_id);
  if (!business || business.kyb_status === "frozen")
    throw new CollectError("closed", "This business cannot accept payments right now.");
  const account = await pickPayoutAccount(pr.business_id, pr.currency);
  if (!account || account.currency !== pr.currency)
    throw new CollectError(
      "no_payout_account",
      `${business.name} has no ${pr.currency} payout account yet.`,
    );
  const recipient = recipientFromAccount(account, business.name);
  const req: RouteRequest = {
    from: { currency: "", rail: "virtual_account" },
    to: { currency: recipient.currency, rail: recipient.rail, country: recipient.country },
    amount: Number(pr.amount),
    side: "receive",
  };
  return { pr, business, account, recipient, req };
}

/** The ranked quotes a payer sees before choosing to pay in another currency. */
export async function quoteRequestPayment(input: {
  reference: string;
  currency: string;
  rail: Rail;
  country?: string;
}): Promise<PricedPlan> {
  const { req } = await requestDestination(input.reference);
  return quoteRoute({
    ...req,
    from: { currency: input.currency, rail: input.rail, country: input.country },
  });
}

/** Starts a routed attempt on a payment request. The business still receives the exact request amount. */
export async function startRoutedPayment(input: RoutedPayInput): Promise<{
  transactionId: string;
  reference: string;
}> {
  const { account, recipient, req } = await requestDestination(input.reference);
  const payerCountry = input.payer_country.toUpperCase();
  const plan = await quoteRoute({
    ...req,
    from: { currency: input.currency, rail: input.rail, country: payerCountry },
  });
  const top = plan.quotes[0];
  if (!top)
    throw new CollectError("no_route", `No provider can take ${input.currency} for this payment.`);

  const hits = checksBeforeCharge({
    payerCountry,
    usdEquivalent: toUsd(top.price.total, top.sendCurrency),
  });
  if (strongestAction(hits) === "block") {
    throw new CollectError(
      "blocked",
      hits.find((h) => h.action === "block")?.message ?? "Blocked by a check.",
    );
  }

  const { data, error } = await db().rpc("start_routed_attempt", {
    p_reference: input.reference,
    p_receive_amount: req.amount,
    p_send_currency: top.sendCurrency,
    p_send_amount: top.price.amount,
    p_total_charged: top.price.total,
    p_partner_fee: top.price.providerFee,
    p_meridian_fee: top.price.meridianFee,
    p_usd_equivalent: toUsd(top.price.total, top.sendCurrency),
    p_pay_method: input.rail,
    p_partner: top.provider,
    p_payout_account_id: account.id,
    p_payer: {
      name: input.payer_name,
      email: input.payer_email,
      phone: input.payer_phone || null,
      country: payerCountry,
    },
    p_quote: { routed: true, plan } as unknown as NonNullable<Json>,
  });
  if (error || !data) {
    const msg = error?.message ?? "";
    if (msg.includes("request_already_paid") || msg.includes("request_not_active"))
      throw new CollectError("closed", "This payment request has already been paid or closed.");
    if (msg.includes("request_expired"))
      throw new CollectError("closed", "This payment link has expired.");
    console.error("[routed] start_routed_attempt failed", msg);
    throw new CollectError("db", "We could not start this payment. Please try again.");
  }
  const tx = await openWithFallback(data as unknown as Tx, plan, input.rail, recipient, "system");
  return { transactionId: tx.id, reference: tx.reference };
}

/* -------------------------------- transfers ------------------------------- */

export type TransferInput = {
  recipientId: string;
  fromCurrency: string;
  fromRail: Rail;
  amount: number;
  idempotencyKey: string;
};

async function loadRecipient(businessId: string, id: string): Promise<RecipientRow | null> {
  const { data } = await db()
    .from("recipients")
    .select()
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  return data ?? null;
}

export function transferRequest(
  business: { country: string | null },
  r: RecipientRow,
  from: { currency: string; rail: Rail },
  amount: number,
): RouteRequest {
  return {
    from: { currency: from.currency, rail: from.rail, country: business.country ?? undefined },
    to: { currency: r.currency, rail: r.method as Rail, country: r.country },
    amount,
    side: "receive",
  };
}

export async function quoteTransfer(
  businessId: string,
  input: Omit<TransferInput, "idempotencyKey">,
): Promise<PricedPlan> {
  const business = await loadBusiness(businessId);
  const r = await loadRecipient(businessId, input.recipientId);
  if (!business || !r) throw new CollectError("not_found", "Pick a recipient.");
  return quoteRoute(
    transferRequest(
      business,
      r,
      { currency: input.fromCurrency, rail: input.fromRail },
      input.amount,
    ),
  );
}

/**
 * A business pays a supplier. The supplier receives exactly `amount` in their
 * currency; the business pays the cheapest provider's price plus Meridian's 1%.
 * A repeat with the same idempotency key returns the first transfer.
 */
export async function createTransfer(businessId: string, input: TransferInput): Promise<Tx> {
  const { data: existing } = await db()
    .from("transactions")
    .select()
    .eq("business_id", businessId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existing) return existing;

  const business = await loadBusiness(businessId);
  const r = await loadRecipient(businessId, input.recipientId);
  if (!business || !r) throw new CollectError("not_found", "Pick a recipient.");
  if (business.kyb_status === "frozen")
    throw new CollectError("closed", "This business cannot send payments right now.");
  const plan = await quoteRoute(
    transferRequest(
      business,
      r,
      { currency: input.fromCurrency, rail: input.fromRail },
      input.amount,
    ),
  );
  const top = plan.quotes[0];
  if (!top)
    throw new CollectError(
      "no_route",
      `No provider can pay ${r.currency} to ${r.country} from ${input.fromCurrency}.`,
    );

  const { data: tx, error } = await db()
    .from("transactions")
    .insert({
      business_id: businessId,
      kind: "transfer",
      status: "quoted",
      reference: makeTransferReference(),
      idempotency_key: input.idempotencyKey,
      recipient_id: r.id,
      send_currency: top.sendCurrency,
      send_amount: top.price.amount,
      receive_currency: r.currency,
      receive_amount: input.amount,
      partner_fee_in: top.price.providerFee,
      meridian_fee: top.price.meridianFee,
      total_charged: top.price.total,
      usd_equivalent: toUsd(top.price.total, top.sendCurrency),
      partner_in: top.provider,
      partner_out: top.provider,
      pay_method: input.fromRail,
      payer_name: business.trading_name || business.name,
      payer_email: business.contact_email,
      payer_country: business.country,
      quote: { routed: true, plan } as unknown as NonNullable<Json>,
    })
    .select()
    .single();
  if (error || !tx) {
    if (error?.code === "23505") {
      const { data: again } = await db()
        .from("transactions")
        .select()
        .eq("business_id", businessId)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (again) return again;
    }
    console.error("[routed] transfer insert failed", error?.message);
    throw new CollectError("db", "We could not create this transfer. Please try again.");
  }
  return openWithFallback(tx, plan, input.fromRail, recipientFromRow(r), "system");
}

/* ----------------------------- money arriving ----------------------------- */

/**
 * The payer's money reached the provider (its webhook, or the sandbox button).
 * The same provider then pays the recipient.
 */
export async function routedPayinReceived(
  tx: Tx,
  source: EventSource,
  facts: { simulated: boolean; payload?: unknown },
): Promise<void> {
  const stored = (tx.quote ?? {}) as unknown as Stored;
  const collected = await transition(
    tx,
    "awaiting_payin",
    "collected",
    {
      collected_at: new Date().toISOString(),
      quote: { ...stored, collectionSimulated: facts.simulated } as unknown as NonNullable<Json>,
    },
    { source, payload: facts.payload ?? { simulated: facts.simulated } },
  );
  if (!collected) return;
  await routedPayout(collected, source);
}

async function payoutRecipient(tx: Tx): Promise<Recipient | null> {
  if (tx.kind === "transfer") {
    const r = tx.recipient_id ? await loadRecipient(tx.business_id, tx.recipient_id) : null;
    return r ? recipientFromRow(r) : null;
  }
  const business = await loadBusiness(tx.business_id);
  const { data: account } = tx.payout_account_id
    ? await db().from("payout_accounts").select().eq("id", tx.payout_account_id).maybeSingle()
    : { data: null };
  return account && business ? recipientFromAccount(account, business.name) : null;
}

async function routedPayout(tx: Tx, source: EventSource): Promise<void> {
  const provider = tx.partner_out as ProviderId | null;
  const stored = (tx.quote ?? {}) as unknown as Stored;
  const quote = stored.plan?.quotes.find((q) => q.provider === provider);
  const recipient = await payoutRecipient(tx);
  const ref = `${tx.reference}-P`;
  const { data: claimed } = await db()
    .from("transactions")
    .update({ payout_reference: ref })
    .eq("id", tx.id)
    .is("payout_reference", null)
    .select()
    .maybeSingle();
  if (!claimed) return; // Someone else holds the payout.

  if (!provider || !quote || !recipient) {
    await transition(
      claimed,
      "collected",
      "failed",
      { failure_reason: "No route or recipient on file for the payout." },
      { source },
    );
    return;
  }
  try {
    const out = await ADAPTERS[provider].payout({
      quote,
      recipient,
      reference: ref,
      transactionId: tx.id,
    });
    const paying = await transition(
      claimed,
      "collected",
      "paying_out",
      {
        partner_out_ref: out.partnerRef,
        quote: { ...stored, payoutSimulated: out.simulated } as unknown as NonNullable<Json>,
      },
      { source, payload: { provider, partnerRef: out.partnerRef, simulated: out.simulated } },
    );
    // A live provider confirms by webhook; a simulated one is done now.
    if (paying && out.simulated) await finish(paying, source);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await transition(
      claimed,
      "collected",
      "failed",
      {
        failure_reason: `${providerProfile(provider).name} could not pay out: ${message}. The money is with ${providerProfile(provider).name}; an admin will retry or refund.`,
      },
      { source, payload: { provider, error: message } },
    );
  }
}

async function finish(tx: Tx, source: EventSource): Promise<void> {
  if (tx.kind === "collection") {
    await settle(tx, { simulated: true }, source);
    return;
  }
  const done = await transition(
    tx,
    "paying_out",
    "settled",
    { settled_at: new Date().toISOString() },
    { source, payload: { simulated: true } },
  );
  if (done?.recipient_id) {
    await db()
      .from("recipients")
      .update({ first_paid_at: done.settled_at })
      .eq("id", done.recipient_id)
      .is("first_paid_at", null);
  }
}

/** Sandbox only: plays the payer's money reaching the provider. */
export async function simulateRoutedPayin(transactionId: string): Promise<void> {
  if (env.mode !== "sandbox") throw new CollectError("invalid", "Only in sandbox mode.");
  const tx = await loadTx(transactionId);
  if (!tx || tx.status !== "awaiting_payin" || !tx.partner_in || tx.partner_in === "payaza")
    throw new CollectError("invalid", "Nothing to approve.");
  await routedPayinReceived(tx, "system", {
    simulated: true,
    payload: {
      simulated: true,
      reason: "Sandbox: Meridian played the payer's money reaching the provider.",
    },
  });
}

export function isRouted(tx: Pick<Tx, "partner_in">): boolean {
  return !!tx.partner_in && tx.partner_in !== "payaza";
}

// Choosing a provider. Every provider that can carry a payment is asked for a
// quote; the quotes are ranked cheapest first and the rest kept, in order, as
// fallbacks. Pure: the server fetches the quotes, this decides between them.
//
// "Cheapest" means the best outcome for the people paying, not the lowest
// headline fee: with the recipient's amount fixed (Meridian's promise, PRD 5.3)
// the winner is whoever needs the smallest amount from the payer; with the
// payer's amount fixed, whoever delivers the most to the recipient. That folds
// fees, FX spread and fixed charges into one number.

import { MERIDIAN_FEE } from "./fees";
import { PROVIDERS, providersFor, type Basis, type Endpoint, type ProviderId } from "./providers";

/** Reference units per USD, for estimates and "cost vs mid-market". Not a trading rate. */
// prettier-ignore
export const REFERENCE_PER_USD: Record<string, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149, CNY: 7.2, HKD: 7.8, INR: 84, AED: 3.67, AUD: 1.52,
  CAD: 1.37, CHF: 0.88, TRY: 34, IDR: 15800, PHP: 57, LKR: 300, THB: 34,
  KES: 129, UGX: 3760, TZS: 2610, GHS: 15.2, NGN: 1530, ZAR: 18.1, XOF: 600, XAF: 600,
  SLE: 22.5, LRD: 195, ZMW: 26, CDF: 2850, RWF: 1350, MWK: 1730, ETB: 120, EGP: 48,
};

export function midRate(from: string, to: string): number {
  const f = REFERENCE_PER_USD[from];
  const t = REFERENCE_PER_USD[to];
  if (!f || !t) throw new Error(`No reference rate for ${from}/${to}`);
  return t / f;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Which side of the payment the caller fixed. */
export type Side = "receive" | "send";

export type RouteRequest = {
  from: Endpoint;
  to: Endpoint;
  amount: number;
  side: Side;
};

export type RouteQuote = {
  provider: ProviderId;
  sendCurrency: string;
  /** What the payer is charged by the provider, fees included. */
  sendAmount: number;
  receiveCurrency: string;
  /** What lands with the recipient. */
  receiveAmount: number;
  /** Provider cost in the send currency, against the mid-market reference: fees plus FX spread. */
  cost: number;
  /** cost as a share of sendAmount. */
  costPct: number;
  /** True when built from the estimate table, not a live provider quote. */
  estimated: boolean;
  basis: Basis;
  expiresAt: string | null;
  /** Provider's own quote id/token, when it gave one. */
  quoteRef?: string;
};

/**
 * Indicative pricing per provider, used only when a provider gives no live quote
 * (sandbox without keys). Sources, all from the providers' docs examples:
 *  - Kotani: fiat-to-fiat example charges 250 on a 10,000 deposit and 2 on a 76
 *    withdrawal, about 2.5% a leg.
 *  - Yellow Card: rates example buy 569.48 / sell 579.48 NGN, about 0.87% either
 *    side of mid per conversion (two conversions when neither side is USD), plus
 *    an assumed 1% channel fee.
 *  - Klasha Wire: example NGN to USD 1,000 has source fees of 27.5 USD (2.75%)
 *    and destination fees of 27.5 USD; spread assumed 1%.
 *  - Minisend: offramp example fee 13 on 1,294 KES (about 1%), spread assumed
 *    0.5%; a non-stablecoin payer adds an onramp leg at the same cost.
 *  - Payaza: its per-method schedule (fees.ts); no conversion.
 */
export type Estimate = { feePct: number; fixedUsd: number; spreadPct: number };

export function estimateFor(p: ProviderId, from: Endpoint, to: Endpoint): Estimate {
  const fx = from.currency !== to.currency;
  const usdSide = from.currency === "USD" || to.currency === "USD";
  switch (p) {
    case "payaza":
      return {
        feePct: from.rail === "card" ? 0.025 : from.rail === "momo" ? 0.02 : 0.01,
        fixedUsd: 0,
        spreadPct: 0,
      };
    case "kotani":
      return { feePct: 0.05, fixedUsd: 0, spreadPct: fx ? 0.01 : 0 };
    case "yellowcard":
      return { feePct: 0.01, fixedUsd: 0, spreadPct: !fx ? 0 : usdSide ? 0.0087 : 0.0174 };
    case "klasha":
      return { feePct: 0.0275, fixedUsd: 27.5, spreadPct: fx ? 0.01 : 0 };
    case "minisend":
      return {
        feePct: from.rail === "stablecoin" ? 0.01 : 0.02,
        fixedUsd: 0,
        spreadPct: fx ? 0.005 : 0,
      };
  }
}

/** A quote from the estimate table. */
export function estimateQuote(p: ProviderId, req: RouteRequest, basis: Basis): RouteQuote {
  const { from, to } = req;
  const e = estimateFor(p, from, to);
  const mid = from.currency === to.currency ? 1 : midRate(from.currency, to.currency);
  const effRate = mid * (1 - e.spreadPct);
  const fixedSrc = e.fixedUsd * (REFERENCE_PER_USD[from.currency] ?? 1);
  let sendAmount: number;
  let receiveAmount: number;
  if (req.side === "receive") {
    receiveAmount = req.amount;
    sendAmount = (req.amount / effRate + fixedSrc) / (1 - e.feePct);
  } else {
    sendAmount = req.amount;
    receiveAmount = Math.max(0, (req.amount * (1 - e.feePct) - fixedSrc) * effRate);
  }
  sendAmount = round2(sendAmount);
  receiveAmount = round2(receiveAmount);
  const cost = round2(sendAmount - receiveAmount / mid);
  return {
    provider: p,
    sendCurrency: from.currency,
    sendAmount,
    receiveCurrency: to.currency,
    receiveAmount,
    cost,
    costPct: sendAmount > 0 ? cost / sendAmount : 0,
    estimated: true,
    basis,
    expiresAt: null,
  };
}

/** Fills in cost and costPct for a live quote, against the mid-market reference. */
export function withCost(q: Omit<RouteQuote, "cost" | "costPct">): RouteQuote {
  const mid = q.sendCurrency === q.receiveCurrency ? 1 : midRate(q.sendCurrency, q.receiveCurrency);
  const cost = round2(q.sendAmount - q.receiveAmount / mid);
  return { ...q, cost, costPct: q.sendAmount > 0 ? cost / q.sendAmount : 0 };
}

const ORDER = new Map(PROVIDERS.map((p, i) => [p.id, i]));

/**
 * Cheapest first. Receive side fixed: smallest sendAmount wins. Send side fixed:
 * largest receiveAmount wins. Ties go to a documented route, then registry order,
 * so the result is deterministic.
 */
export function rankQuotes(quotes: RouteQuote[], side: Side): RouteQuote[] {
  return [...quotes].sort((a, b) => {
    const primary =
      side === "receive" ? a.sendAmount - b.sendAmount : b.receiveAmount - a.receiveAmount;
    if (Math.abs(primary) > 0.004) return primary;
    if (a.basis !== b.basis) return a.basis === "documented" ? -1 : 1;
    return (ORDER.get(a.provider) ?? 99) - (ORDER.get(b.provider) ?? 99);
  });
}

export type RoutePlan = {
  request: RouteRequest;
  /** Ranked: [0] is used, the rest are fallbacks in order. */
  quotes: RouteQuote[];
  /** Providers that could carry it but gave no quote, with why. */
  unavailable: { provider: ProviderId; reason: string }[];
};

/** Candidates for a request: every provider able to carry it end to end. */
export function candidates(req: RouteRequest) {
  return providersFor(req.from, req.to);
}

export type Attempt = { provider: ProviderId; ok: boolean; error?: string };

/** Thrown by an executor when money may already have moved, so trying another provider would risk paying twice. */
export class NotRetryable extends Error {
  readonly retryable = false;
}

/**
 * Tries the ranked quotes in order until one executes. A provider that fails
 * before taking the payment hands over to the next; one that fails after it may
 * have moved money (NotRetryable) stops the chain, because a second provider
 * could pay the recipient twice.
 */
export async function executeWithFallback<T>(
  ranked: RouteQuote[],
  run: (q: RouteQuote) => Promise<T>,
): Promise<{ result: T; quote: RouteQuote; attempts: Attempt[] }> {
  const attempts: Attempt[] = [];
  for (const q of ranked) {
    try {
      const result = await run(q);
      attempts.push({ provider: q.provider, ok: true });
      return { result, quote: q, attempts };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      attempts.push({ provider: q.provider, ok: false, error });
      if (e instanceof NotRetryable) throw Object.assign(new Error(error), { attempts });
    }
  }
  throw Object.assign(new Error("Every provider failed for this payment."), { attempts });
}

/**
 * What the payer is asked for on a routed payment. The provider's quote already
 * covers its fees and spread; Meridian adds its flat 1% of that on top (PRD 5.3).
 * `amount` is the recipient's amount valued in the payer's currency at the
 * mid-market reference, so amount + providerFee + meridianFee = total, the same
 * rule as a Payaza collection. Whole-unit currencies (KES, UGX, JPY ...) round
 * the total up to a whole unit.
 */
export function priceRoute(q: RouteQuote, wholeUnits: boolean) {
  const meridianFee = round2(q.sendAmount * MERIDIAN_FEE);
  const raw = q.sendAmount + meridianFee;
  const total = wholeUnits ? Math.ceil(raw - 0.000001) : round2(raw);
  const amount = round2(q.sendAmount - q.cost);
  return { amount, providerFee: round2(total - meridianFee - amount), meridianFee, total };
}

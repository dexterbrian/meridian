// The hackathon build's checks (hackathon PRD 5.7). A light version of the
// main PRD's rules, enough for a pilot with known businesses. Pure functions:
// the caller loads the facts and applies the strongest action.
//
//   block  the payment is refused before any partner call
//   hold   the money is collected but the payout waits for an admin
//   none   recorded as a flag for the admin, the payout goes ahead

export type CheckAction = "none" | "hold" | "block";
export type CheckSeverity = "low" | "medium" | "high";

export type CheckHit = {
  rule: string;
  severity: CheckSeverity;
  action: CheckAction;
  evidence: Record<string, unknown>;
  /** Shown to the admin, and to the payer when the action is block. */
  message: string;
};

/** FATF "call for action" list (black list). Update after each FATF plenary. */
export const FATF_BLACKLIST = ["KP", "IR", "MM"];

/** Payments at or above this USD value are flagged for the admin. Payout still goes ahead. */
export const LARGE_AMOUNT_USD = 10_000;

const RANK: Record<CheckAction, number> = { none: 0, hold: 1, block: 2 };

export function strongestAction(hits: CheckHit[]): CheckAction {
  return hits.reduce<CheckAction>((a, h) => (RANK[h.action] > RANK[a] ? h.action : a), "none");
}

/** Run before a payment attempt starts. A block here means Payaza is never called. */
export function checksBeforeCharge(input: {
  payerCountry: string | null | undefined;
  usdEquivalent: number;
}): CheckHit[] {
  const hits: CheckHit[] = [];
  const country = input.payerCountry?.toUpperCase();
  if (country && FATF_BLACKLIST.includes(country)) {
    hits.push({
      rule: "H_FATF_BLACKLIST",
      severity: "high",
      action: "block",
      evidence: { payerCountry: country },
      message: "We cannot accept payments from this country.",
    });
  }
  if (input.usdEquivalent >= LARGE_AMOUNT_USD) {
    hits.push({
      rule: "H_LARGE_AMOUNT",
      severity: "medium",
      action: "none",
      evidence: { usdEquivalent: input.usdEquivalent, threshold: LARGE_AMOUNT_USD },
      message: `Payment of USD ${LARGE_AMOUNT_USD.toLocaleString("en-US")} or more.`,
    });
  }
  return hits;
}

/**
 * Run when Payaza confirms a payment. The money is already collected, so the
 * only actions left are hold (wait for an admin) or none.
 */
export function checksOnCollected(input: {
  /** What we asked Payaza to charge. */
  expectedTotal: number;
  /** What Payaza says arrived. Null when the webhook did not say. */
  amountReceived: number | null;
  currency: string;
  reportedCurrency: string | null;
  /** State of the payment request at the time of the webhook. */
  request: { status: string; usage: string; paidCount: number };
  /** Our fee schedule vs Payaza's reported fee. */
  expectedPartnerFee: number;
  reportedPartnerFee: number | null;
}): CheckHit[] {
  const hits: CheckHit[] = [];

  if (
    input.amountReceived !== null &&
    Math.abs(input.amountReceived - input.expectedTotal) >= 0.01
  ) {
    hits.push({
      rule: "H_AMOUNT_MISMATCH",
      severity: "high",
      action: "hold",
      evidence: { expected: input.expectedTotal, received: input.amountReceived },
      message: "The amount Payaza received differs from the amount charged.",
    });
  }

  if (input.reportedCurrency && input.reportedCurrency !== input.currency) {
    hits.push({
      rule: "H_CURRENCY_MISMATCH",
      severity: "high",
      action: "hold",
      evidence: { expected: input.currency, reported: input.reportedCurrency },
      message: "The payment arrived in a different currency from the request.",
    });
  }

  const alreadyPaid = input.request.usage === "single" && input.request.paidCount > 0;
  if (input.request.status !== "active" || alreadyPaid) {
    hits.push({
      rule: "H_REQUEST_NOT_OPEN",
      severity: "high",
      action: "hold",
      evidence: { requestStatus: input.request.status, paidCount: input.request.paidCount },
      message: "This request was already paid or closed. The payment needs a refund decision.",
    });
  }

  if (
    input.reportedPartnerFee !== null &&
    Math.abs(input.reportedPartnerFee - input.expectedPartnerFee) > 0.01
  ) {
    hits.push({
      rule: "H_FEE_MISMATCH",
      severity: "low",
      action: "none",
      evidence: { expected: input.expectedPartnerFee, reported: input.reportedPartnerFee },
      message: "Payaza's fee differs from our schedule. Review the fee table.",
    });
  }

  return hits;
}

/**
 * Loose match between the business's name and the name a partner returned for
 * its payout account. Case, punctuation and company suffixes are ignored; at
 * least half the meaningful words must match.
 */
export function namesMatch(business: string, account: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(ltd|limited|llc|inc|plc|co|company|enterprises?|holdings?|group|the)\b/g, " ")
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1);
  const a = new Set(norm(business));
  const b = norm(account);
  if (a.size === 0 || b.length === 0) return false;
  const shared = b.filter((w) => a.has(w)).length;
  return shared >= Math.ceil(Math.min(a.size, b.length) / 2);
}

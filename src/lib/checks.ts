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

/** Run before a payment attempt starts. A block here means no provider is called. */
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
 * Run before a business pays a supplier. A block stops the transfer before any
 * provider hears of it. A hold lets the business pay in, then waits for an
 * admin before the supplier is paid: a large first payment to a new recipient
 * is the classic pattern for invoice fraud and mule accounts.
 */
export function checksBeforeTransfer(input: {
  recipientCountry: string;
  usdEquivalent: number;
  /** True until a payment to this recipient has settled. */
  newRecipient: boolean;
}): CheckHit[] {
  const hits: CheckHit[] = [];
  const country = input.recipientCountry.toUpperCase();
  if (FATF_BLACKLIST.includes(country)) {
    hits.push({
      rule: "T_FATF_BLACKLIST",
      severity: "high",
      action: "block",
      evidence: { recipientCountry: country },
      message: "We cannot send payments to this country.",
    });
  }
  if (input.usdEquivalent >= LARGE_AMOUNT_USD) {
    hits.push({
      rule: input.newRecipient ? "T_LARGE_FIRST_PAYMENT" : "T_LARGE_AMOUNT",
      severity: input.newRecipient ? "high" : "medium",
      action: input.newRecipient ? "hold" : "none",
      evidence: {
        usdEquivalent: input.usdEquivalent,
        threshold: LARGE_AMOUNT_USD,
        newRecipient: input.newRecipient,
      },
      message: input.newRecipient
        ? `First payment of USD ${LARGE_AMOUNT_USD.toLocaleString("en-US")} or more to a new recipient. Meridian checks it before the supplier is paid.`
        : `Transfer of USD ${LARGE_AMOUNT_USD.toLocaleString("en-US")} or more.`,
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

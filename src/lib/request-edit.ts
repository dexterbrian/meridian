// What a business may change on a payment request, and when.
//
// The invoice number, note, payer email and expiry are labels. They can change
// while the link is active. The amount, currency and usage decide what a payer
// is charged, so they lock as soon as anyone starts paying: an attempt already
// carries the old amount, and changing it underneath would break the promise
// that the business receives exactly what the link says.

export type EditableRequest = { status: string; attempt_count: number };

export type EditRules = {
  canEdit: boolean;
  canEditAmount: boolean;
  reason: string | null;
};

export function requestEditRules(r: EditableRequest): EditRules {
  if (r.status !== "active") {
    return {
      canEdit: false,
      canEditAmount: false,
      reason: `This link is ${r.status}, so it can't be edited.`,
    };
  }
  if (r.attempt_count > 0) {
    return {
      canEdit: true,
      canEditAmount: false,
      reason:
        "A payer has already started paying, so the amount, currency and usage are fixed. To change them, disable this link and create a new one.",
    };
  }
  return { canEdit: true, canEditAmount: true, reason: null };
}

/**
 * Currencies a business may request payment in: the ones it holds a payout
 * account in. Payaza pays out only in the currency a payment was collected in
 * (Payaza, 29 September 2026: no conversion for payouts, transfers or split
 * settlement), so a request in any other currency could be paid but never paid out.
 * Returned in the order of `all` (the app's currency list), without repeats.
 */
export function requestableCurrencies<C extends string>(
  accounts: { currency: string }[],
  all: readonly C[],
): C[] {
  const held = new Set(accounts.map((a) => a.currency));
  return all.filter((c) => held.has(c));
}

/** Days from now to an expiry time, or null for "never". -1 means "keep what it is". */
export function expiryFrom(days: number, now = Date.now()): string | null | undefined {
  if (days < 0) return undefined;
  if (days === 0) return null;
  return new Date(now + days * 86_400_000).toISOString();
}

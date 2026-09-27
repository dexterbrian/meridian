// Indicative demo pricing model.
// Partner (infrastructure) fees are the rails cost; Meridian adds a flat 1% on top.
// The payer covers all fees on top of the amount, so the recipient gets the full amount.
// Meridian charges nothing for FX. The partner's quoted rate is used as-is.
// Demo conversion uses fixed reference rates below; the real product uses the partner quote.

export type PayMethod = "bank" | "momo" | "card";

export const PARTNER_FEE: Record<PayMethod, number> = {
  bank: 0.01, // 1.0% bank transfer collection / payout
  momo: 0.02, // 2.0% mobile money collection / payout
  card: 0.025, // 2.5% card collection
};

export const MERIDIAN_FEE = 0.01; // flat 1% on top of infrastructure cost

export const METHOD_LABEL: Record<PayMethod, string> = {
  bank: "Bank transfer",
  momo: "Mobile money",
  card: "Card",
};

export type Currency = "NGN" | "KES" | "GHS" | "ZAR" | "UGX" | "TZS" | "USD";

export const CURRENCIES: { code: Currency; name: string; symbol: string; perUsd: number }[] = [
  { code: "NGN", name: "Nigerian Naira", symbol: "₦", perUsd: 1530 },
  { code: "KES", name: "Kenyan Shilling", symbol: "KES", perUsd: 129 },
  { code: "GHS", name: "Ghanaian Cedi", symbol: "GH₵", perUsd: 15.2 },
  { code: "ZAR", name: "South African Rand", symbol: "R", perUsd: 18.1 },
  { code: "UGX", name: "Ugandan Shilling", symbol: "USh", perUsd: 3760 },
  { code: "TZS", name: "Tanzanian Shilling", symbol: "TSh", perUsd: 2610 },
  { code: "USD", name: "US Dollar", symbol: "$", perUsd: 1 },
];

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as [Currency, ...Currency[]];

export function currency(code: Currency) {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0]!;
}

export function formatMoney(amount: number, code: Currency) {
  const c = currency(code);
  const decimals = c.perUsd > 500 ? 0 : 2;
  // A currency code used as the symbol (KES) needs a space: "KES 1,500.00".
  const prefix = /^[A-Z]{3}$/.test(c.symbol) ? `${c.symbol} ` : c.symbol;
  return `${prefix}${amount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function convert(amount: number, from: Currency, to: Currency) {
  const usd = amount / currency(from).perUsd;
  return usd * currency(to).perUsd;
}

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Meridian's own fee: 1% of the amount, rounded to cents. Everything else comes from the partner. */
export function meridianFee(amount: number) {
  return round2(amount * MERIDIAN_FEE);
}

export type Quote = {
  amount: number;
  partnerFee: number;
  meridianFee: number;
  totalFee: number;
  effectiveRate: number;
  /** Amount plus all fees. What the payer is charged. */
  payerPays: number;
  recipientGets: number;
  traditionalFee: number;
  saving: number;
};

/**
 * Fees are charged on what the payer pays, not on the amount. So the amount is
 * grossed up: payerPays = amount / (1 - total rate). The partner fee takes the
 * rounding remainder so payerPays - fees is exactly the amount.
 */
function grossUp(amount: number, partnerRate: number) {
  const payerPays = amount > 0 ? round2(amount / (1 - partnerRate - MERIDIAN_FEE)) : 0;
  const meridian = meridianFee(payerPays);
  const partnerFee = round2(payerPays - amount - meridian);
  const totalFee = round2(partnerFee + meridian);
  return {
    payerPays,
    partnerFee,
    meridianFee: meridian,
    totalFee,
    effectiveRate: payerPays > 0 ? totalFee / payerPays : 0,
  };
}

/**
 * Collection quote: the customer pays the fees on top, so the merchant gets the full amount.
 * With no method picked yet there are no fees to show, so the payer total is just the amount.
 */
export function quoteCollection(amount: number, method: PayMethod | null): Quote {
  if (!method) {
    return {
      amount,
      partnerFee: 0,
      meridianFee: 0,
      totalFee: 0,
      effectiveRate: 0,
      payerPays: amount,
      recipientGets: amount,
      traditionalFee: amount * 0.038,
      saving: 0,
    };
  }
  const fees = grossUp(amount, PARTNER_FEE[method]);
  const traditionalFee = amount * 0.038;
  return {
    amount,
    ...fees,
    recipientGets: amount,
    traditionalFee,
    saving: traditionalFee - fees.totalFee,
  };
}

/** Cross-border quote: the sender pays the fees on top, so the recipient gets the full amount converted. */
export function quoteCrossBorder(
  amount: number,
  from: Currency,
  to: Currency,
  payoutMethod: PayMethod,
): Quote {
  // Meridian does not charge for conversion
  const fees = grossUp(amount, (PARTNER_FEE["bank"] + PARTNER_FEE[payoutMethod]) * 0.5);
  const traditionalFee = amount * 0.09; // 8-12% typical all-in cost today
  return {
    amount,
    ...fees,
    recipientGets: convert(amount, from, to),
    traditionalFee,
    saving: traditionalFee - fees.totalFee,
  };
}

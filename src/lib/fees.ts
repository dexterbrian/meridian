// Indicative demo pricing model.
// Partner (infrastructure) fees are the rails cost; Meridian adds a flat 1% on top.

export type PayMethod = "bank" | "momo" | "card";

export const PARTNER_FEE: Record<PayMethod, number> = {
  bank: 0.01, // 1.0% bank transfer collection / payout
  momo: 0.02, // 2.0% mobile money collection / payout
  card: 0.025, // 2.5% card collection
};

export const MERIDIAN_FEE = 0.01; // flat 1% on top of infrastructure cost
export const FX_SPREAD = 0.0035; // 0.35% conversion spread on cross-border legs

export const METHOD_LABEL: Record<PayMethod, string> = {
  bank: "Bank transfer",
  momo: "Mobile money",
  card: "Card",
};

export type Currency = "NGN" | "KES" | "GHS" | "ZAR" | "UGX" | "TZS" | "USD";

export const CURRENCIES: { code: Currency; name: string; symbol: string; perUsd: number }[] = [
  { code: "NGN", name: "Nigerian Naira", symbol: "₦", perUsd: 1530 },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh", perUsd: 129 },
  { code: "GHS", name: "Ghanaian Cedi", symbol: "GH₵", perUsd: 15.2 },
  { code: "ZAR", name: "South African Rand", symbol: "R", perUsd: 18.1 },
  { code: "UGX", name: "Ugandan Shilling", symbol: "USh", perUsd: 3760 },
  { code: "TZS", name: "Tanzanian Shilling", symbol: "TSh", perUsd: 2610 },
  { code: "USD", name: "US Dollar", symbol: "$", perUsd: 1 },
];

export function currency(code: Currency) {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0]!;
}

export function formatMoney(amount: number, code: Currency) {
  const c = currency(code);
  const decimals = c.perUsd > 500 ? 0 : 2;
  return `${c.symbol}${amount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function convert(amount: number, from: Currency, to: Currency) {
  const usd = amount / currency(from).perUsd;
  return usd * currency(to).perUsd;
}

export type Quote = {
  amount: number;
  partnerFee: number;
  meridianFee: number;
  fxFee: number;
  totalFee: number;
  effectiveRate: number;
  netAfterFees: number;
  recipientGets: number;
  traditionalFee: number;
  saving: number;
};

/** Collection quote: what a merchant nets when a customer pays them. */
export function quoteCollection(amount: number, method: PayMethod): Quote {
  const partnerFee = amount * PARTNER_FEE[method];
  const meridianFee = amount * MERIDIAN_FEE;
  const totalFee = partnerFee + meridianFee;
  const traditionalFee = amount * 0.038;
  return {
    amount,
    partnerFee,
    meridianFee,
    fxFee: 0,
    totalFee,
    effectiveRate: totalFee / amount,
    netAfterFees: amount - totalFee,
    recipientGets: amount - totalFee,
    traditionalFee,
    saving: traditionalFee - totalFee,
  };
}

/** Cross-border quote: what a recipient in another market receives. */
export function quoteCrossBorder(
  amount: number,
  from: Currency,
  to: Currency,
  payoutMethod: PayMethod,
): Quote {
  const sameCurrency = from === to;
  const partnerFee = amount * (PARTNER_FEE["bank"] + PARTNER_FEE[payoutMethod]) * 0.5;
  const meridianFee = amount * MERIDIAN_FEE;
  const fxFee = sameCurrency ? 0 : amount * FX_SPREAD;
  const totalFee = partnerFee + meridianFee + fxFee;
  const netAfterFees = amount - totalFee;
  const recipientGets = convert(netAfterFees, from, to);
  const traditionalFee = amount * 0.09; // 8-12% typical all-in cost today
  return {
    amount,
    partnerFee,
    meridianFee,
    fxFee,
    totalFee,
    effectiveRate: totalFee / amount,
    netAfterFees,
    recipientGets,
    traditionalFee,
    saving: traditionalFee - totalFee,
  };
}

export function makeReference() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `MRD-${out}`;
}

// Pricing model. Partner (infrastructure) fees are the rails cost; Meridian adds a
// flat 1% on top. The payer covers all fees on top of the amount, so the recipient
// gets the full amount. Meridian charges nothing for FX.
//
// Payaza publishes no fee quote endpoint, so the partner rates below are an
// indicative schedule per method. After each payment the fee Payaza reports on
// its webhook is compared with ours and any gap is flagged for review (TRD 4.2).
// Conversion rates here are fixed reference rates used for USD equivalents and
// the demo pages; a real quote comes from the partner.

export type PayMethod = "bank" | "momo" | "card";

export const PARTNER_FEE: Record<PayMethod, number> = {
  bank: 0.01, // 1.0% bank transfer / virtual account / EFT collection
  momo: 0.02, // 2.0% mobile money collection
  card: 0.025, // 2.5% card collection
};

export const MERIDIAN_FEE = 0.01; // flat 1% on top of infrastructure cost

export const METHOD_LABEL: Record<PayMethod, string> = {
  bank: "Bank transfer",
  momo: "Mobile money",
  card: "Card",
};

export type Currency =
  | "NGN"
  | "KES"
  | "GHS"
  | "ZAR"
  | "UGX"
  | "TZS"
  | "USD"
  | "XOF"
  | "XAF"
  | "SLE"
  | "LRD"
  | "ZMW"
  | "CDF";

export type CurrencyInfo = {
  code: Currency;
  name: string;
  symbol: string;
  /** Units per US dollar. Reference rate only. */
  perUsd: number;
  /** ISO-2 countries whose payers use this currency, in display order. */
  countries: string[];
  /** Ways a payer in this currency can pay through Payaza. */
  methods: PayMethod[];
  /** Whether Payaza Transfers can pay a business out in this currency. */
  payout: boolean;
  /**
   * Decimals the rails actually move. M-Pesa and most East African wallets take
   * whole units; a charge with cents gets rounded by the network and then fails
   * our amount check. The gross-up rounds the payer total up to this.
   */
  chargeDecimals: 0 | 2;
};

// prettier-ignore
export const CURRENCIES: CurrencyInfo[] = [
  { code: "KES", name: "Kenyan Shilling",           symbol: "KES",  perUsd: 129,  countries: ["KE"],       methods: ["momo"],         payout: true,  chargeDecimals: 0 },
  { code: "UGX", name: "Ugandan Shilling",          symbol: "USh",  perUsd: 3760, countries: ["UG"],       methods: ["momo"],         payout: true,  chargeDecimals: 0 },
  { code: "TZS", name: "Tanzanian Shilling",        symbol: "TSh",  perUsd: 2610, countries: ["TZ"],       methods: ["momo"],         payout: true,  chargeDecimals: 0 },
  { code: "GHS", name: "Ghanaian Cedi",             symbol: "GH₵",  perUsd: 15.2, countries: ["GH"],       methods: ["momo"],         payout: true,  chargeDecimals: 2 },
  { code: "NGN", name: "Nigerian Naira",            symbol: "₦",    perUsd: 1530, countries: ["NG"],       methods: ["bank", "card"], payout: true,  chargeDecimals: 2 },
  { code: "ZAR", name: "South African Rand",        symbol: "R",    perUsd: 18.1, countries: ["ZA"],       methods: ["bank"],         payout: true,  chargeDecimals: 2 },
  { code: "XOF", name: "West African CFA Franc",    symbol: "CFA",  perUsd: 600,  countries: ["CI", "BJ"], methods: ["momo"],         payout: false, chargeDecimals: 0 },
  { code: "XAF", name: "Central African CFA Franc", symbol: "FCFA", perUsd: 600,  countries: ["CM"],       methods: ["momo"],         payout: true,  chargeDecimals: 0 },
  { code: "SLE", name: "Sierra Leonean Leone",      symbol: "Le",   perUsd: 22.5, countries: ["SL"],       methods: ["momo"],         payout: false, chargeDecimals: 2 },
  { code: "LRD", name: "Liberian Dollar",           symbol: "L$",   perUsd: 195,  countries: ["LR"],       methods: ["momo"],         payout: true,  chargeDecimals: 2 },
  { code: "ZMW", name: "Zambian Kwacha",            symbol: "ZK",   perUsd: 26,   countries: ["ZM"],       methods: ["momo"],         payout: true,  chargeDecimals: 2 },
  { code: "CDF", name: "Congolese Franc",           symbol: "FC",   perUsd: 2850, countries: ["CD"],       methods: ["momo"],         payout: true,  chargeDecimals: 0 },
  { code: "USD", name: "US Dollar",                 symbol: "$",    perUsd: 1,    countries: [],           methods: ["card"],         payout: false, chargeDecimals: 2 },
];

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as [Currency, ...Currency[]];

/** Currencies a business can be paid out in through Payaza Transfers. */
export const PAYOUT_CURRENCIES = CURRENCIES.filter((c) => c.payout).map((c) => c.code);

/** Currencies a payment request can be made in. Everything Payaza can collect. */
export const REQUEST_CURRENCIES = CURRENCY_CODES;

export function currency(code: Currency): CurrencyInfo {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0]!;
}

export function isCurrency(code: string): code is Currency {
  return CURRENCIES.some((c) => c.code === code);
}

export function methodsFor(code: Currency): PayMethod[] {
  return currency(code).methods;
}

/** Decimal places to show. Large-unit currencies are shown whole. */
export function decimalsFor(code: Currency) {
  return currency(code).perUsd > 500 ? 0 : 2;
}

/** Symbols for currencies Meridian routes through other providers but Payaza doesn't handle. */
const ROUTED_SYMBOL: Record<string, string> = { EUR: "€", GBP: "£", JPY: "¥", CNY: "CN¥" };
/** Routed currencies moved in whole units. */
const WHOLE_UNITS = new Set(["JPY", "IDR", "LKR", "RWF", "MWK"]);

export function formatMoney(amount: number, code: Currency | (string & {})) {
  const known = isCurrency(code) ? currency(code) : null;
  const symbol = known?.symbol ?? ROUTED_SYMBOL[code] ?? code;
  const decimals = known ? decimalsFor(known.code) : WHOLE_UNITS.has(code) ? 0 : 2;
  // A currency code used as the symbol (KES) needs a space: "KES 1,500.00".
  const prefix = /^[A-Z]{3}$/.test(symbol) ? `${symbol} ` : symbol;
  return `${prefix}${amount.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function convert(amount: number, from: Currency, to: Currency) {
  const usd = amount / currency(from).perUsd;
  return usd * currency(to).perUsd;
}

/** Reference USD value, for the large-amount check and admin views. */
export function usdEquivalent(amount: number, code: Currency) {
  return round2(amount / currency(code).perUsd);
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
function grossUp(amount: number, partnerRate: number, chargeDecimals: 0 | 2 = 2) {
  const raw = amount > 0 ? amount / (1 - partnerRate - MERIDIAN_FEE) : 0;
  // Whole-unit rails (M-Pesa) round the charge up; the partner fee absorbs the extra.
  const payerPays = chargeDecimals === 0 ? Math.ceil(round2(raw)) : round2(raw);
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
 * Pass the currency so the payer total lands on a unit its rails can move.
 */
export function quoteCollection(
  amount: number,
  method: PayMethod | null,
  code: Currency = "USD",
): Quote {
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
  const fees = grossUp(amount, PARTNER_FEE[method], currency(code).chargeDecimals);
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

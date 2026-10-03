// What each payment provider can do, from its public docs (checked 1-3 October
// 2026). Pure data plus lookups, so the router, the server and the UI share it.
//
// A provider can carry a payment end to end when it can collect the payer's
// currency on the payer's rail, pay the recipient's currency on the recipient's
// rail, and (if the two currencies differ) convert between them. Mixing two
// providers in one payment would need Meridian to hold a float with each, which
// the MVP doesn't (PRD 5.6), so every route here is single-provider.
//
// `basis` says how sure we are: "documented" means the provider's docs state it;
// "assumed" means the docs imply it but list no exact country or channel table,
// so it needs confirming with the provider (their coverage endpoints return the
// live list: Kotani GET /country, Yellow Card GET /channels, Klasha currency
// coverage, Minisend supported currencies).

export type ProviderId = "payaza" | "kotani" | "yellowcard" | "klasha" | "minisend";

/**
 * How money moves on one side of a payment.
 *  - momo: mobile money wallet (M-Pesa, MTN MoMo, Airtel ...)
 *  - bank: local bank account or bank transfer
 *  - card: Visa / Mastercard
 *  - virtual_account: a USD/EUR/GBP account the payer pays into by ACH, wire, SWIFT, SEPA or Faster Payments
 *  - stablecoin: USDC / USDT sent on-chain; priced in USD
 *  - wallet: Chinese wallets (Alipay, WeChat Pay, UnionPay)
 */
export type Rail = "momo" | "bank" | "card" | "virtual_account" | "stablecoin" | "wallet";

export type Basis = "documented" | "assumed";

export type Coverage = {
  /** ISO 4217. Stablecoins are priced as USD with rail "stablecoin". */
  currency: string;
  /** ISO-2 countries. Empty = any country (cards, stablecoins, virtual accounts). */
  countries: string[];
  rails: Rail[];
  basis: Basis;
};

export type ProviderProfile = {
  id: ProviderId;
  name: string;
  /** Can convert between its collect and payout currencies. */
  converts: boolean;
  collect: Coverage[];
  payout: Coverage[];
  docs: string;
};

const any: string[] = [];
const cov = (
  currency: string,
  countries: string[],
  rails: Rail[],
  basis: Basis = "documented",
): Coverage => ({
  currency,
  countries,
  rails,
  basis,
});

const EUR_SEPA = ["AT", "BE", "DE", "ES", "FR", "IE", "IT", "NL", "PT"];

// prettier-ignore
export const PROVIDERS: ProviderProfile[] = [
  {
    id: "payaza",
    name: "Payaza",
    // Payaza confirmed on 29 Sep 2026: no conversion for payouts, transfers or split settlement.
    converts: false,
    docs: "https://docs.payaza.africa/",
    collect: [
      cov("KES", ["KE"], ["momo"]), cov("UGX", ["UG"], ["momo"]), cov("TZS", ["TZ"], ["momo"]),
      cov("GHS", ["GH"], ["momo"]), cov("XAF", ["CM"], ["momo"]), cov("XOF", ["CI", "BJ"], ["momo"]),
      cov("SLE", ["SL"], ["momo"]), cov("LRD", ["LR"], ["momo"]), cov("ZMW", ["ZM"], ["momo"]),
      cov("CDF", ["CD"], ["momo"]), cov("ZAR", ["ZA"], ["bank"]), cov("NGN", ["NG"], ["bank", "card"]),
      cov("USD", any, ["card"]),
    ],
    payout: [
      cov("KES", ["KE"], ["momo", "bank"]), cov("UGX", ["UG"], ["momo"]), cov("TZS", ["TZ"], ["momo", "bank"]),
      cov("NGN", ["NG"], ["bank"]), cov("GHS", ["GH"], ["momo", "bank"]), cov("ZAR", ["ZA"], ["bank"]),
      cov("XAF", ["CM"], ["momo"]), cov("LRD", ["LR"], ["momo"]), cov("ZMW", ["ZM"], ["momo"]),
      cov("CDF", ["CD"], ["momo"]),
    ],
  },
  {
    id: "kotani",
    name: "Kotani Pay",
    // POST /rate/fiat quotes fiat-to-fiat with a fee on each leg; offramp turns USDC/USDT into fiat.
    converts: true,
    docs: "https://documentation.kotanipay.com/v3/overview",
    collect: [
      cov("KES", ["KE"], ["momo"]), cov("GHS", ["GH"], ["momo"]), cov("UGX", ["UG"], ["momo"]),
      cov("TZS", ["TZ"], ["momo"]), cov("ZMW", ["ZM"], ["momo"]), cov("RWF", ["RW"], ["momo"], "assumed"),
      cov("XOF", ["CI", "SN"], ["momo"], "assumed"), cov("XAF", ["CM"], ["momo"], "assumed"),
      cov("NGN", ["NG"], ["momo"], "assumed"),
      cov("ZAR", ["ZA"], ["bank", "card"]),
      // On-chain deposit / offramp: a payer anywhere sends USDC or USDT.
      cov("USD", any, ["stablecoin"]),
    ],
    payout: [
      cov("KES", ["KE"], ["momo", "bank"]), cov("GHS", ["GH"], ["momo"]), cov("UGX", ["UG"], ["momo"]),
      cov("TZS", ["TZ"], ["momo"]), cov("ZMW", ["ZM"], ["momo"]), cov("RWF", ["RW"], ["momo"], "assumed"),
      cov("XOF", ["CI", "SN"], ["momo"], "assumed"), cov("XAF", ["CM"], ["momo"], "assumed"),
      cov("NGN", ["NG"], ["bank"]), cov("ZAR", ["ZA"], ["bank"]),
    ],
  },
  {
    id: "yellowcard",
    name: "Yellow Card",
    // Rates are local currency to USD (buy/sell), so any two of its currencies convert through USD.
    converts: true,
    docs: "https://docs.yellowcard.engineering/docs",
    collect: [
      cov("NGN", ["NG"], ["bank"], "assumed"), cov("KES", ["KE"], ["momo", "bank"], "assumed"),
      cov("GHS", ["GH"], ["momo", "bank"], "assumed"), cov("UGX", ["UG"], ["momo"], "assumed"),
      cov("TZS", ["TZ"], ["momo"], "assumed"), cov("ZMW", ["ZM"], ["momo"], "assumed"),
      cov("RWF", ["RW"], ["momo"], "assumed"), cov("XAF", ["CM"], ["momo"], "assumed"),
      cov("XOF", ["CI", "SN", "BJ"], ["momo"], "assumed"), cov("ZAR", ["ZA"], ["bank"], "assumed"),
      // USD, EUR and GBP virtual accounts: ACH/wire/SWIFT, SEPA, Faster Payments.
      cov("USD", any, ["virtual_account"]), cov("EUR", any, ["virtual_account"]),
      cov("GBP", any, ["virtual_account"]),
    ],
    payout: [
      cov("NGN", ["NG"], ["bank"], "assumed"), cov("KES", ["KE"], ["momo", "bank"], "assumed"),
      cov("GHS", ["GH"], ["momo", "bank"], "assumed"), cov("UGX", ["UG"], ["momo"], "assumed"),
      cov("TZS", ["TZ"], ["momo"], "assumed"), cov("ZMW", ["ZM"], ["momo"], "assumed"),
      cov("RWF", ["RW"], ["momo"], "assumed"), cov("XAF", ["CM"], ["momo"], "assumed"),
      cov("XOF", ["CI", "SN", "BJ"], ["momo"], "assumed"), cov("ZAR", ["ZA"], ["bank"], "assumed"),
      // Asia: local bank transfer in local currency (USD in Cambodia).
      cov("INR", ["IN"], ["bank"]), cov("IDR", ["ID"], ["bank"]), cov("PHP", ["PH"], ["bank"]),
      cov("LKR", ["LK"], ["bank"]), cov("THB", ["TH"], ["bank"]), cov("USD", ["KH"], ["bank"]),
      // Institutional USD/EUR sends (business sender fields, IBAN for EUR).
      cov("USD", ["US"], ["bank"], "assumed"), cov("EUR", EUR_SEPA, ["bank"], "assumed"),
    ],
  },
  {
    id: "klasha",
    name: "Klasha",
    // Klasha Wire quotes source to destination with source and destination fees.
    converts: true,
    docs: "https://developers.klasha.com/overview/introduction",
    collect: [
      cov("NGN", ["NG"], ["bank", "card"]), cov("KES", ["KE"], ["momo", "card", "bank"]),
      cov("ZMW", ["ZM"], ["momo", "card", "bank"]), cov("UGX", ["UG"], ["momo", "card", "bank"]),
      cov("TZS", ["TZ"], ["momo", "card", "bank"]), cov("ZAR", ["ZA"], ["card", "bank"]),
      cov("GHS", ["GH"], ["bank"]), cov("XOF", ["SN", "CI"], ["momo"]), cov("XAF", ["CG", "GA"], ["momo"]),
      cov("CDF", ["CD"], ["momo"]), cov("RWF", ["RW"], ["momo"]), cov("SLE", ["SL"], ["momo", "bank"]),
    ],
    payout: [
      // Klasha Wire currency coverage, plus CNY to Chinese wallets.
      cov("CNY", ["CN"], ["bank", "wallet"]), cov("JPY", ["JP"], ["bank"]),
      cov("EUR", ["AT", "BE", "CH"], ["bank"]), cov("GBP", ["GB", "BE", "CH"], ["bank"]),
      cov("USD", ["US", "AO", "AU", "AT", "BE", "CA", "CN", "GH", "HK", "IN", "KE", "NG", "SL", "ZA", "CH", "TZ", "TR", "UG", "AE", "GB", "ZM"], ["bank"]),
      cov("HKD", ["HK"], ["bank"]), cov("INR", ["IN"], ["bank"]), cov("AED", ["AE"], ["bank"]),
      cov("AUD", ["AU"], ["bank"]), cov("CAD", ["CA"], ["bank"]), cov("CHF", ["CH"], ["bank"]),
      cov("TRY", ["TR"], ["bank"]),
      cov("KES", ["KE"], ["bank"]), cov("NGN", ["NG"], ["bank"]), cov("GHS", ["GH"], ["bank"]),
      cov("ZAR", ["ZA"], ["bank"]), cov("TZS", ["TZ"], ["bank"]), cov("UGX", ["UG"], ["bank"]),
      cov("ZMW", ["ZM"], ["bank"]), cov("ETB", ["ET"], ["bank"]),
    ],
  },
  {
    id: "minisend",
    name: "Minisend",
    // USDC in the middle: onramp (local fiat to USDC) then offramp (USDC to local fiat).
    converts: true,
    docs: "https://docs.minisend.xyz/introduction",
    collect: [
      cov("KES", ["KE"], ["momo", "bank"], "assumed"), cov("NGN", ["NG"], ["bank"], "assumed"),
      cov("GHS", ["GH"], ["momo", "bank"], "assumed"), cov("UGX", ["UG"], ["momo"], "assumed"),
      cov("USD", any, ["stablecoin"]),
    ],
    payout: [
      cov("KES", ["KE"], ["momo", "bank"]), cov("NGN", ["NG"], ["bank"]),
      cov("GHS", ["GH"], ["momo", "bank"]), cov("UGX", ["UG"], ["momo"]),
    ],
  },
];

export const PROVIDER_IDS = PROVIDERS.map((p) => p.id);

export function provider(id: ProviderId): ProviderProfile {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown provider ${id}`);
  return p;
}

/** One side of a route: the currency, the rail, and the country where it matters. */
export type Endpoint = { currency: string; rail: Rail; country?: string };

function covers(list: Coverage[], e: Endpoint): Coverage | null {
  return (
    list.find(
      (c) =>
        c.currency === e.currency &&
        c.rails.includes(e.rail) &&
        (c.countries.length === 0 || !e.country || c.countries.includes(e.country)),
    ) ?? null
  );
}

export type RouteMatch = {
  provider: ProviderId;
  /** "assumed" if either leg is assumed. */
  basis: Basis;
};

/** Providers that can carry a payment from `from` to `to` on their own, in registry order. */
export function providersFor(from: Endpoint, to: Endpoint): RouteMatch[] {
  const out: RouteMatch[] = [];
  for (const p of PROVIDERS) {
    const c = covers(p.collect, from);
    const d = covers(p.payout, to);
    if (!c || !d) continue;
    if (from.currency !== to.currency && !p.converts) continue;
    out.push({
      provider: p.id,
      basis: c.basis === "documented" && d.basis === "documented" ? "documented" : "assumed",
    });
  }
  return out;
}

/** Rails a payer in `currency` (and `country`) can use with any provider that pays out to `to`. */
export function payerRails(currency: string, country: string | undefined, to: Endpoint): Rail[] {
  const rails = new Set<Rail>();
  for (const r of ["momo", "bank", "card", "virtual_account", "stablecoin", "wallet"] as Rail[]) {
    if (providersFor({ currency, rail: r, country }, to).length > 0) rails.add(r);
  }
  return [...rails];
}

/** Every currency some provider can pay out, with the countries and rails for each. */
export function payoutDestinations(): { currency: string; country: string; rails: Rail[] }[] {
  const map = new Map<string, Set<Rail>>();
  for (const p of PROVIDERS) {
    for (const c of p.payout) {
      for (const country of c.countries) {
        const key = `${c.currency}|${country}`;
        const set = map.get(key) ?? new Set<Rail>();
        for (const r of c.rails) set.add(r);
        map.set(key, set);
      }
    }
  }
  return [...map.entries()]
    .map(([k, rails]) => {
      const [currency, country] = k.split("|") as [string, string];
      return { currency, country, rails: [...rails] };
    })
    .sort((a, b) => a.country.localeCompare(b.country) || a.currency.localeCompare(b.currency));
}

export const RAIL_LABEL: Record<Rail, string> = {
  momo: "Mobile money",
  bank: "Bank account",
  card: "Card",
  virtual_account: "International bank transfer",
  stablecoin: "USDC / USDT",
  wallet: "Alipay / WeChat Pay",
};

export type PayerOption = { currency: string; rail: Rail; country?: string };

const FIRST = ["USD", "EUR", "GBP"];

/**
 * Other ways to pay a business whose money lands on `to`: every currency and rail
 * some provider can collect and deliver from. The business's own currency is
 * left out; the pay page offers it through Payaza already. International options
 * (USD, EUR, GBP) come first.
 */
export function payerOptions(to: Endpoint): PayerOption[] {
  const seen = new Map<string, PayerOption>();
  for (const p of PROVIDERS) {
    for (const c of p.collect) {
      if (c.currency === to.currency) continue;
      for (const rail of c.rails) {
        const option: PayerOption = { currency: c.currency, rail, country: c.countries[0] };
        const key = `${c.currency}|${rail}`;
        if (seen.has(key) || providersFor(option, to).length === 0) continue;
        seen.set(key, option);
      }
    }
  }
  const rank = (c: string) => (FIRST.includes(c) ? FIRST.indexOf(c) : FIRST.length);
  return [...seen.values()].sort(
    (a, b) =>
      rank(a.currency) - rank(b.currency) ||
      a.currency.localeCompare(b.currency) ||
      a.rail.localeCompare(b.rail),
  );
}

/**
 * Ways a business in `country` can fund a transfer: its local rails, plus the
 * ones open anywhere (a USD/EUR/GBP account abroad, USDC). Cards are left out:
 * businesses fund transfers from accounts.
 */
export function funderOptions(country: string): PayerOption[] {
  const seen = new Map<string, PayerOption>();
  for (const p of PROVIDERS) {
    if (p.id === "payaza") continue; // Payaza doesn't convert, so it can't fund a routed transfer.
    for (const c of p.collect) {
      if (c.countries.length > 0 && !c.countries.includes(country)) continue;
      for (const rail of c.rails) {
        if (rail === "card") continue;
        const key = `${c.currency}|${rail}`;
        if (!seen.has(key))
          seen.set(key, {
            currency: c.currency,
            rail,
            country: c.countries.length ? country : undefined,
          });
      }
    }
  }
  const rank = (o: PayerOption) =>
    o.country ? 0 : 1 + (FIRST.includes(o.currency) ? FIRST.indexOf(o.currency) : FIRST.length);
  return [...seen.values()].sort(
    (a, b) =>
      rank(a) - rank(b) || a.currency.localeCompare(b.currency) || a.rail.localeCompare(b.rail),
  );
}

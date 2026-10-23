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
// coverage).

export type ProviderId = "kotani" | "yellowcard" | "klasha";

/**
 * How money moves on one side of a payment.
 *  - momo: mobile money wallet (M-Pesa, MTN MoMo, Airtel ...)
 *  - bank: local bank account or bank transfer
 *  - card: Visa / Mastercard
 *  - virtual_account: a USD/EUR/GBP account the payer pays into by ACH, wire, SWIFT, SEPA or Faster Payments
 *  - wallet: Chinese wallets (Alipay, WeChat Pay, UnionPay)
 *
 * There is no stablecoin rail. A provider may settle in stablecoins behind the
 * scenes, as Kotani does, but a payer always pays in ordinary money and a
 * recipient is always paid in ordinary money.
 */
export type Rail = "momo" | "bank" | "card" | "virtual_account" | "wallet";

export type Basis = "documented" | "assumed";

export type Coverage = {
  /** ISO 4217. */
  currency: string;
  /** ISO-2 countries. Empty = any country (cards, virtual accounts). */
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
    id: "kotani",
    name: "Kotani Pay",
    // POST /rate/fiat quotes fiat-to-fiat with a fee on each leg; offramp turns USDC/USDT into fiat.
    converts: true,
    docs: "https://documentation.kotanipay.com/v3/overview",
    // Read from Kotani's own GET /customer/support/countries on 13 October 2026
    // (12 countries, each listed for both deposit and withdraw), so these are
    // documented, not guessed. Nigeria is not among them: Kotani does not
    // collect or pay NGN. Networks: "BKTRX" is a bank rail, "CHECKOUT" a
    // hosted card page, so those two currencies add bank and card collection.
    collect: [
      cov("KES", ["KE"], ["momo", "bank", "card"]), cov("GHS", ["GH"], ["momo"]),
      cov("UGX", ["UG"], ["momo"]), cov("TZS", ["TZ"], ["momo"]),
      cov("ZMW", ["ZM"], ["momo"]), cov("RWF", ["RW"], ["momo"]),
      cov("XOF", ["CI", "SN"], ["momo"]), cov("XAF", ["CM"], ["momo"]),
      cov("CDF", ["CD"], ["momo"]), cov("SLE", ["SL"], ["momo"]),
      cov("ZAR", ["ZA"], ["momo", "bank", "card"]),
    ],
    payout: [
      cov("KES", ["KE"], ["momo", "bank"]), cov("GHS", ["GH"], ["momo"]),
      cov("UGX", ["UG"], ["momo"]), cov("TZS", ["TZ"], ["momo"]),
      cov("ZMW", ["ZM"], ["momo"]), cov("RWF", ["RW"], ["momo"]),
      cov("XOF", ["CI", "SN"], ["momo"]), cov("XAF", ["CM"], ["momo"]),
      cov("CDF", ["CD"], ["momo"]), cov("SLE", ["SL"], ["momo"]),
      cov("ZAR", ["ZA"], ["momo", "bank"]),
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
];

export const PROVIDER_IDS = PROVIDERS.map((p) => p.id);

/**
 * The providers Meridian may route money through today.
 *
 * The registry above keeps every provider we have built. A provider only joins
 * this list once its account is open and its keys work, because offering a payer
 * a way to pay that we cannot actually carry is worse than not offering it.
 * Routing, the ways a payer can pay, and the destinations a business can send to
 * all read this list, so this one line is the whole switch.
 *
 * On now: Kotani Pay, and nothing else. Yellow Card and Klasha are built,
 * unit-tested and ready; they are off until their business checks and sandbox
 * keys are done. To turn one back on, add its id here. Nothing else changes.
 */
export const ENABLED_PROVIDERS: readonly ProviderId[] = ["kotani"];

/** The switched-on providers, or an explicit set (coverage tests and docs pass the full registry). */
function switchedOn(only: readonly ProviderId[]): ProviderProfile[] {
  return PROVIDERS.filter((p) => only.includes(p.id));
}

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

/**
 * Providers that can carry a payment from `from` to `to` on their own, in
 * registry order. Only the switched-on ones, unless `only` says otherwise.
 */
export function providersFor(
  from: Endpoint,
  to: Endpoint,
  only: readonly ProviderId[] = ENABLED_PROVIDERS,
): RouteMatch[] {
  const out: RouteMatch[] = [];
  for (const p of switchedOn(only)) {
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
export function payerRails(
  currency: string,
  country: string | undefined,
  to: Endpoint,
  only: readonly ProviderId[] = ENABLED_PROVIDERS,
): Rail[] {
  const rails = new Set<Rail>();
  for (const r of ["momo", "bank", "card", "virtual_account", "wallet"] as Rail[]) {
    if (providersFor({ currency, rail: r, country }, to, only).length > 0) rails.add(r);
  }
  return [...rails];
}

/** Every currency some provider can pay out, with the countries and rails for each. */
export function payoutDestinations(
  only: readonly ProviderId[] = ENABLED_PROVIDERS,
): { currency: string; country: string; rails: Rail[] }[] {
  const map = new Map<string, Set<Rail>>();
  for (const p of switchedOn(only)) {
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
  wallet: "Alipay / WeChat Pay",
};

export type PayerOption = { currency: string; rail: Rail; country?: string };

const FIRST = ["USD", "EUR", "GBP"];

/**
 * How a payer can pay a business whose money lands on `to`: every currency and
 * rail a switched-on provider can collect and deliver from, the business's own
 * currency included. International options (USD, EUR, GBP) come first.
 */
export function payerOptions(
  to: Endpoint,
  only: readonly ProviderId[] = ENABLED_PROVIDERS,
): PayerOption[] {
  const seen = new Map<string, PayerOption>();
  for (const p of switchedOn(only)) {
    for (const c of p.collect) {
      for (const rail of c.rails) {
        const option: PayerOption = { currency: c.currency, rail, country: c.countries[0] };
        const key = `${c.currency}|${rail}`;
        if (seen.has(key) || providersFor(option, to, only).length === 0) continue;
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
export function funderOptions(
  country: string,
  only: readonly ProviderId[] = ENABLED_PROVIDERS,
): PayerOption[] {
  const seen = new Map<string, PayerOption>();
  for (const p of switchedOn(only)) {
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

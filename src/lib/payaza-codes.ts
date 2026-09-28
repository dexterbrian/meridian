// Payaza's static codes: mobile money networks, country codes and payout rails.
// Pure data, so both the pay page (browser) and the server can use it.
//
// Network codes follow Payaza's pattern of three letters for the operator and
// three for the country (SAFKEN, MTNCMR, MOMCIV). Only some are confirmed from
// Payaza's docs or the sandbox; the rest follow the pattern and are marked so.
// Payaza's Bank Codes API returns the live list once the account is enabled.

import type { Currency, PayMethod } from "./fees";

export type Network = {
  code: string;
  name: string;
  currency: Currency;
  country: string;
  confirmed: boolean;
};

export const NETWORKS: Network[] = [
  // Kenya
  { code: "SAFKEN", name: "M-Pesa (Safaricom)", currency: "KES", country: "KE", confirmed: true },
  { code: "AIRKEN", name: "Airtel Money", currency: "KES", country: "KE", confirmed: false },
  // Ghana
  { code: "MTNGHA", name: "MTN Mobile Money", currency: "GHS", country: "GH", confirmed: false },
  { code: "VODGHA", name: "Vodafone Cash", currency: "GHS", country: "GH", confirmed: false },
  { code: "ATLGHA", name: "AirtelTigo Money", currency: "GHS", country: "GH", confirmed: false },
  // Uganda
  { code: "MTNUGA", name: "MTN Mobile Money", currency: "UGX", country: "UG", confirmed: false },
  { code: "AIRUGA", name: "Airtel Money", currency: "UGX", country: "UG", confirmed: false },
  // Tanzania
  { code: "VODTZA", name: "M-Pesa (Vodacom)", currency: "TZS", country: "TZ", confirmed: false },
  { code: "AIRTZA", name: "Airtel Money", currency: "TZS", country: "TZ", confirmed: false },
  { code: "TIGTZA", name: "Tigo Pesa", currency: "TZS", country: "TZ", confirmed: false },
  { code: "HALTZA", name: "HaloPesa", currency: "TZS", country: "TZ", confirmed: false },
  // Cameroon
  { code: "MTNCMR", name: "MTN Mobile Money", currency: "XAF", country: "CM", confirmed: true },
  { code: "ORACMR", name: "Orange Money", currency: "XAF", country: "CM", confirmed: true },
  // Côte d'Ivoire and Benin
  { code: "MOMCIV", name: "Orange Money (OTP)", currency: "XOF", country: "CI", confirmed: true },
  { code: "WAVCIV", name: "Wave", currency: "XOF", country: "CI", confirmed: true },
  { code: "MTNCIV", name: "MTN Mobile Money", currency: "XOF", country: "CI", confirmed: false },
  { code: "MOVCIV", name: "Moov Money", currency: "XOF", country: "CI", confirmed: false },
  { code: "MTNBEN", name: "MTN Mobile Money", currency: "XOF", country: "BJ", confirmed: false },
  { code: "MOVBEN", name: "Moov Money", currency: "XOF", country: "BJ", confirmed: false },
  // Sierra Leone
  { code: "AFRSLE", name: "Afrimoney", currency: "SLE", country: "SL", confirmed: true },
  { code: "ORASLE", name: "Orange Money", currency: "SLE", country: "SL", confirmed: false },
  // Liberia
  { code: "ORALBR", name: "Orange Money", currency: "LRD", country: "LR", confirmed: false },
  { code: "MTNLBR", name: "MTN Mobile Money", currency: "LRD", country: "LR", confirmed: false },
  // Zambia
  { code: "MTNZMB", name: "MTN Mobile Money", currency: "ZMW", country: "ZM", confirmed: false },
  { code: "AIRZMB", name: "Airtel Money", currency: "ZMW", country: "ZM", confirmed: false },
  { code: "ZAMZMB", name: "Zamtel Kwacha", currency: "ZMW", country: "ZM", confirmed: false },
  // DR Congo
  { code: "AIRCOD", name: "Airtel Money", currency: "CDF", country: "CD", confirmed: false },
  { code: "ORACOD", name: "Orange Money", currency: "CDF", country: "CD", confirmed: false },
  { code: "VODCOD", name: "M-Pesa (Vodacom)", currency: "CDF", country: "CD", confirmed: false },
  // South Africa (EFT is a bank redirect, not a wallet, but uses the same endpoint)
  {
    code: "EFTZAR",
    name: "Instant EFT (any bank)",
    currency: "ZAR",
    country: "ZA",
    confirmed: true,
  },
  { code: "CPZZAR", name: "Capitec Pay", currency: "ZAR", country: "ZA", confirmed: true },
];

export function networksFor(currency: Currency): Network[] {
  return NETWORKS.filter((n) => n.currency === currency);
}

export function findNetwork(code: string): Network | undefined {
  return NETWORKS.find((n) => n.code === code);
}

/** ISO-2 to ISO-3, the form Payaza Transfers wants in `country`. */
export const ISO3: Record<string, string> = {
  KE: "KEN",
  UG: "UGA",
  TZ: "TZA",
  GH: "GHA",
  NG: "NGA",
  ZA: "ZAF",
  CM: "CMR",
  CI: "CIV",
  BJ: "BEN",
  SL: "SLE",
  LR: "LBR",
  ZM: "ZMB",
  CD: "COD",
};

export const COUNTRY_NAMES: Record<string, string> = {
  KE: "Kenya",
  UG: "Uganda",
  TZ: "Tanzania",
  GH: "Ghana",
  NG: "Nigeria",
  ZA: "South Africa",
  CM: "Cameroon",
  CI: "Côte d'Ivoire",
  BJ: "Benin",
  SL: "Sierra Leone",
  LR: "Liberia",
  ZM: "Zambia",
  CD: "DR Congo",
  RW: "Rwanda",
  SS: "South Sudan",
  ET: "Ethiopia",
  EG: "Egypt",
  US: "United States",
  GB: "United Kingdom",
  DE: "Germany",
  NL: "Netherlands",
  FR: "France",
  AE: "United Arab Emirates",
  SA: "Saudi Arabia",
  NA: "Namibia",
  IN: "India",
  CN: "China",
};

/** Countries a business can be based in for the hackathon build (Payaza payout markets). */
export const BUSINESS_COUNTRIES = ["KE", "UG", "TZ", "GH", "NG", "ZA", "CM", "LR", "ZM", "CD"];

/** Payaza Transfers `transaction_type` for a payout currency and method. */
export function payoutRail(currency: Currency, method: "bank" | "momo"): string | null {
  const rails: Partial<Record<Currency, Partial<Record<"bank" | "momo", string>>>> = {
    NGN: { bank: "nuban" },
    GHS: { momo: "mobile_money", bank: "ghipps" },
    UGX: { momo: "mobile_money" },
    TZS: { momo: "mobile_money", bank: "tiss" },
    KES: { momo: "mobile_money", bank: "kepss" },
    XOF: { momo: "mobile_money" },
    XAF: { momo: "mobile_money" },
    ZMW: { momo: "mobile_money" },
    SLE: { momo: "mobile_money" },
    ZAR: { bank: "RTC" },
    LRD: { momo: "mobile_money" },
    CDF: { momo: "mobile_money" },
  };
  return rails[currency]?.[method] ?? null;
}

/** Payout methods Payaza Transfers supports for a currency. */
export function payoutMethodsFor(currency: Currency): ("bank" | "momo")[] {
  return (["momo", "bank"] as const).filter((m) => payoutRail(currency, m) !== null);
}

/** Nigerian virtual accounts are issued by Globus Bank in Payaza's sandbox and live. */
export const VIRTUAL_ACCOUNT_BANK_CODE = "140";
export const VIRTUAL_ACCOUNT_MINUTES = 30;

/**
 * Digits Payaza expects in a mobile money number, country code included and no plus sign.
 * Wrong lengths fail at the network, so the form checks first.
 */
export function momoNumberLength(currency: Currency, country: string): number | null {
  if (currency === "XOF") return 13;
  if (currency === "SLE") return 11;
  if (currency === "ZAR") return null;
  if (country === "NG") return null;
  return 12;
}

/** Strip spaces, dashes and a leading plus or zeros; keep digits only. */
export function normalisePhone(raw: string): string {
  return raw.replace(/[^\d]/g, "").replace(/^0+/, "");
}

/** Maps a pay method to the Payaza product behind it, for display and routing. */
export function payazaProductFor(currency: Currency, method: PayMethod): string {
  if (method === "card") return "Card via Payaza Web Checkout";
  if (currency === "NGN" && method === "bank") return "Payaza virtual account";
  if (currency === "ZAR") return "Payaza ZAR EFT";
  if (currency === "XOF") return "Payaza XOF mobile money";
  return "Payaza mobile money";
}

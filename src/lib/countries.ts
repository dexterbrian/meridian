// Countries, mobile money networks and phone numbers. Pure data, so both the
// browser and the server can use it.
//
// A network's code is Meridian's own id for it, stored on payout accounts. It
// is never sent to a provider: each adapter turns the network's name into the
// provider's own spelling (kotaniNetwork in partner-requests.ts).

import type { Currency } from "./fees";
import { payoutDestinations, type Rail } from "./providers";

export type Network = {
  code: string;
  name: string;
  currency: Currency;
  country: string;
};

export const NETWORKS: Network[] = [
  // Kenya
  { code: "SAFKEN", name: "M-Pesa (Safaricom)", currency: "KES", country: "KE" },
  { code: "AIRKEN", name: "Airtel Money", currency: "KES", country: "KE" },
  // Ghana
  { code: "MTNGHA", name: "MTN Mobile Money", currency: "GHS", country: "GH" },
  { code: "VODGHA", name: "Vodafone Cash", currency: "GHS", country: "GH" },
  { code: "ATLGHA", name: "AirtelTigo Money", currency: "GHS", country: "GH" },
  // Uganda
  { code: "MTNUGA", name: "MTN Mobile Money", currency: "UGX", country: "UG" },
  { code: "AIRUGA", name: "Airtel Money", currency: "UGX", country: "UG" },
  // Tanzania
  { code: "VODTZA", name: "M-Pesa (Vodacom)", currency: "TZS", country: "TZ" },
  { code: "AIRTZA", name: "Airtel Money", currency: "TZS", country: "TZ" },
  { code: "TIGTZA", name: "Tigo Pesa", currency: "TZS", country: "TZ" },
  { code: "HALTZA", name: "HaloPesa", currency: "TZS", country: "TZ" },
  // Cameroon
  { code: "MTNCMR", name: "MTN Mobile Money", currency: "XAF", country: "CM" },
  { code: "ORACMR", name: "Orange Money", currency: "XAF", country: "CM" },
  // Côte d'Ivoire and Senegal
  { code: "ORACIV", name: "Orange Money", currency: "XOF", country: "CI" },
  { code: "WAVCIV", name: "Wave", currency: "XOF", country: "CI" },
  { code: "MTNCIV", name: "MTN Mobile Money", currency: "XOF", country: "CI" },
  { code: "MOVCIV", name: "Moov Money", currency: "XOF", country: "CI" },
  { code: "ORASEN", name: "Orange Money", currency: "XOF", country: "SN" },
  { code: "WAVSEN", name: "Wave", currency: "XOF", country: "SN" },
  { code: "FRESEN", name: "Free Money", currency: "XOF", country: "SN" },
  // Sierra Leone
  { code: "AFRSLE", name: "Afrimoney", currency: "SLE", country: "SL" },
  { code: "ORASLE", name: "Orange Money", currency: "SLE", country: "SL" },
  // Zambia
  { code: "MTNZMB", name: "MTN Mobile Money", currency: "ZMW", country: "ZM" },
  { code: "AIRZMB", name: "Airtel Money", currency: "ZMW", country: "ZM" },
  { code: "ZAMZMB", name: "Zamtel Kwacha", currency: "ZMW", country: "ZM" },
  // DR Congo
  { code: "AIRCOD", name: "Airtel Money", currency: "CDF", country: "CD" },
  { code: "ORACOD", name: "Orange Money", currency: "CDF", country: "CD" },
  { code: "VODCOD", name: "M-Pesa (Vodacom)", currency: "CDF", country: "CD" },
  // South Africa
  { code: "VODZAF", name: "VodaPay (Vodacom)", currency: "ZAR", country: "ZA" },
];

export function networksFor(currency: Currency, country?: string): Network[] {
  return NETWORKS.filter((n) => n.currency === currency && (!country || n.country === country));
}

export function findNetwork(code: string): Network | undefined {
  return NETWORKS.find((n) => n.code === code);
}

export const COUNTRY_NAMES: Record<string, string> = {
  KE: "Kenya",
  UG: "Uganda",
  TZ: "Tanzania",
  GH: "Ghana",
  NG: "Nigeria",
  ZA: "South Africa",
  CM: "Cameroon",
  CI: "Côte d'Ivoire",
  SN: "Senegal",
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

const AFRICA = new Set([
  "KE",
  "UG",
  "TZ",
  "GH",
  "NG",
  "ZA",
  "CM",
  "CI",
  "SN",
  "BJ",
  "SL",
  "LR",
  "ZM",
  "CD",
  "RW",
  "SS",
  "ET",
  "EG",
  "NA",
  "MW",
  "MZ",
  "BW",
  "BF",
  "TG",
  "ML",
  "GA",
  "CG",
]);

/**
 * Countries a business can be based in: the African countries where a
 * switched-on provider can pay it out in local money, by mobile money or bank.
 */
export function businessCountries(): string[] {
  return [
    ...new Set(
      payoutDestinations()
        .filter((d) => AFRICA.has(d.country) && d.rails.some((r) => r === "momo" || r === "bank"))
        .map((d) => d.country),
    ),
  ].sort((a, b) => (COUNTRY_NAMES[a] ?? a).localeCompare(COUNTRY_NAMES[b] ?? b));
}

/** How a business in `country` can be paid in `currency`: mobile money, bank, or both. */
export function payoutMethodsFor(currency: Currency, country?: string): ("bank" | "momo")[] {
  const rails = new Set<Rail>(
    payoutDestinations()
      .filter((d) => d.currency === currency && (!country || d.country === country))
      .flatMap((d) => d.rails),
  );
  return (["momo", "bank"] as const).filter((m) => rails.has(m));
}

/** Strip spaces, dashes and a leading plus or zeros; keep digits only. */
export function normalisePhone(raw: string): string {
  return raw.replace(/[^\d]/g, "").replace(/^0+/, "");
}

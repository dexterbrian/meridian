import { z } from "zod";
import { CURRENCY_CODES, PAYOUT_CURRENCIES, type Currency } from "./fees";
import { BUSINESS_COUNTRIES, ISO3 } from "./payaza-codes";
import { REFERENCE_PATTERN } from "./reference";

// Shared between the browser (early checks) and server functions (the real check).

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).optional().default("");
const iso2 = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, "Pick a country");

export const waitlistSchema = z.object({
  business_name: text(200).min(1, "Business name is required"),
  contact_name: text(200).min(1, "Your name is required"),
  email: z.email("Enter a valid email").max(254),
  country: optionalText(100),
  monthly_volume: optionalText(100),
  pain_point: optionalText(2000),
});
export type WaitlistInput = z.input<typeof waitlistSchema>;

export const contactSchema = z.object({
  name: text(200).min(1, "Your name is required"),
  email: z.email("Enter a valid email").max(254),
  company: optionalText(200),
  subject: optionalText(200),
  message: text(5000).min(1, "Message is required"),
});
export type ContactInput = z.input<typeof contactSchema>;

const currency = z.enum(CURRENCY_CODES);
const method = z.enum(["bank", "momo", "card"]);
const amount = z.number().positive().max(1_000_000_000_000);

/* ---------------------------------- demos --------------------------------- */

export const demoCheckoutSchema = z.object({
  amount,
  currency,
  method,
  name: text(200).min(1),
  email: z.email().max(254),
});

export const demoSendSchema = z.object({
  amount,
  from: currency,
  to: currency,
  payout: z.enum(["bank", "momo"]),
  recipient: text(200).min(1),
  email: z.email().max(254),
});

export const demoRequestSchema = z.object({
  fromBusiness: text(200).min(1),
  toBusiness: text(200).min(1),
  toEmail: z.union([z.email().max(254), z.literal("")]).default(""),
  amount,
  currency,
  memo: optionalText(500),
});

export const referenceSchema = z.string().regex(REFERENCE_PATTERN);

export const demoSettleSchema = z.object({
  reference: referenceSchema,
  method,
  payerEmail: z.union([z.email().max(254), z.literal("")]).default(""),
});

/* -------------------------------- business -------------------------------- */

export const businessProfileSchema = z.object({
  name: text(200).min(2, "Enter the business name"),
  trading_name: optionalText(200),
  country: iso2.refine((c) => BUSINESS_COUNTRIES.includes(c), "Pick a country Payaza pays out to"),
  registration_number: optionalText(64),
  tax_number: optionalText(64),
  address: optionalText(500),
  website: z
    .union([z.url("Enter a full web address, starting with https://").max(200), z.literal("")])
    .default(""),
  contact_email: z.union([z.email("Enter a valid email").max(254), z.literal("")]).default(""),
  contact_phone: optionalText(32),
});
export type BusinessProfileInput = z.input<typeof businessProfileSchema>;

export const payoutAccountSchema = z
  .object({
    currency: z.enum(PAYOUT_CURRENCIES as [Currency, ...Currency[]]),
    country: iso2.refine((c) => c in ISO3, "Pick a country"),
    method: z.enum(["bank", "momo"]),
    /** Network code for mobile money, bank code for bank accounts. */
    bank_code: text(32).min(1, "Pick the network or bank"),
    bank_name: optionalText(120),
    /** Phone number for mobile money, account number for bank. */
    account_number: text(40).min(4, "Enter the account or phone number"),
    account_name: text(200).min(2, "Enter the account holder's name"),
  })
  .transform((v) => ({ ...v, account_number: v.account_number.replace(/[\s-]/g, "") }));
export type PayoutAccountInput = z.input<typeof payoutAccountSchema>;

export const paymentRequestSchema = z.object({
  /** Random key from the form so a double click returns the same request. */
  idempotency_key: z.string().min(8).max(64),
  amount,
  currency,
  invoice_number: optionalText(64),
  memo: optionalText(500),
  payer_email: z.union([z.email("Enter a valid email").max(254), z.literal("")]).default(""),
  usage: z.enum(["single", "multi"]).default("single"),
  /** Days until the link stops working. 0 = never. */
  expires_in_days: z.number().int().min(0).max(365).default(0),
});
export type PaymentRequestInput = z.input<typeof paymentRequestSchema>;

/* -------------------------------- pay page -------------------------------- */

export const startPaymentSchema = z.object({
  reference: referenceSchema,
  method,
  payer_name: text(200).min(2, "Enter your name"),
  payer_email: z.email("Enter a valid email").max(254),
  payer_phone: optionalText(32),
  payer_country: iso2,
  /** Mobile money network code, e.g. SAFKEN. Required for mobile money. */
  network: optionalText(16),
});
export type StartPaymentInput = z.input<typeof startPaymentSchema>;

export const xofOtpSchema = z.object({
  transaction_id: z.uuid(),
  otp: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "Enter the code from the SMS"),
});

/* ---------------------------------- admin --------------------------------- */

export const adminFlagActionSchema = z.object({
  flag_id: z.uuid(),
  action: z.enum(["clear", "escalate"]),
  note: optionalText(1000),
});

export const adminTransactionActionSchema = z.object({
  transaction_id: z.uuid(),
  action: z.enum(["release", "reject", "retry_payout", "mark_refunded"]),
  note: optionalText(1000),
});

import { z } from "zod";
import { CURRENCY_CODES } from "./fees";
import { REFERENCE_PATTERN } from "./reference";

// Shared between the browser (early checks) and server functions (the real check).

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).optional().default("");

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

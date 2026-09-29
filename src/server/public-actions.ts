"use server";

import { z } from "zod";
import {
  METHOD_LABEL,
  formatMoney,
  quoteCollection,
  quoteCrossBorder,
  type Currency,
} from "~/lib/fees";
import { makeReference } from "~/lib/reference";
import {
  contactSchema,
  demoCheckoutSchema,
  demoRequestSchema,
  demoSendSchema,
  demoSettleSchema,
  referenceSchema,
  waitlistSchema,
  type ContactInput,
  type WaitlistInput,
} from "~/lib/schemas";
import { sendEmail, sendToAdmin } from "./email/send";
import { contactConfirmation, demoEmail, leadAlert, waitlistConfirmation } from "./email/templates";
import { env } from "./env";
import { RATE_LIMITED, allowRequest, requestOrigin } from "./request";
import { supabaseAdmin } from "./supabase";

/** Whether the app runs against partner sandboxes. Drives the banner. */
export async function getSandboxMode(): Promise<boolean> {
  return env.mode === "sandbox";
}

// Server functions behind the public pages. Every one validates its input,
// is rate limited per IP, and writes with the service role.

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function invalid(error: z.ZodError): { ok: false; error: string } {
  return { ok: false, error: error.issues[0]?.message ?? "Please check the form and try again." };
}

/* -------------------------------- waitlist -------------------------------- */

export async function joinWaitlist(input: WaitlistInput): Promise<ActionResult> {
  const parsed = waitlistSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (!allowRequest("waitlist")) return { ok: false, error: RATE_LIMITED };

  const data = parsed.data;
  const { error } = await supabaseAdmin().from("waitlist_signups").insert(data);
  if (error) {
    console.error("[waitlist] insert failed", error.message);
    return { ok: false, error: "We couldn't save that. Please try again." };
  }

  await Promise.all([
    sendEmail({ ...waitlistConfirmation(data), to: data.email }),
    sendToAdmin(leadAlert({ kind: "waitlist", data }), data.email),
  ]);
  return { ok: true };
}

/* --------------------------------- contact -------------------------------- */

export async function sendContactMessage(input: ContactInput): Promise<ActionResult> {
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (!allowRequest("contact")) return { ok: false, error: RATE_LIMITED };

  const data = parsed.data;
  const { error } = await supabaseAdmin().from("contact_messages").insert(data);
  if (error) {
    console.error("[contact] insert failed", error.message);
    return { ok: false, error: "Message not sent. Please try again." };
  }

  await Promise.all([
    sendEmail({ ...contactConfirmation(data), to: data.email }),
    sendToAdmin(leadAlert({ kind: "contact", data }), data.email),
  ]);
  return { ok: true };
}

/* ---------------------------------- demos --------------------------------- */
// Demos write to demo_transactions only. No money moves.

const MERCHANT = "Ridgeway Hardware Ltd";

export async function runDemoCheckout(
  input: z.input<typeof demoCheckoutSchema>,
): Promise<ActionResult<{ reference: string }>> {
  const parsed = demoCheckoutSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (!allowRequest("demo")) return { ok: false, error: RATE_LIMITED };

  const d = parsed.data;
  const quote = quoteCollection(d.amount, d.method);
  const reference = makeReference();
  const { error } = await supabaseAdmin().from("demo_transactions").insert({
    kind: "checkout",
    reference,
    payer_name: d.name,
    payer_email: d.email,
    merchant: MERCHANT,
    send_currency: d.currency,
    receive_currency: d.currency,
    amount: d.amount,
    partner_fee: quote.partnerFee,
    meridian_fee: quote.meridianFee,
    total_fee: quote.totalFee,
    recipient_gets: quote.recipientGets,
  });
  if (error) console.error("[demo checkout] insert failed", error.message);

  await sendEmail({
    ...demoEmail({
      subject: `Payment confirmation ${reference} — ${MERCHANT}`,
      heading: "Payment received",
      intro: `Demo receipt for your simulated payment to ${MERCHANT}. In the live product this arrives seconds after the money lands.`,
      rows: [
        { label: "Reference", value: reference },
        { label: "Paid to", value: MERCHANT },
        { label: "Amount", value: formatMoney(d.amount, d.currency) },
        { label: "Method", value: METHOD_LABEL[d.method] },
        { label: "Total fees", value: formatMoney(quote.totalFee, d.currency) },
        { label: "You paid", value: formatMoney(quote.payerPays, d.currency) },
        { label: "Merchant receives", value: formatMoney(quote.recipientGets, d.currency) },
      ],
      footnote: "Demo only — no money was collected or moved.",
    }),
    to: d.email,
  });
  return { ok: true, reference };
}

export async function runDemoSend(
  input: z.input<typeof demoSendSchema>,
): Promise<ActionResult<{ reference: string }>> {
  const parsed = demoSendSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (!allowRequest("demo")) return { ok: false, error: RATE_LIMITED };

  const d = parsed.data;
  const quote = quoteCrossBorder(d.amount, d.from, d.to, d.payout);
  const reference = makeReference();
  const { error } = await supabaseAdmin().from("demo_transactions").insert({
    kind: "cross_border",
    reference,
    merchant: d.recipient,
    payer_email: d.email,
    send_currency: d.from,
    receive_currency: d.to,
    amount: d.amount,
    partner_fee: quote.partnerFee,
    meridian_fee: quote.meridianFee,
    total_fee: quote.totalFee,
    recipient_gets: quote.recipientGets,
  });
  if (error) console.error("[demo send] insert failed", error.message);

  await sendEmail({
    ...demoEmail({
      subject: `Transfer ${reference} settled — Meridian demo`,
      heading: "Transfer settled",
      intro: `Demo confirmation for a simulated transfer to ${d.recipient}. In the live product this arrives the moment the payout clears.`,
      rows: [
        { label: "Reference", value: reference },
        { label: "Recipient", value: d.recipient },
        { label: "Amount", value: formatMoney(d.amount, d.from) },
        { label: "Total cost", value: formatMoney(quote.totalFee, d.from) },
        { label: "From your Meridian balance", value: formatMoney(quote.payerPays, d.from) },
        { label: "They received", value: formatMoney(quote.recipientGets, d.to) },
        { label: "Payout method", value: METHOD_LABEL[d.payout] },
        ...(d.destination ? [{ label: "Paid to", value: d.destination }] : []),
      ],
      footnote: "Demo only — no money was moved.",
    }),
    to: d.email,
  });
  return { ok: true, reference };
}

export async function createDemoPaymentLink(
  input: z.input<typeof demoRequestSchema>,
): Promise<ActionResult<{ reference: string; url: string }>> {
  const parsed = demoRequestSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (!allowRequest("demo")) return { ok: false, error: RATE_LIMITED };

  const d = parsed.data;
  const reference = makeReference();
  const { error } = await supabaseAdmin()
    .from("demo_transactions")
    .insert({
      kind: "payment_link",
      status: "pending",
      reference,
      merchant: d.fromBusiness,
      payer_name: d.toBusiness,
      payer_email: d.toEmail || null,
      send_currency: d.currency,
      receive_currency: d.currency,
      amount: d.amount,
      memo: d.memo || null,
    });
  if (error) {
    console.error("[demo link] insert failed", error.message);
    return { ok: false, error: "Could not create the demo request." };
  }

  const url = `${requestOrigin()}/pay/${reference}`;
  if (d.toEmail) {
    await sendEmail({
      ...demoEmail({
        subject: `${d.fromBusiness} requests ${formatMoney(d.amount, d.currency)}`,
        heading: `${d.fromBusiness} sent you a payment request`,
        intro: `Open the link to pay. This is a demo. No money will move.\n${url}`,
        rows: [
          { label: "Reference", value: reference },
          { label: "Amount", value: formatMoney(d.amount, d.currency) },
          { label: "For", value: d.memo || "—" },
          { label: "Payment link", value: url },
        ],
        footnote: "Demo only — no funds are requested or collected.",
      }),
      to: d.toEmail,
    });
  }
  return { ok: true, reference, url };
}

export type DemoPaymentLink = {
  reference: string;
  fromBusiness: string;
  toBusiness: string;
  amount: number;
  currency: Currency;
  memo: string | null;
  status: "pending" | "paid";
};

export async function getDemoPaymentLink(reference: string): Promise<DemoPaymentLink | null> {
  if (!referenceSchema.safeParse(reference).success) return null;
  const { data, error } = await supabaseAdmin()
    .from("demo_transactions")
    .select("reference, merchant, payer_name, amount, send_currency, memo, status")
    .eq("kind", "payment_link")
    .eq("reference", reference)
    .maybeSingle();
  if (error) throw new Error("Could not load the payment request");
  if (!data) return null;
  return {
    reference: data.reference ?? reference,
    fromBusiness: data.merchant ?? "",
    toBusiness: data.payer_name ?? "",
    amount: Number(data.amount),
    currency: data.send_currency as Currency,
    memo: data.memo,
    status: data.status === "paid" ? "paid" : "pending",
  };
}

export async function payDemoPaymentLink(
  input: z.input<typeof demoSettleSchema>,
): Promise<ActionResult> {
  const parsed = demoSettleSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (!allowRequest("demo")) return { ok: false, error: RATE_LIMITED };

  const d = parsed.data;
  const link = await getDemoPaymentLink(d.reference);
  if (!link) return { ok: false, error: "Link not found." };
  if (link.status === "paid") return { ok: true };

  const quote = quoteCollection(link.amount, d.method);
  const { error } = await supabaseAdmin()
    .from("demo_transactions")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      partner_fee: quote.partnerFee,
      meridian_fee: quote.meridianFee,
      total_fee: quote.totalFee,
      recipient_gets: quote.recipientGets,
      ...(d.payerEmail ? { payer_email: d.payerEmail } : {}),
    })
    .eq("kind", "payment_link")
    .eq("reference", d.reference)
    .eq("status", "pending");
  if (error) {
    console.error("[demo link] settle failed", error.message);
    return { ok: false, error: "Payment failed. Please try again." };
  }

  if (d.payerEmail) {
    await sendEmail({
      ...demoEmail({
        subject: `Payment ${d.reference} sent to ${link.fromBusiness}`,
        heading: "Payment sent",
        intro: `Demo confirmation of your simulated payment of ${formatMoney(quote.payerPays, link.currency)} to ${link.fromBusiness}.`,
        rows: [
          { label: "Reference", value: d.reference },
          { label: "Paid to", value: link.fromBusiness },
          { label: "For", value: link.memo ?? "—" },
          { label: "Amount", value: formatMoney(link.amount, link.currency) },
          { label: "Method", value: METHOD_LABEL[d.method] },
          { label: "Total fees", value: formatMoney(quote.totalFee, link.currency) },
          { label: "You paid", value: formatMoney(quote.payerPays, link.currency) },
          { label: "They receive", value: formatMoney(quote.recipientGets, link.currency) },
        ],
        footnote: "Demo only — no money moved.",
      }),
      to: d.payerEmail,
    });
  }
  return { ok: true };
}

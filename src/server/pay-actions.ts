"use server";

import { payerOptions, type PayerOption, type Rail } from "~/lib/providers";
import {
  routedPaySchema,
  startPaymentSchema,
  xofOtpSchema,
  type RoutedPayInput,
  type StartPaymentInput,
} from "~/lib/schemas";
import {
  CollectError,
  attemptView,
  loadPublicRequest,
  simulatePayerApproval,
  startAttempt,
  loadTx,
  pickPayoutAccount,
  submitXofOtp,
  type AttemptView,
  type PublicRequest,
  type StartResult,
} from "./money/collect";
import {
  isRouted,
  quoteRequestPayment,
  simulateRoutedPayin,
  startRoutedPayment,
  type PricedPlan,
} from "./money/routed";
import { RATE_LIMITED, allowRequest, requestOrigin } from "./request";
import { supabaseAdmin } from "./supabase";

// Server functions behind the public pay page. No session: the payer has no
// account. Every write is rate limited per IP and validated.

export type PayResult<T = object> =
  ({ ok: true } & T) | { ok: false; error: string; code?: string };

export async function getPublicRequest(reference: string): Promise<PublicRequest | null> {
  if (!/^MRD-[A-Z2-9]{8}$/.test(reference)) return null;
  return loadPublicRequest(reference);
}

export async function startPayment(input: StartPaymentInput): Promise<PayResult<StartResult>> {
  const parsed = startPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  if (!allowRequest("pay")) return { ok: false, error: RATE_LIMITED };
  try {
    const result = await startAttempt({ ...parsed.data, origin: requestOrigin() });
    return { ok: true, ...result };
  } catch (e) {
    if (e instanceof CollectError) return { ok: false, error: e.message, code: e.code };
    console.error("[pay] startPayment failed", e);
    return { ok: false, error: "We could not start this payment. Please try again." };
  }
}

export async function pollAttempt(transactionId: string): Promise<AttemptView | null> {
  if (!/^[0-9a-f-]{36}$/.test(transactionId)) return null;
  return attemptView(transactionId);
}

export async function submitOtp(input: {
  transaction_id: string;
  otp: string;
}): Promise<PayResult> {
  const parsed = xofOtpSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter the code." };
  if (!allowRequest("pay")) return { ok: false, error: RATE_LIMITED };
  try {
    await submitXofOtp(parsed.data.transaction_id, parsed.data.otp);
    return { ok: true };
  } catch (e) {
    if (e instanceof CollectError) return { ok: false, error: e.message, code: e.code };
    return { ok: false, error: "That code was not accepted." };
  }
}

/** Sandbox only. Plays the payer approving on their phone. */
export async function sandboxApprove(transactionId: string): Promise<PayResult> {
  if (!/^[0-9a-f-]{36}$/.test(transactionId)) return { ok: false, error: "Unknown payment." };
  if (!allowRequest("pay")) return { ok: false, error: RATE_LIMITED };
  try {
    const tx = await loadTx(transactionId);
    if (tx && isRouted(tx)) await simulateRoutedPayin(transactionId);
    else await simulatePayerApproval(transactionId);
    return { ok: true };
  } catch (e) {
    if (e instanceof CollectError) return { ok: false, error: e.message, code: e.code };
    return { ok: false, error: "Could not simulate the approval." };
  }
}

/* --------------------- paying in another currency (routed) ---------------- */

/** Other currencies and rails a payer can use for this request. */
export async function getOtherWaysToPay(reference: string): Promise<PayerOption[]> {
  if (!/^MRD-[A-Z2-9]{8}$/.test(reference)) return [];
  const { data: pr } = await supabaseAdmin()
    .from("payment_requests")
    .select("business_id, currency")
    .eq("reference", reference)
    .maybeSingle();
  if (!pr) return [];
  const account = await pickPayoutAccount(pr.business_id, pr.currency);
  if (!account || account.currency !== pr.currency) return [];
  return payerOptions({
    currency: account.currency,
    rail: account.method === "momo" ? "momo" : "bank",
    country: account.country,
  });
}

export async function quoteOtherCurrency(input: {
  reference: string;
  currency: string;
  rail: Rail;
  country?: string;
}): Promise<PayResult<{ plan: PricedPlan }>> {
  if (!/^MRD-[A-Z2-9]{8}$/.test(input.reference)) return { ok: false, error: "Unknown payment." };
  if (!allowRequest("quote")) return { ok: false, error: RATE_LIMITED };
  try {
    return { ok: true, plan: await quoteRequestPayment(input) };
  } catch (e) {
    if (e instanceof CollectError) return { ok: false, error: e.message, code: e.code };
    console.error("[pay] quoteOtherCurrency failed", e);
    return { ok: false, error: "We could not get a price right now. Please try again." };
  }
}

export async function startOtherCurrencyPayment(
  input: RoutedPayInput,
): Promise<PayResult<{ transactionId: string; reference: string }>> {
  const parsed = routedPaySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  if (!allowRequest("pay")) return { ok: false, error: RATE_LIMITED };
  try {
    return { ok: true, ...(await startRoutedPayment(parsed.data)) };
  } catch (e) {
    if (e instanceof CollectError) return { ok: false, error: e.message, code: e.code };
    console.error("[pay] startOtherCurrencyPayment failed", e);
    return { ok: false, error: "We could not start this payment. Please try again." };
  }
}

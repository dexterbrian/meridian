"use server";

import { startPaymentSchema, xofOtpSchema, type StartPaymentInput } from "~/lib/schemas";
import {
  CollectError,
  attemptView,
  loadPublicRequest,
  simulatePayerApproval,
  startAttempt,
  submitXofOtp,
  type AttemptView,
  type PublicRequest,
  type StartResult,
} from "./money/collect";
import { RATE_LIMITED, allowRequest, requestOrigin } from "./request";

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
    await simulatePayerApproval(transactionId);
    return { ok: true };
  } catch (e) {
    if (e instanceof CollectError) return { ok: false, error: e.message, code: e.code };
    return { ok: false, error: "Could not simulate the approval." };
  }
}

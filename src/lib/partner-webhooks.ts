// Webhooks from the routed providers: checking each one is genuine, then
// reading it into one shape. Pure, so it is unit tested; the routes in
// src/routes/api/webhooks/ do the I/O.
//
// How each provider signs, from its docs (checked 4 October 2026):
//  - Yellow Card: X-YC-Signature = base64 HMAC-SHA256 of the raw body, keyed
//    with the secret of the API key named in the payload's apiKey field.
//  - Kotani Pay: X-Kotani-Signature = "sha256=" + hex HMAC-SHA256 of
//    JSON.stringify({ event, data }).
//  - Klasha: unsigned. Our webhook URL carries a secret token instead, and an
//    event is only matched against a payout reference Klasha gave us.

import type { ProviderId } from "./providers";
import { timingSafeEqual } from "./payaza-webhook";

const enc = new TextEncoder();

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

export async function verifyYellowCardWebhook(
  rawBody: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature || !secret) return false;
  return timingSafeEqual(b64(await hmacSha256(secret, rawBody)), signature.trim());
}

export async function verifyKotaniWebhook(
  body: { event?: unknown; data?: unknown },
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature || !secret) return false;
  const expected = hex(
    await hmacSha256(secret, JSON.stringify({ event: body.event, data: body.data })),
  );
  return timingSafeEqual(expected, signature.trim().replace(/^sha256=/, ""));
}

/* --------------------------------- parsing -------------------------------- */

export type RoutedEvent = {
  provider: ProviderId;
  /** Our reference as the provider echoes it (a payment or its payout, ending -P). Null if it sends only its own id. */
  reference: string | null;
  /** The provider's own id for the payment or payout. */
  partnerRef: string | null;
  /**
   * payin: the payer's money reached the provider. payout: the recipient was
   * paid.
   */
  stage: "payin" | "payout";
  outcome: "success" | "failed" | "pending";
  /** Unique per event, so a repeat delivery changes nothing. */
  key: string;
  reason: string | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

function outcomeOf(status: string | null): RoutedEvent["outcome"] {
  if (!status) return "pending";
  if (/success|complete|paid|settled/i.test(status)) return "success";
  if (/fail|cancel|reject|expire|refund|declin/i.test(status)) return "failed";
  return "pending";
}

export function parseYellowCardWebhook(body: unknown): RoutedEvent | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const event = str(b["event"]);
  if (!event) return null;
  // SEND.* (legacy PAYMENT.*) are payouts; RECEIVE.* (legacy COLLECTION.*) are collections.
  const stage = /^(SEND|PAYMENT)\./.test(event)
    ? "payout"
    : /^(RECEIVE|COLLECTION)\./.test(event)
      ? "payin"
      : null;
  if (!stage) return null;
  const id = str(b["id"]);
  return {
    provider: "yellowcard",
    reference: str(b["sequenceId"]),
    partnerRef: id,
    stage,
    outcome: outcomeOf(event.split(".")[1] ?? str(b["status"])),
    key: `yellowcard:${id ?? str(b["sequenceId"])}:${event}`,
    reason: str(b["errorCode"]),
  };
}

/**
 * Kotani's statuses, from its spec. Most read plainly, but a reversal and an
 * error are failures too, and REQUIRE_REVIEW or a retry still in flight is
 * neither yet.
 */
function kotaniOutcome(status: string | null): RoutedEvent["outcome"] {
  if (status && /^(REVERSED|ERROR_OCCURRED)$/i.test(status)) return "failed";
  return outcomeOf(status);
}

export function parseKotaniWebhook(body: unknown): RoutedEvent | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const event = str(b["event"]);
  const d = (b["data"] ?? {}) as Record<string, unknown>;
  if (!event) return null;
  // Deposit payloads are snake_case and withdrawal payloads camelCase (Kotani docs).
  // Money in is a deposit; money out is a withdrawal.
  const stage = event.includes("deposit") ? "payin" : event.includes("withdraw") ? "payout" : null;
  if (!stage) return null;
  const status = str(d["status"]);
  const reference = str(d["reference_id"]) ?? str(d["referenceId"]) ?? str(d["reference"]);
  return {
    provider: "kotani",
    reference,
    partnerRef: str(d["id"]) ?? str(d["transaction_id"]) ?? str(d["transactionId"]),
    stage,
    outcome: kotaniOutcome(status),
    key: `kotani:${reference}:${event}:${status}`,
    reason: str(d["message"]) ?? str(d["error_message"]) ?? str(d["errorMessage"]),
  };
}

/**
 * What Kotani says when we ask about a payment ourselves, in case its webhook
 * never reached us. The reply's data is the deposit or withdrawal record, so
 * it reads like a webhook's data. Keyed by status: asking twice and hearing the
 * same answer changes nothing.
 */
export function kotaniStatusEvent(
  stage: RoutedEvent["stage"],
  reference: string,
  data: unknown,
): RoutedEvent | null {
  const d = (data ?? {}) as Record<string, unknown>;
  const status = str(d["status"]);
  if (!status) return null;
  return {
    provider: "kotani",
    reference,
    partnerRef: str(d["id"]),
    stage,
    outcome: kotaniOutcome(status),
    key: `kotani:${reference}:status:${stage}:${status}`,
    reason:
      str(d["errorMessage"]) ??
      str(d["transactionError"]) ??
      str(d["transaction_error"]) ??
      str(d["message"]),
  };
}

export function parseKlashaWebhook(body: unknown): RoutedEvent | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const d = (b["data"] ?? b) as Record<string, unknown>;
  const event = str(b["event"]) ?? "payout";
  if (!/payout|transfer|wire/i.test(event)) return null;
  const ref = str(d["reference"]) ?? str(d["transactionReference"]);
  if (!ref) return null;
  const status = str(d["status"]);
  return {
    provider: "klasha",
    // Klasha echoes its own transaction reference, not ours.
    reference: null,
    partnerRef: ref,
    stage: "payout",
    outcome: outcomeOf(status),
    key: `klasha:${ref}:${event}:${status}`,
    reason: str(d["message"]),
  };
}

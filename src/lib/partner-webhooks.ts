// Webhooks from the routed providers: checking each one is genuine, then
// reading it into one shape. Pure, so it is unit tested; the routes in
// src/routes/api/webhooks/ do the I/O.
//
// How each provider signs, from its docs (checked 4 October 2026):
//  - Yellow Card: X-YC-Signature = base64 HMAC-SHA256 of the raw body, keyed
//    with the secret of the API key named in the payload's apiKey field.
//  - Minisend: X-Minisend-Signature-V2 = "t=<unix seconds>,v1=<hex HMAC-SHA256
//    of `${t}.${rawBody}`>", 5 minute tolerance; or the older
//    X-Minisend-Signature = hex HMAC-SHA256 of the raw body.
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

/** Minisend signature tolerance, from its docs. */
export const MINISEND_TOLERANCE_SECONDS = 300;

export async function verifyMinisendWebhook(
  rawBody: string,
  headers: { v1: string | null; v2: string | null },
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!secret) return false;
  if (headers.v2) {
    const parts = Object.fromEntries(
      headers.v2.split(",").map((p) => {
        const i = p.indexOf("=");
        return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
      }),
    );
    const t = Number(parts["t"]);
    const sig = parts["v1"];
    if (!Number.isFinite(t) || !sig) return false;
    if (Math.abs(nowSeconds - t) > MINISEND_TOLERANCE_SECONDS) return false;
    return timingSafeEqual(hex(await hmacSha256(secret, `${t}.${rawBody}`)), sig);
  }
  if (headers.v1) return timingSafeEqual(hex(await hmacSha256(secret, rawBody)), headers.v1.trim());
  return false;
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
   * paid. both: the provider takes the money and pays out in one order (Minisend).
   */
  stage: "payin" | "payout" | "both";
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

export function parseMinisendWebhook(body: unknown): RoutedEvent | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const event = str(b["event"]);
  if (!event?.startsWith("offramp.")) return null;
  const orderId = str(b["order_id"]);
  return {
    provider: "minisend",
    reference: str(b["external_reference"]),
    partnerRef: orderId,
    stage: "both",
    outcome: outcomeOf(event.slice("offramp.".length)),
    key: `minisend:${orderId}:${event}`,
    reason:
      event === "offramp.expired"
        ? "No USDC arrived before the order expired."
        : str(b["failure_reason"]),
  };
}

export function parseKotaniWebhook(body: unknown): RoutedEvent | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const event = str(b["event"]);
  const d = (b["data"] ?? {}) as Record<string, unknown>;
  if (!event) return null;
  // Deposit payloads are snake_case and withdrawal payloads camelCase (Kotani docs).
  // An offramp takes the payer's USDC and pays the recipient in one order.
  const stage = event.includes("offramp")
    ? "both"
    : event.includes("deposit")
      ? "payin"
      : event.includes("withdraw")
        ? "payout"
        : null;
  if (!stage) return null;
  const status = str(d["status"]);
  const reference = str(d["reference_id"]) ?? str(d["referenceId"]) ?? str(d["reference"]);
  return {
    provider: "kotani",
    reference,
    partnerRef: str(d["id"]) ?? str(d["transaction_id"]) ?? str(d["transactionId"]),
    stage,
    outcome: outcomeOf(status),
    key: `kotani:${reference}:${event}:${status}`,
    reason: str(d["message"]) ?? str(d["error_message"]) ?? str(d["errorMessage"]),
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

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

const enc = new TextEncoder();

/** Constant-time string compare so a mismatch cannot be found byte by byte. */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) {
    diff |= (ab[i % ab.length] ?? 0) ^ (bb[i % bb.length] ?? 0);
  }
  return diff === 0;
}

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

/**
 * An onramp has two legs: the payer's mobile money arriving, then the USDC
 * reaching our wallet. It is done only when the USDC has landed, because the
 * offramp spends it. Either leg failing fails it. An offramp's status is the
 * recipient's payout.
 */
function kotaniRampOutcome(stage: RoutedEvent["stage"], d: Record<string, unknown>) {
  const status = str(d["status"]);
  if (stage === "payout") return { status, outcome: kotaniOutcome(status) };
  const deposit = str(d["depositStatus"]) ?? str(d["deposit_status"]);
  const onchain = str(d["onchainStatus"]) ?? str(d["onchain_status"]);
  if (!deposit && !onchain) return { status, outcome: kotaniOutcome(status) };
  const legs = [deposit, onchain].map(kotaniOutcome);
  const outcome: RoutedEvent["outcome"] = legs.includes("failed")
    ? "failed"
    : kotaniOutcome(onchain) === "success"
      ? "success"
      : "pending";
  return { status: `${deposit ?? "-"}/${onchain ?? "-"}`, outcome };
}

function kotaniReason(d: Record<string, unknown>): string | null {
  const nested = (v: unknown) =>
    v && typeof v === "object" ? str((v as Record<string, unknown>)["message"]) : str(v);
  return (
    nested(d["transactionError"]) ??
    nested(d["onchainError"]) ??
    nested(d["error"]) ??
    str(d["errorMessage"]) ??
    str(d["message"])
  );
}

/** Kotani webhooks: an onramp is money in, an offramp is money out. Nothing else is ours. */
export function parseKotaniWebhook(body: unknown): RoutedEvent | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const event = str(b["event"]);
  const d = (b["data"] ?? {}) as Record<string, unknown>;
  if (!event) return null;
  const stage = /\.onramp\./.test(event) ? "payin" : /\.offramp\./.test(event) ? "payout" : null;
  if (!stage) return null;
  const { status, outcome } = kotaniRampOutcome(stage, d);
  const reference = str(d["referenceId"]) ?? str(d["reference_id"]) ?? str(d["reference"]);
  return {
    provider: "kotani",
    reference,
    partnerRef: str(d["id"]) ?? str(d["transactionHash"]),
    stage,
    outcome,
    key: `kotani:${reference}:${event}:${status}`,
    reason: outcome === "failed" ? kotaniReason(d) : null,
  };
}

/**
 * What Kotani says when we ask about an onramp or offramp ourselves, in case
 * its webhook never reached us. The reply's data reads like a webhook's data.
 * Keyed by status: asking twice and hearing the same answer changes nothing.
 */
export function kotaniStatusEvent(
  stage: RoutedEvent["stage"],
  reference: string,
  data: unknown,
): RoutedEvent | null {
  const d = (data ?? {}) as Record<string, unknown>;
  const { status, outcome } = kotaniRampOutcome(stage, d);
  if (!status) return null;
  return {
    provider: "kotani",
    reference,
    partnerRef: str(d["id"]) ?? str(d["transactionHash"]),
    stage,
    outcome,
    key: `kotani:${reference}:status:${stage}:${status}`,
    reason: outcome === "failed" ? kotaniReason(d) : null,
  };
}

/**
 * Passpoint's transfer status (GET .../ft-app/transfer-status). Its docs show
 * "pending" when a transfer starts and "SUCCESSFUL" when done. Passpoint signs
 * webhooks with HMAC-SHA512 but doesn't document how, so we ask instead.
 */
export function passpointStatusEvent(reference: string, data: unknown): RoutedEvent | null {
  const d = (data ?? {}) as Record<string, unknown>;
  const status = str(d["status"]);
  if (!status) return null;
  return {
    provider: "passpoint",
    reference,
    partnerRef: str(d["transactionId"]),
    stage: "payout",
    outcome: outcomeOf(status),
    key: `passpoint:${reference}:status:${status}`,
    reason: str(d["responseMessage"]) ?? str(d["message"]),
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

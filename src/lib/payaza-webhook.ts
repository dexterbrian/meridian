// Payaza webhook verification and parsing. Pure: no I/O, so it is unit tested.
//
// Payaza signs each webhook body with HMAC SHA512 using the merchant's secret
// key and puts the base64 digest in the x-payaza-signature header. The raw body
// must be hashed byte for byte, so the route reads request.text() first and
// only parses JSON after the signature checks out.

const encoder = new TextEncoder();

export async function hmacSha512Base64(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  let out = "";
  for (const b of new Uint8Array(sig)) out += String.fromCharCode(b);
  return btoa(out);
}

/** Constant-time string compare so a mismatch cannot be found byte by byte. */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) {
    diff |= (ab[i % ab.length] ?? 0) ^ (bb[i % bb.length] ?? 0);
  }
  return diff === 0;
}

export async function verifyPayazaSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  const expected = await hmacSha512Base64(secret, rawBody);
  return timingSafeEqual(expected, signatureHeader.trim());
}

export type PayazaEvent =
  | {
      kind: "collection";
      /** Our attempt reference, MRD-XXXXXXXX-N. */
      reference: string;
      /** Payaza's own reference for the payment. */
      partnerReference: string | null;
      outcome: "success" | "failed";
      amountReceived: number | null;
      requestAmount: number | null;
      fee: number | null;
      currency: string | null;
      channel: string | null;
      payerName: string | null;
      amountValidation: "EXACT" | "UNDERPAYMENT" | "OVERPAYMENT" | null;
      statusReason: string | null;
    }
  | {
      kind: "transfer";
      /** Our payout reference, MRDP-XXXXXXXX-N. */
      reference: string;
      outcome: "success" | "failed" | "pending";
      amount: number | null;
      fee: number | null;
      currency: string | null;
      responseMessage: string | null;
      isReversed: boolean;
    };

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

/**
 * Turn a Payaza webhook body into one of two events. Returns null for a body we
 * do not recognise, which the route treats as "acknowledge and ignore".
 *
 * Collections carry `merchant_reference` (our reference) and a status of
 * "Funds Received" or "Transaction Failed". Transfers carry our reference in
 * `transaction_reference` and a NIP_* status.
 */
export function parsePayazaWebhook(body: unknown): PayazaEvent | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  const transferStatus = str(b["transaction_status"]);
  const isTransfer =
    b["transaction_type"] === "DEBIT" ||
    (transferStatus !== null && /^(NIP_|ESCROW_|TRANSACTION_INITIATED)/.test(transferStatus));

  if (isTransfer) {
    const reference = str(b["transaction_reference"]);
    if (!reference) return null;
    const outcome =
      transferStatus === "NIP_SUCCESS"
        ? "success"
        : transferStatus === "NIP_FAILURE" || b["is_reversed"] === true
          ? "failed"
          : "pending";
    return {
      kind: "transfer",
      reference,
      outcome,
      amount: num(b["amount_received"]),
      fee: num(b["transaction_fee"]),
      currency: str(b["currency"]),
      responseMessage: str(b["response_message"]),
      isReversed: b["is_reversed"] === true,
    };
  }

  // Collection. Mobile money webhooks put our reference in merchant_reference;
  // some channels only echo it in transaction_reference.
  const merchantRef = str(b["merchant_reference"]);
  const partnerRef = str(b["transaction_reference"]);
  const reference = merchantRef ?? partnerRef;
  if (!reference) return null;

  const status = (str(b["status"]) ?? str(b["transaction_status"]) ?? "").toLowerCase();
  const outcome: "success" | "failed" | null =
    status === "completed" || status === "funds received"
      ? "success"
      : status === "failed" || status === "transaction failed"
        ? "failed"
        : null;
  if (!outcome) return null;

  const validation = str(b["amount_validation"]);
  const customer = (b["customer"] ?? {}) as Record<string, unknown>;
  const from = (b["received_from"] ?? {}) as Record<string, unknown>;
  const payerName =
    str(from["account_name"]) ??
    [str(customer["first_name"]), str(customer["last_name"])].filter(Boolean).join(" ") ??
    null;

  return {
    kind: "collection",
    reference,
    partnerReference: merchantRef ? partnerRef : null,
    outcome,
    amountReceived: num(b["amount_received"]),
    requestAmount: num(b["request_amount"]),
    fee: num(b["transaction_fee"]),
    currency: str(b["currency_code"]) ?? str(b["currency"]),
    channel: str(b["channel"]),
    payerName: payerName || null,
    amountValidation:
      validation === "EXACT" || validation === "UNDERPAYMENT" || validation === "OVERPAYMENT"
        ? validation
        : null,
    statusReason: str(b["status_reason"]) ?? str(b["response_message"]),
  };
}

/**
 * Idempotency key for a webhook: one per partner event. Payaza has no event id,
 * so the reference plus the outcome stands in. The same "success" twice is one
 * event; a "failed" after a "success" is a different event and gets looked at.
 */
export function webhookIdempotencyKey(event: PayazaEvent): string {
  return `payaza:${event.kind}:${event.reference}:${event.outcome}`;
}

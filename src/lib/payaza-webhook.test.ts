import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  hmacSha512Base64,
  parsePayazaWebhook,
  timingSafeEqual,
  verifyPayazaSignature,
  webhookIdempotencyKey,
} from "./payaza-webhook";

const SECRET = "PZ78-SKTEST-00000000-1111-2222-3333-444444444444";
const BODY = JSON.stringify({
  transaction_reference: "P-C-20260221-PLVOF13731",
  transaction_status: "Funds Received",
  transaction_fee: "3",
  amount_received: "140",
  merchant_reference: "MRD-VNN6FG3X-1",
  status: "Completed",
  channel: "KENYA_COLLECTIONS",
  currency_code: "KES",
  received_from: { account_name: "John Doe", account_number: "254712345678", bank_name: "N/A" },
  customer: { email_address: "j@example.com", first_name: "John", last_name: "Doe" },
  request_amount: 140,
  amount_validation: "EXACT",
});

function nodeSignature(secret: string, body: string) {
  return createHmac("sha512", secret).update(body, "utf8").digest("base64");
}

describe("verifyPayazaSignature", () => {
  it("matches Node's HMAC SHA512 base64, the reference in Payaza's docs", async () => {
    expect(await hmacSha512Base64(SECRET, BODY)).toBe(nodeSignature(SECRET, BODY));
  });

  it("accepts a valid signature", async () => {
    expect(await verifyPayazaSignature(BODY, nodeSignature(SECRET, BODY), SECRET)).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const tampered = BODY.replace('"140"', '"1400"');
    expect(await verifyPayazaSignature(tampered, nodeSignature(SECRET, BODY), SECRET)).toBe(false);
  });

  it("rejects the wrong secret", async () => {
    expect(await verifyPayazaSignature(BODY, nodeSignature("other-secret", BODY), SECRET)).toBe(
      false,
    );
  });

  it("rejects a missing header or secret", async () => {
    expect(await verifyPayazaSignature(BODY, null, SECRET)).toBe(false);
    expect(await verifyPayazaSignature(BODY, nodeSignature(SECRET, BODY), "")).toBe(false);
  });

  it("compares in constant time without leaking length", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});

describe("parsePayazaWebhook", () => {
  it("reads a successful mobile money collection", () => {
    const e = parsePayazaWebhook(JSON.parse(BODY));
    expect(e).toMatchObject({
      kind: "collection",
      reference: "MRD-VNN6FG3X-1",
      partnerReference: "P-C-20260221-PLVOF13731",
      outcome: "success",
      amountReceived: 140,
      requestAmount: 140,
      fee: 3,
      currency: "KES",
      payerName: "John Doe",
      amountValidation: "EXACT",
    });
  });

  it("reads a failed collection", () => {
    const e = parsePayazaWebhook({
      ...JSON.parse(BODY),
      transaction_status: "Transaction Failed",
      status: "Failed",
    });
    expect(e?.kind).toBe("collection");
    expect(e && "outcome" in e && e.outcome).toBe("failed");
  });

  it("reads a successful transfer", () => {
    const e = parsePayazaWebhook({
      transaction_reference: "MRDP-VNN6FG3X-1",
      transaction_type: "DEBIT",
      transaction_status: "NIP_SUCCESS",
      transaction_fee: 10.0,
      amount_received: 20.0,
      is_reversed: false,
      response_message: "Approved or Completely Successful",
      response_code: "00",
      currency: "KES",
    });
    expect(e).toMatchObject({
      kind: "transfer",
      reference: "MRDP-VNN6FG3X-1",
      outcome: "success",
      amount: 20,
      fee: 10,
    });
  });

  it("reads a failed, reversed transfer", () => {
    const e = parsePayazaWebhook({
      transaction_reference: "MRDP-VNN6FG3X-1",
      transaction_type: "DEBIT",
      transaction_status: "NIP_FAILURE",
      is_reversed: true,
      response_message: "Invalid Account",
    });
    expect(e).toMatchObject({ kind: "transfer", outcome: "failed", isReversed: true });
  });

  it("returns null for bodies it does not understand", () => {
    expect(parsePayazaWebhook(null)).toBeNull();
    expect(parsePayazaWebhook("nope")).toBeNull();
    expect(parsePayazaWebhook({ hello: "world" })).toBeNull();
    expect(parsePayazaWebhook({ merchant_reference: "MRD-X", status: "Pending" })).toBeNull();
  });

  it("keys the same event twice to the same idempotency key", () => {
    const a = parsePayazaWebhook(JSON.parse(BODY))!;
    const b = parsePayazaWebhook(JSON.parse(BODY))!;
    expect(webhookIdempotencyKey(a)).toBe(webhookIdempotencyKey(b));
    expect(webhookIdempotencyKey(a)).toBe("payaza:collection:MRD-VNN6FG3X-1:success");
  });
});

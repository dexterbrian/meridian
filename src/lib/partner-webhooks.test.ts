import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseKlashaWebhook,
  parseKotaniWebhook,
  parseYellowCardWebhook,
  verifyKotaniWebhook,
  verifyYellowCardWebhook,
} from "./partner-webhooks";

const hmac = (secret: string, msg: string, enc: "hex" | "base64") =>
  createHmac("sha256", secret).update(msg).digest(enc);

describe("Yellow Card webhook", () => {
  const raw = JSON.stringify({
    id: "yc-1",
    sequenceId: "MRDT-ABCDEFGH-P",
    status: "complete",
    event: "SEND.COMPLETE",
    apiKey: "k",
  });

  it("accepts base64 HMAC-SHA256 of the raw body and rejects a tampered one", async () => {
    expect(await verifyYellowCardWebhook(raw, hmac("s", raw, "base64"), "s")).toBe(true);
    expect(await verifyYellowCardWebhook(raw + " ", hmac("s", raw, "base64"), "s")).toBe(false);
    expect(await verifyYellowCardWebhook(raw, hmac("other", raw, "base64"), "s")).toBe(false);
    expect(await verifyYellowCardWebhook(raw, null, "s")).toBe(false);
  });

  it("reads sends as payouts and receives as payins, legacy names included", () => {
    expect(parseYellowCardWebhook(JSON.parse(raw))).toMatchObject({
      reference: "MRDT-ABCDEFGH-P",
      partnerRef: "yc-1",
      stage: "payout",
      outcome: "success",
    });
    expect(
      parseYellowCardWebhook({
        id: "2",
        sequenceId: "MRD-X-1",
        event: "COLLECTION.FAILED",
        errorCode: "REFUSED",
      }),
    ).toMatchObject({
      stage: "payin",
      outcome: "failed",
      reason: "REFUSED",
    });
    expect(parseYellowCardWebhook({ event: "VIBAN.ACTIVE" })).toBeNull();
  });
});

describe("Kotani webhook", () => {
  const body = {
    event: "transaction.withdrawal.status.updated",
    data: { referenceId: "MRDT-ABCDEFGH-P", status: "SUCCESSFUL", id: "kt-9" },
  };

  it("checks sha256=HMAC of JSON.stringify({event, data})", async () => {
    const sig = `sha256=${hmac("ks", JSON.stringify({ event: body.event, data: body.data }), "hex")}`;
    expect(await verifyKotaniWebhook(body, sig, "ks")).toBe(true);
    expect(
      await verifyKotaniWebhook({ ...body, data: { ...body.data, status: "FAILED" } }, sig, "ks"),
    ).toBe(false);
  });

  it("ignores an event that is neither money in nor money out", () => {
    // Meridian takes ordinary money in and pays ordinary money out, so a crypto
    // offramp event is not ours to act on.
    expect(
      parseKotaniWebhook({
        event: "transaction.offramp.status.updated",
        data: { referenceId: "MRD-ABCDEFGH-1", status: "SUCCESSFUL" },
      }),
    ).toBeNull();
  });

  it("reads withdrawals as payouts (camelCase) and deposits as payins (snake_case)", () => {
    expect(parseKotaniWebhook(body)).toMatchObject({
      reference: "MRDT-ABCDEFGH-P",
      stage: "payout",
      outcome: "success",
      partnerRef: "kt-9",
    });
    expect(
      parseKotaniWebhook({
        event: "transaction.deposit.status.updated",
        data: { reference_id: "MRD-ABCDEFGH-2", status: "FAILED" },
      }),
    ).toMatchObject({ stage: "payin", outcome: "failed" });
  });
});

describe("Klasha webhook", () => {
  it("matches on Klasha's own reference, never ours", () => {
    expect(
      parseKlashaWebhook({ event: "payout", data: { reference: "KL-123", status: "successful" } }),
    ).toMatchObject({
      reference: null,
      partnerRef: "KL-123",
      stage: "payout",
      outcome: "success",
    });
    expect(parseKlashaWebhook({ event: "charge.completed", data: { reference: "x" } })).toBeNull();
  });
});

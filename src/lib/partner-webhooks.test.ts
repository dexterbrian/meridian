import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseKlashaWebhook,
  kotaniStatusEvent,
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

  it("treats a reversal or an error as a failure, and a review as still waiting", () => {
    const withdraw = (status: string) =>
      parseKotaniWebhook({
        event: "transaction.withdraw.status.updated",
        data: { referenceId: "MRDT-ABCDEFGH-P", status },
      })?.outcome;
    expect(withdraw("REVERSED")).toBe("failed");
    expect(withdraw("ERROR_OCCURRED")).toBe("failed");
    expect(withdraw("TRANSACTION_RETRY_FAILED")).toBe("failed");
    expect(withdraw("REQUIRE_REVIEW")).toBe("pending");
    expect(withdraw("TRANSACTION_RETRY")).toBe("pending");
  });
});

describe("Kotani status check", () => {
  it("reads a deposit's status the way it reads the webhook", () => {
    // The shape of GET /deposit/mobile-money/status/{reference_id} in Kotani's spec.
    expect(
      kotaniStatusEvent("payin", "MRD-ABCDEFGH-2", {
        id: "dep-77",
        reference_id: "MRD-ABCDEFGH-2",
        status: "SUCCESSFUL",
        amount: 1500,
      }),
    ).toEqual({
      provider: "kotani",
      reference: "MRD-ABCDEFGH-2",
      partnerRef: "dep-77",
      stage: "payin",
      outcome: "success",
      key: "kotani:MRD-ABCDEFGH-2:status:payin:SUCCESSFUL",
      reason: null,
    });
  });

  it("carries a failed withdrawal's reason, and ignores a reply with no status", () => {
    expect(
      kotaniStatusEvent("payout", "MRDT-ABCDEFGH-P", {
        status: "FAILED",
        errorMessage: "Recipient wallet is not registered",
      }),
    ).toMatchObject({ outcome: "failed", reason: "Recipient wallet is not registered" });
    expect(kotaniStatusEvent("payout", "MRDT-ABCDEFGH-P", {})).toBeNull();
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

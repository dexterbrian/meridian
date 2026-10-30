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
    event: "transaction.offramp.status.updated",
    data: { referenceId: "MRDT-ABCDEFGH-P", status: "SUCCESSFUL", id: "kt-9" },
  };

  it("checks sha256=HMAC of JSON.stringify({event, data})", async () => {
    const sig = `sha256=${hmac("ks", JSON.stringify({ event: body.event, data: body.data }), "hex")}`;
    expect(await verifyKotaniWebhook(body, sig, "ks")).toBe(true);
    expect(
      await verifyKotaniWebhook({ ...body, data: { ...body.data, status: "FAILED" } }, sig, "ks"),
    ).toBe(false);
  });

  it("reads an offramp as the payout, and ignores events that are neither in nor out", () => {
    expect(parseKotaniWebhook(body)).toMatchObject({
      reference: "MRDT-ABCDEFGH-P",
      stage: "payout",
      outcome: "success",
      partnerRef: "kt-9",
    });
    expect(
      parseKotaniWebhook({ event: "kyc.status.changed", data: { status: "SUCCESSFUL" } }),
    ).toBeNull();
  });

  it("counts an onramp as money in only once the USDC reaches our wallet", () => {
    const onramp = (depositStatus: string, onchainStatus: string) =>
      parseKotaniWebhook({
        event: "transaction.onramp.status.updated",
        data: { referenceId: "MRD-ABCDEFGH-2", depositStatus, onchainStatus },
      });
    // The payer has paid, but the USDC is still on its way: not yet.
    expect(onramp("SUCCESSFUL", "PENDING")).toMatchObject({ stage: "payin", outcome: "pending" });
    expect(onramp("SUCCESSFUL", "SUCCESSFUL")).toMatchObject({ outcome: "success" });
    expect(onramp("FAILED", "PENDING")).toMatchObject({ outcome: "failed" });
    // Each stage of the same onramp is its own event, so a later one isn't a repeat.
    expect(onramp("SUCCESSFUL", "PENDING")!.key).not.toBe(onramp("SUCCESSFUL", "SUCCESSFUL")!.key);
  });

  it("treats a reversal or an error as a failure, and a review as still waiting", () => {
    const offramp = (status: string) =>
      parseKotaniWebhook({
        event: "transaction.offramp.status.updated",
        data: { referenceId: "MRDT-ABCDEFGH-P", status },
      })?.outcome;
    expect(offramp("REVERSED")).toBe("failed");
    expect(offramp("ERROR_OCCURRED")).toBe("failed");
    expect(offramp("TRANSACTION_RETRY_FAILED")).toBe("failed");
    expect(offramp("REQUIRE_REVIEW")).toBe("pending");
    expect(offramp("TRANSACTION_RETRY")).toBe("pending");
  });
});

describe("Kotani status check", () => {
  it("reads an onramp's status the way it reads the webhook", () => {
    // The shape of GET /onramp/{referenceId} in Kotani's spec.
    expect(
      kotaniStatusEvent("payin", "MRD-ABCDEFGH-2", {
        referenceId: "MRD-ABCDEFGH-2",
        depositStatus: "SUCCESSFUL",
        onchainStatus: "SUCCESSFUL",
        transactionHash: "0xabc",
        cryptoAmount: 1020.37,
      }),
    ).toEqual({
      provider: "kotani",
      reference: "MRD-ABCDEFGH-2",
      partnerRef: "0xabc",
      stage: "payin",
      outcome: "success",
      key: "kotani:MRD-ABCDEFGH-2:status:payin:SUCCESSFUL/SUCCESSFUL",
      reason: null,
    });
  });

  it("carries a failed offramp's reason, and ignores a reply with no status", () => {
    expect(
      kotaniStatusEvent("payout", "MRDT-ABCDEFGH-P", {
        status: "FAILED",
        transactionError: { message: "Recipient wallet is not registered" },
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

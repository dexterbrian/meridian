import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseKlashaWebhook,
  parseKotaniWebhook,
  parseMinisendWebhook,
  parseYellowCardWebhook,
  verifyKotaniWebhook,
  verifyMinisendWebhook,
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

describe("Minisend webhook", () => {
  const raw = JSON.stringify({
    event: "offramp.completed",
    order_id: "o-1",
    external_reference: "MRD-ABCDEFGH-1",
    status: "completed",
  });

  it("accepts the timestamped V2 signature within five minutes only", async () => {
    const t = 1_800_000_000;
    const v2 = `t=${t},v1=${hmac("w", `${t}.${raw}`, "hex")}`;
    expect(await verifyMinisendWebhook(raw, { v1: null, v2 }, "w", t + 60)).toBe(true);
    expect(await verifyMinisendWebhook(raw, { v1: null, v2 }, "w", t + 301)).toBe(false);
    expect(await verifyMinisendWebhook(raw.replace("o-1", "o-2"), { v1: null, v2 }, "w", t)).toBe(
      false,
    );
  });

  it("falls back to the V1 signature of the raw body", async () => {
    expect(await verifyMinisendWebhook(raw, { v1: hmac("w", raw, "hex"), v2: null }, "w")).toBe(
      true,
    );
    expect(await verifyMinisendWebhook(raw, { v1: null, v2: null }, "w")).toBe(false);
  });

  it("reads completed, failed and expired orders", () => {
    expect(parseMinisendWebhook(JSON.parse(raw))).toMatchObject({
      reference: "MRD-ABCDEFGH-1",
      stage: "both",
      outcome: "success",
      key: "minisend:o-1:offramp.completed",
    });
    expect(parseMinisendWebhook({ event: "offramp.expired", order_id: "o-1" })?.outcome).toBe(
      "failed",
    );
    expect(parseMinisendWebhook({ event: "checkout.completed" })).toBeNull();
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

  it("reads an offramp as one order that takes the USDC and pays out", () => {
    expect(
      parseKotaniWebhook({
        event: "transaction.offramp.status.updated",
        data: { referenceId: "MRD-ABCDEFGH-1", status: "SUCCESSFUL" },
      }),
    ).toMatchObject({ stage: "both", outcome: "success" });
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

import { describe, expect, it } from "vitest";
import {
  LARGE_AMOUNT_USD,
  checksBeforeCharge,
  checksOnCollected,
  namesMatch,
  strongestAction,
} from "./checks";

const openRequest = { status: "active", usage: "single", paidCount: 0 };

describe("checksBeforeCharge", () => {
  it("blocks a payer in a FATF blacklisted country", () => {
    const hits = checksBeforeCharge({ payerCountry: "kp", usdEquivalent: 10 });
    expect(hits.map((h) => h.rule)).toEqual(["H_FATF_BLACKLIST"]);
    expect(strongestAction(hits)).toBe("block");
  });

  it("flags but does not stop a large payment", () => {
    const hits = checksBeforeCharge({ payerCountry: "DE", usdEquivalent: LARGE_AMOUNT_USD });
    expect(hits.map((h) => h.rule)).toEqual(["H_LARGE_AMOUNT"]);
    expect(strongestAction(hits)).toBe("none");
  });

  it("passes an ordinary payment", () => {
    expect(checksBeforeCharge({ payerCountry: "GH", usdEquivalent: 500 })).toEqual([]);
    expect(checksBeforeCharge({ payerCountry: null, usdEquivalent: 9999.99 })).toEqual([]);
  });

  it("applies the strongest action", () => {
    const hits = checksBeforeCharge({ payerCountry: "IR", usdEquivalent: 50_000 });
    expect(hits).toHaveLength(2);
    expect(strongestAction(hits)).toBe("block");
  });
});

describe("checksOnCollected", () => {
  const base = {
    expectedTotal: 10309.28,
    amountReceived: 10309.28,
    currency: "KES",
    reportedCurrency: "KES",
    request: openRequest,
    expectedPartnerFee: 206.19,
    reportedPartnerFee: 206.19,
  };

  it("passes an exact payment against an open request", () => {
    expect(checksOnCollected(base)).toEqual([]);
  });

  it("holds when the amount received is wrong", () => {
    const hits = checksOnCollected({ ...base, amountReceived: 10000 });
    expect(hits.map((h) => h.rule)).toEqual(["H_AMOUNT_MISMATCH"]);
    expect(strongestAction(hits)).toBe("hold");
  });

  it("ignores sub-cent noise", () => {
    expect(checksOnCollected({ ...base, amountReceived: 10309.284 })).toEqual([]);
  });

  it("holds when the request was already paid (single use)", () => {
    const hits = checksOnCollected({
      ...base,
      request: { status: "paid", usage: "single", paidCount: 1 },
    });
    expect(hits.map((h) => h.rule)).toEqual(["H_REQUEST_NOT_OPEN"]);
    expect(strongestAction(hits)).toBe("hold");
  });

  it("allows a second payment on a multi-use request", () => {
    expect(
      checksOnCollected({ ...base, request: { status: "active", usage: "multi", paidCount: 5 } }),
    ).toEqual([]);
  });

  it("holds when the request was disabled", () => {
    const hits = checksOnCollected({ ...base, request: { ...openRequest, status: "disabled" } });
    expect(strongestAction(hits)).toBe("hold");
  });

  it("flags a fee gap over one cent without holding", () => {
    const hits = checksOnCollected({ ...base, reportedPartnerFee: 250 });
    expect(hits.map((h) => h.rule)).toEqual(["H_FEE_MISMATCH"]);
    expect(strongestAction(hits)).toBe("none");
    expect(checksOnCollected({ ...base, reportedPartnerFee: 206.2 })).toEqual([]);
  });

  it("ignores a zero fee in sandbox, where Payaza charges nothing", () => {
    expect(checksOnCollected({ ...base, reportedPartnerFee: 0, sandbox: true })).toEqual([]);
    // A real gap still shows in sandbox, and a zero fee still shows in live.
    expect(
      checksOnCollected({ ...base, reportedPartnerFee: 250, sandbox: true }).map((h) => h.rule),
    ).toEqual(["H_FEE_MISMATCH"]);
    expect(
      checksOnCollected({ ...base, reportedPartnerFee: 0, sandbox: false }).map((h) => h.rule),
    ).toEqual(["H_FEE_MISMATCH"]);
  });

  it("holds on a currency mismatch", () => {
    const hits = checksOnCollected({ ...base, reportedCurrency: "USD" });
    expect(hits.map((h) => h.rule)).toEqual(["H_CURRENCY_MISMATCH"]);
  });

  it("copes with a webhook that omits the amount", () => {
    expect(checksOnCollected({ ...base, amountReceived: null, reportedPartnerFee: null })).toEqual(
      [],
    );
  });
});

describe("namesMatch", () => {
  it("ignores case, punctuation and company suffixes", () => {
    expect(namesMatch("Kilimo Fresh Exports Ltd", "KILIMO FRESH EXPORTS LIMITED")).toBe(true);
    expect(namesMatch("Ann's Flowers Ltd.", "ANNS FLOWERS")).toBe(true);
  });

  it("accepts a partial match of at least half the words", () => {
    expect(namesMatch("Kilimo Fresh Exports", "Kilimo Fresh")).toBe(true);
  });

  it("rejects a different name", () => {
    expect(namesMatch("Kilimo Fresh Exports", "Chibunkem Ojiaku")).toBe(false);
    expect(namesMatch("", "Anything")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  LARGE_AMOUNT_USD,
  checksBeforeCharge,
  checksBeforeTransfer,
  namesMatch,
  strongestAction,
} from "./checks";

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

describe("checksBeforeTransfer", () => {
  it("blocks payments to a FATF blacklisted country", () => {
    const hits = checksBeforeTransfer({
      recipientCountry: "ir",
      usdEquivalent: 100,
      newRecipient: false,
    });
    expect(strongestAction(hits)).toBe("block");
  });

  it("holds a large first payment to a new recipient, but only notes it for a known one", () => {
    const first = checksBeforeTransfer({
      recipientCountry: "CN",
      usdEquivalent: 10_000,
      newRecipient: true,
    });
    expect(first).toMatchObject([{ rule: "T_LARGE_FIRST_PAYMENT", action: "hold" }]);
    const known = checksBeforeTransfer({
      recipientCountry: "CN",
      usdEquivalent: 25_000,
      newRecipient: false,
    });
    expect(known).toMatchObject([{ rule: "T_LARGE_AMOUNT", action: "none" }]);
  });

  it("lets a small payment through untouched", () => {
    expect(
      checksBeforeTransfer({ recipientCountry: "JP", usdEquivalent: 9_999, newRecipient: true }),
    ).toEqual([]);
  });
});

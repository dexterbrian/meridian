import { describe, expect, it } from "vitest";
import { formatMoney, meridianFee, quoteCollection, quoteCrossBorder } from "./fees";

describe("meridianFee", () => {
  it("is 1% of the amount", () => {
    expect(meridianFee(1000)).toBe(10);
    expect(meridianFee(48500)).toBe(485);
  });

  it("rounds to cents, half up", () => {
    expect(meridianFee(0.5)).toBe(0.01);
    expect(meridianFee(1.005)).toBe(0.01);
    expect(meridianFee(123.45)).toBe(1.23);
    expect(meridianFee(123.5)).toBe(1.24);
  });

  it("is zero for zero", () => {
    expect(meridianFee(0)).toBe(0);
  });
});

describe("demo quotes", () => {
  it("collection: partner fee plus 1%", () => {
    const q = quoteCollection(10000, "momo");
    expect(q.partnerFee).toBeCloseTo(200);
    expect(q.meridianFee).toBeCloseTo(100);
    expect(q.totalFee).toBeCloseTo(300);
    expect(q.recipientGets).toBeCloseTo(9700);
    expect(q.effectiveRate).toBeCloseTo(0.03);
  });

  it("collection with zero amount has no NaN", () => {
    expect(quoteCollection(0, "card").effectiveRate).toBe(0);
  });

  it("cross-border adds nothing for conversion", () => {
    const q = quoteCrossBorder(129000, "KES", "USD", "bank");
    expect(q.totalFee).toBeCloseTo(q.partnerFee + q.meridianFee);
    // 129,000 KES less 2% is 126,420 KES, which is 980 USD at the demo rate.
    expect(q.recipientGets).toBeCloseTo(980);
  });
});

describe("formatMoney", () => {
  it("drops decimals for large-unit currencies", () => {
    expect(formatMoney(1500000, "NGN")).toBe("₦1,500,000");
    expect(formatMoney(1500, "KES")).toBe("KSh1,500.00");
  });
});

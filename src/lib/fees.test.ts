import { describe, expect, it } from "vitest";
import { formatMoney, meridianFee, quoteCollection, quoteCrossBorder, round2 } from "./fees";

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
  it("collection: partner fee plus 1%, both charged on what the payer pays", () => {
    // 10,000 / (1 - 3%) = 10,309.28. 2% and 1% of that are the fees.
    const q = quoteCollection(10000, "momo");
    expect(q.payerPays).toBe(10309.28);
    expect(q.partnerFee).toBe(206.19);
    expect(q.meridianFee).toBe(103.09);
    expect(q.totalFee).toBe(309.28);
    expect(q.recipientGets).toBe(10000);
    expect(q.effectiveRate).toBeCloseTo(0.03);
  });

  it("collection: the merchant receives exactly the requested amount", () => {
    // A USD 36,000 payment link paid by card: 2.5% partner + 1% Meridian, on the total.
    const q = quoteCollection(36000, "card");
    expect(q.payerPays).toBe(37305.7);
    expect(q.partnerFee).toBe(932.64); // 2.5% of 37,305.70
    expect(q.meridianFee).toBe(373.06); // 1% of 37,305.70
    expect(round2(q.payerPays - q.totalFee)).toBe(36000);
  });

  it("collection: payer total less fees is exact for awkward amounts", () => {
    for (const amount of [1, 99.99, 12345.67, 48500, 1_000_003]) {
      for (const m of ["bank", "momo", "card"] as const) {
        const q = quoteCollection(amount, m);
        expect(round2(q.payerPays - q.totalFee)).toBe(amount);
      }
    }
  });

  it("collection: whole-unit currencies charge a whole number and still net to the amount", () => {
    // M-Pesa moves whole shillings. 650,000 / 0.97 = 670,103.09 rounds up to 670,104;
    // the 91 cents go to the partner fee line, so the business still gets exactly 650,000.
    const q = quoteCollection(650000, "momo", "KES");
    expect(q.payerPays).toBe(670104);
    expect(Number.isInteger(q.payerPays)).toBe(true);
    expect(round2(q.payerPays - q.totalFee)).toBe(650000);
    expect(q.meridianFee).toBe(6701.04);
    for (const amount of [1, 7, 999, 12345, 650000]) {
      for (const code of ["KES", "UGX", "TZS", "XOF", "CDF"] as const) {
        const w = quoteCollection(amount, "momo", code);
        expect(Number.isInteger(w.payerPays)).toBe(true);
        expect(round2(w.payerPays - w.totalFee)).toBe(amount);
      }
    }
    // Two-decimal currencies keep cents.
    expect(quoteCollection(650000, "momo", "GHS").payerPays).toBe(670103.09);
  });

  it("collection: no fees until a method is picked", () => {
    const q = quoteCollection(36000, null);
    expect(q.totalFee).toBe(0);
    expect(q.payerPays).toBe(36000);
    expect(q.recipientGets).toBe(36000);
  });

  it("collection with zero amount has no NaN", () => {
    expect(quoteCollection(0, "card").effectiveRate).toBe(0);
  });

  it("cross-border adds nothing for conversion", () => {
    const q = quoteCrossBorder(129000, "KES", "USD", "bank");
    expect(q.totalFee).toBeCloseTo(q.partnerFee + q.meridianFee);
    // The sender pays 2% of the total on top. The full 129,000 KES converts to 1,000 USD.
    expect(q.payerPays).toBe(131632.65);
    expect(round2(q.payerPays - q.totalFee)).toBe(129000);
    expect(q.recipientGets).toBeCloseTo(1000);
  });
});

describe("formatMoney", () => {
  it("drops decimals for large-unit currencies", () => {
    expect(formatMoney(1500000, "NGN")).toBe("₦1,500,000");
    expect(formatMoney(1500, "KES")).toBe("KES 1,500.00");
  });
});

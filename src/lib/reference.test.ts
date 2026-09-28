import { describe, expect, it } from "vitest";
import {
  MAX_ATTEMPTS,
  PAYAZA_MAX_REFERENCE_LENGTH,
  REFERENCE_ALPHABET,
  attemptReference,
  isAttemptReference,
  isPayoutReference,
  isReference,
  makeReference,
  parseAttemptReference,
  payoutReference,
} from "./reference";

describe("makeReference", () => {
  it("has the MRD-XXXXXXXX format", () => {
    for (let i = 0; i < 200; i++) expect(isReference(makeReference())).toBe(true);
  });

  it("never uses ambiguous characters", () => {
    for (const c of "0O1I") expect(REFERENCE_ALPHABET).not.toContain(c);
    const bodies = Array.from({ length: 500 }, () => makeReference().slice(4)).join("");
    expect(bodies).not.toMatch(/[01OI]/);
  });

  it("does not repeat in practice", () => {
    const refs = new Set(Array.from({ length: 1000 }, makeReference));
    expect(refs.size).toBe(1000);
  });

  it("rejects lookalikes", () => {
    expect(isReference("MRD-7K3PQ2X0")).toBe(false);
    expect(isReference("mrd-7K3PQ2XA")).toBe(false);
    expect(isReference("MRD-7K3PQ2X")).toBe(false);
  });
});

describe("attemptReference", () => {
  it("appends the attempt number in base 36", () => {
    expect(attemptReference("MRD-VNN6FG3X", 1)).toBe("MRD-VNN6FG3X-1");
    expect(attemptReference("MRD-VNN6FG3X", 10)).toBe("MRD-VNN6FG3X-A");
    expect(attemptReference("MRD-VNN6FG3X", 36)).toBe("MRD-VNN6FG3X-10");
    expect(attemptReference("MRD-VNN6FG3X", MAX_ATTEMPTS)).toBe("MRD-VNN6FG3X-ZZ");
  });

  it("stays within Payaza's 15-character card limit", () => {
    for (const n of [1, 9, 10, 35, 36, 100, MAX_ATTEMPTS]) {
      expect(attemptReference("MRD-VNN6FG3X", n).length).toBeLessThanOrEqual(
        PAYAZA_MAX_REFERENCE_LENGTH,
      );
    }
  });

  it("refuses out-of-range attempts and bad request references", () => {
    expect(() => attemptReference("MRD-VNN6FG3X", 0)).toThrow();
    expect(() => attemptReference("MRD-VNN6FG3X", MAX_ATTEMPTS + 1)).toThrow();
    expect(() => attemptReference("MRD-VNN6FG3", 1)).toThrow();
  });

  it("matches what the database function produces", () => {
    // to_base36 in SQL uses the same 0-9A-Z digits, upper case.
    expect(attemptReference("MRD-VNN6FG3X", 47)).toBe("MRD-VNN6FG3X-1B");
  });

  it("round-trips through parse", () => {
    const parsed = parseAttemptReference("MRD-VNN6FG3X-1B");
    expect(parsed).toEqual({ requestReference: "MRD-VNN6FG3X", attemptNo: 47 });
    expect(parseAttemptReference("MRD-VNN6FG3X")).toBeNull();
    expect(isAttemptReference("MRD-VNN6FG3X-1")).toBe(true);
    expect(isAttemptReference("MRD-VNN6FG3X-")).toBe(false);
  });
});

describe("payoutReference", () => {
  it("swaps the prefix and keeps the attempt", () => {
    expect(payoutReference("MRD-VNN6FG3X-1")).toBe("MRDP-VNN6FG3X-1");
    expect(isPayoutReference("MRDP-VNN6FG3X-1")).toBe(true);
  });

  it("meets Payaza Transfers' 10-character minimum", () => {
    expect(payoutReference("MRD-VNN6FG3X-1").length).toBeGreaterThanOrEqual(10);
  });

  it("refuses a request reference", () => {
    expect(() => payoutReference("MRD-VNN6FG3X")).toThrow();
  });
});

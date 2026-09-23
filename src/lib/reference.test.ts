import { describe, expect, it } from "vitest";
import { REFERENCE_ALPHABET, isReference, makeReference } from "./reference";

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

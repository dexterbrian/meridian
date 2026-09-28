import { describe, expect, it } from "vitest";
import { expiryFrom, requestEditRules } from "./request-edit";

describe("requestEditRules", () => {
  it("allows everything on an active request nobody has tried to pay", () => {
    expect(requestEditRules({ status: "active", attempt_count: 0 })).toEqual({
      canEdit: true,
      canEditAmount: true,
      reason: null,
    });
  });

  it("locks amount, currency and usage once a payer has started", () => {
    const r = requestEditRules({ status: "active", attempt_count: 1 });
    expect(r.canEdit).toBe(true);
    expect(r.canEditAmount).toBe(false);
    expect(r.reason).toMatch(/already started paying/);
  });

  it("blocks all edits on a request that is no longer active", () => {
    for (const status of ["paid", "expired", "disabled"]) {
      const r = requestEditRules({ status, attempt_count: 0 });
      expect(r.canEdit).toBe(false);
      expect(r.canEditAmount).toBe(false);
      expect(r.reason).toContain(status);
    }
  });
});

describe("expiryFrom", () => {
  const now = Date.UTC(2026, 8, 28, 12, 0, 0);

  it("keeps the current expiry for -1", () => {
    expect(expiryFrom(-1, now)).toBeUndefined();
  });

  it("clears the expiry for 0", () => {
    expect(expiryFrom(0, now)).toBeNull();
  });

  it("sets a date the given number of days ahead", () => {
    expect(expiryFrom(7, now)).toBe("2026-10-05T12:00:00.000Z");
  });
});

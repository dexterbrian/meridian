import { describe, expect, it } from "vitest";
import {
  confirmEmailAllowance,
  hashToken,
  isTokenShaped,
  linkExpired,
  looksLikeABot,
  newConfirmToken,
} from "./waitlist-confirmation";

const NOW = new Date("2026-10-06T09:00:00Z").getTime();
const HOUR = 60 * 60 * 1000;

describe("newConfirmToken", () => {
  it("makes a long random token and stores only its hash", () => {
    const a = newConfirmToken();
    const b = newConfirmToken();
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(hashToken(a.token));
    expect(a.hash).not.toContain(a.token);
    expect(isTokenShaped(a.token)).toBe(true);
  });
});

describe("looksLikeABot", () => {
  it("flags a filled hidden field", () => {
    expect(looksLikeABot({ website: "http://spam.example" }, NOW)).toBe(true);
  });
  it("flags a form sent within 3 seconds of loading", () => {
    expect(looksLikeABot({ renderedAt: NOW - 1_000 }, NOW)).toBe(true);
  });
  it("lets a person through", () => {
    expect(looksLikeABot({ website: "", renderedAt: NOW - 20_000 }, NOW)).toBe(false);
  });
  it("skips the timing check when the page script didn't run", () => {
    expect(looksLikeABot({ website: "", renderedAt: 0 }, NOW)).toBe(false);
    expect(looksLikeABot({}, NOW)).toBe(false);
  });
});

describe("confirmEmailAllowance", () => {
  it("allows the first three emails in a day, then stops", () => {
    const recent = new Date(NOW - HOUR).toISOString();
    expect(
      confirmEmailAllowance({ confirm_emails_sent: 0, last_confirm_sent_at: null }, NOW),
    ).toEqual({ send: true, sentInWindow: 0 });
    expect(
      confirmEmailAllowance({ confirm_emails_sent: 2, last_confirm_sent_at: recent }, NOW).send,
    ).toBe(true);
    expect(
      confirmEmailAllowance({ confirm_emails_sent: 3, last_confirm_sent_at: recent }, NOW).send,
    ).toBe(false);
  });
  it("starts counting again a day after the last email", () => {
    const old = new Date(NOW - 25 * HOUR).toISOString();
    expect(
      confirmEmailAllowance({ confirm_emails_sent: 3, last_confirm_sent_at: old }, NOW),
    ).toEqual({ send: true, sentInWindow: 0 });
  });
});

describe("linkExpired", () => {
  it("expires after the stored time", () => {
    expect(linkExpired({ confirm_expires_at: new Date(NOW - 1).toISOString() }, NOW)).toBe(true);
    expect(linkExpired({ confirm_expires_at: new Date(NOW + HOUR).toISOString() }, NOW)).toBe(
      false,
    );
    expect(linkExpired({ confirm_expires_at: null }, NOW)).toBe(false);
  });
});

describe("isTokenShaped", () => {
  it("rejects anything that isn't one of our tokens", () => {
    expect(isTokenShaped("")).toBe(false);
    expect(isTokenShaped("short")).toBe(false);
    expect(isTokenShaped("x".repeat(500))).toBe(false);
    expect(isTokenShaped("abc'; drop table--abcdefghijk")).toBe(false);
    expect(isTokenShaped(undefined)).toBe(false);
  });
});

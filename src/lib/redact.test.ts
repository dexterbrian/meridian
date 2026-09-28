import { describe, expect, it } from "vitest";
import { redact } from "./redact";

describe("redact", () => {
  it("hides secrets at any depth and keeps the rest", () => {
    expect(
      redact({
        apiKey: "re_123",
        to: "amina@kilimo.co.ke",
        nested: { client_secret: "s", account_number: "0123", bank: "KCB" },
        people: [{ id_number: "12345678", full_name: "Amina W." }],
        headers: { Authorization: "Bearer x" },
      }),
    ).toEqual({
      apiKey: "[redacted]",
      to: "amina@kilimo.co.ke",
      nested: { client_secret: "[redacted]", account_number: "[redacted]", bank: "KCB" },
      people: [{ id_number: "[redacted]", full_name: "Amina W." }],
      headers: { Authorization: "[redacted]" },
    });
  });

  it("hides the Payaza transaction PIN", () => {
    expect(redact({ service_payload: { transaction_pin: 123456, currency: "KES" } })).toEqual({
      service_payload: { transaction_pin: "[redacted]", currency: "KES" },
    });
  });

  it("passes plain values through", () => {
    expect(redact("x")).toBe("x");
    expect(redact(null)).toBe(null);
  });
});

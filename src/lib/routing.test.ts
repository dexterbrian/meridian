import { describe, expect, it } from "vitest";
import {
  funderOptions,
  payerOptions,
  payerRails,
  payoutDestinations,
  providersFor,
} from "./providers";
import {
  NotRetryable,
  candidates,
  estimateQuote,
  executeWithFallback,
  midRate,
  priceRoute,
  rankQuotes,
  withCost,
  type RouteQuote,
  type RouteRequest,
} from "./routing";

const ids = (m: { provider: string }[]) => m.map((x) => x.provider);

describe("providersFor: which providers can carry a payment", () => {
  it("Africa to Africa in local currencies: Ghana MoMo cedis to a Kenyan M-Pesa", () => {
    const m = providersFor(
      { currency: "GHS", rail: "momo", country: "GH" },
      { currency: "KES", rail: "momo", country: "KE" },
    );
    expect(ids(m)).toEqual(expect.arrayContaining(["kotani", "yellowcard"]));
    // Payaza can't convert, so it never carries a cross-currency payment.
    expect(ids(m)).not.toContain("payaza");
  });

  it("same currency in Kenya: Payaza joins the candidates", () => {
    const m = providersFor(
      { currency: "KES", rail: "momo", country: "KE" },
      { currency: "KES", rail: "momo", country: "KE" },
    );
    expect(ids(m)).toEqual(expect.arrayContaining(["payaza", "kotani", "yellowcard", "minisend"]));
  });

  it("Europe to Africa: a EUR buyer pays by SEPA into a Yellow Card virtual account", () => {
    const m = providersFor(
      { currency: "EUR", rail: "virtual_account" },
      { currency: "KES", rail: "momo", country: "KE" },
    );
    expect(ids(m)).toEqual(["yellowcard"]);
  });

  it("Middle East or anywhere to Africa in USD: virtual account or stablecoin", () => {
    expect(
      ids(
        providersFor(
          { currency: "USD", rail: "virtual_account" },
          { currency: "KES", rail: "bank", country: "KE" },
        ),
      ),
    ).toEqual(["yellowcard"]);
    expect(
      ids(
        providersFor(
          { currency: "USD", rail: "stablecoin" },
          { currency: "KES", rail: "momo", country: "KE" },
        ),
      ),
    ).toEqual(expect.arrayContaining(["kotani", "minisend"]));
  });

  it("Africa to China and Japan: only Klasha pays CNY and JPY", () => {
    const kes = { currency: "KES", rail: "momo" as const, country: "KE" };
    expect(ids(providersFor(kes, { currency: "CNY", rail: "bank", country: "CN" }))).toEqual([
      "klasha",
    ]);
    expect(ids(providersFor(kes, { currency: "CNY", rail: "wallet", country: "CN" }))).toEqual([
      "klasha",
    ]);
    expect(ids(providersFor(kes, { currency: "JPY", rail: "bank", country: "JP" }))).toEqual([
      "klasha",
    ]);
  });

  it("Africa to Europe and the US: Klasha and Yellow Card compete", () => {
    const kes = { currency: "KES", rail: "momo" as const, country: "KE" };
    expect(ids(providersFor(kes, { currency: "EUR", rail: "bank", country: "BE" }))).toEqual([
      "yellowcard",
      "klasha",
    ]);
    expect(ids(providersFor(kes, { currency: "USD", rail: "bank", country: "US" }))).toEqual([
      "yellowcard",
      "klasha",
    ]);
  });

  it("nobody collects JPY or CNY from a payer", () => {
    for (const currency of ["JPY", "CNY"]) {
      for (const rail of ["bank", "card", "virtual_account", "wallet"] as const) {
        expect(
          providersFor({ currency, rail }, { currency: "KES", rail: "momo", country: "KE" }),
        ).toEqual([]);
      }
    }
  });

  it("marks a route assumed when either leg is undocumented", () => {
    const m = providersFor(
      { currency: "GHS", rail: "momo", country: "GH" },
      { currency: "KES", rail: "momo", country: "KE" },
    );
    expect(m.find((x) => x.provider === "kotani")?.basis).toBe("documented");
    expect(m.find((x) => x.provider === "yellowcard")?.basis).toBe("assumed");
  });

  it("lists the rails a payer can use and every payout destination", () => {
    expect(payerRails("EUR", undefined, { currency: "KES", rail: "momo", country: "KE" })).toEqual([
      "virtual_account",
    ]);
    const dest = payoutDestinations();
    for (const [currency, country] of [
      ["CNY", "CN"],
      ["JPY", "JP"],
      ["EUR", "BE"],
      ["USD", "US"],
      ["KES", "KE"],
    ]) {
      expect(dest.some((d) => d.currency === currency && d.country === country)).toBe(true);
    }
  });
});

describe("estimates and costs", () => {
  const ghToKe: RouteRequest = {
    from: { currency: "GHS", rail: "momo", country: "GH" },
    to: { currency: "KES", rail: "momo", country: "KE" },
    amount: 650000,
    side: "receive",
  };

  it("fixes the recipient's amount and charges the payer on top", () => {
    const q = estimateQuote("kotani", ghToKe, "documented");
    expect(q.receiveAmount).toBe(650000);
    expect(q.sendAmount).toBeGreaterThan(650000 / midRate("GHS", "KES"));
    expect(q.cost).toBeGreaterThan(0);
    expect(q.estimated).toBe(true);
  });

  it("fixes the payer's amount and shrinks what arrives", () => {
    const q = estimateQuote("yellowcard", { ...ghToKe, amount: 10000, side: "send" }, "assumed");
    expect(q.sendAmount).toBe(10000);
    expect(q.receiveAmount).toBeLessThan(10000 * midRate("GHS", "KES"));
  });

  it("adds cost to a live quote against the mid-market reference", () => {
    const q = withCost({
      provider: "minisend",
      sendCurrency: "USD",
      sendAmount: 100,
      receiveCurrency: "KES",
      receiveAmount: 12771,
      estimated: false,
      basis: "documented",
      expiresAt: null,
    });
    expect(q.cost).toBe(1);
    expect(q.costPct).toBeCloseTo(0.01);
  });
});

describe("rankQuotes: cheapest first, the rest as fallbacks", () => {
  const base = {
    sendCurrency: "KES",
    receiveCurrency: "KES",
    cost: 0,
    costPct: 0,
    estimated: false,
    expiresAt: null,
  } as const;
  const q = (
    provider: RouteQuote["provider"],
    sendAmount: number,
    receiveAmount: number,
    basis: RouteQuote["basis"] = "documented",
  ): RouteQuote => ({ ...base, provider, sendAmount, receiveAmount, basis });

  it("with the recipient's amount fixed, the smallest payer total wins", () => {
    const r = rankQuotes(
      [q("kotani", 1050, 1000), q("yellowcard", 1020, 1000), q("payaza", 1030, 1000)],
      "receive",
    );
    expect(ids(r)).toEqual(["yellowcard", "payaza", "kotani"]);
  });

  it("with the payer's amount fixed, the biggest delivery wins", () => {
    const r = rankQuotes([q("kotani", 1000, 950), q("minisend", 1000, 980)], "send");
    expect(ids(r)).toEqual(["minisend", "kotani"]);
  });

  it("breaks ties by documented first, then registry order", () => {
    expect(
      ids(rankQuotes([q("yellowcard", 1000, 1000, "assumed"), q("kotani", 1000, 1000)], "receive")),
    ).toEqual(["kotani", "yellowcard"]);
    expect(ids(rankQuotes([q("klasha", 1000, 1000), q("kotani", 1000, 1000)], "receive"))).toEqual([
      "kotani",
      "klasha",
    ]);
  });

  it("ranks real candidates for Ghana to Kenya with estimates", () => {
    const req: RouteRequest = {
      from: { currency: "GHS", rail: "momo", country: "GH" },
      to: { currency: "KES", rail: "momo", country: "KE" },
      amount: 650000,
      side: "receive",
    };
    const ranked = rankQuotes(
      candidates(req).map((c) => estimateQuote(c.provider, req, c.basis)),
      "receive",
    );
    expect(ranked.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < ranked.length; i++)
      expect(ranked[i]!.sendAmount).toBeGreaterThanOrEqual(ranked[i - 1]!.sendAmount);
  });
});

describe("executeWithFallback", () => {
  const quotes = (["yellowcard", "kotani", "minisend"] as const).map(
    (provider) =>
      ({
        provider,
        sendCurrency: "KES",
        sendAmount: 1,
        receiveCurrency: "KES",
        receiveAmount: 1,
        cost: 0,
        costPct: 0,
        estimated: true,
        basis: "documented",
        expiresAt: null,
      }) as RouteQuote,
  );

  it("uses the cheapest when it works", async () => {
    const r = await executeWithFallback(quotes, async (q) => q.provider);
    expect(r.result).toBe("yellowcard");
    expect(r.attempts).toEqual([{ provider: "yellowcard", ok: true }]);
  });

  it("falls back in order when a provider fails before taking money", async () => {
    const r = await executeWithFallback(quotes, async (q) => {
      if (q.provider === "yellowcard") throw new Error("channel unavailable");
      return q.provider;
    });
    expect(r.result).toBe("kotani");
    expect(r.attempts.map((a) => [a.provider, a.ok])).toEqual([
      ["yellowcard", false],
      ["kotani", true],
    ]);
  });

  it("stops when a provider may already have moved money", async () => {
    await expect(
      executeWithFallback(quotes, async (q) => {
        if (q.provider === "yellowcard") throw new NotRetryable("timed out after accepting");
        return q.provider;
      }),
    ).rejects.toMatchObject({ attempts: [{ provider: "yellowcard", ok: false }] });
  });

  it("reports every failure when all providers fail", async () => {
    await expect(
      executeWithFallback(quotes, async () => {
        throw new Error("down");
      }),
    ).rejects.toMatchObject({
      attempts: [{ ok: false }, { ok: false }, { ok: false }],
    });
  });
});

describe("payerOptions: other ways to pay a business", () => {
  const kes = { currency: "KES", rail: "momo" as const, country: "KE" };

  it("offers international bank transfer and USDC first, never the business's own currency", () => {
    const opts = payerOptions(kes);
    expect(opts.slice(0, 2).map((o) => o.currency)).toEqual(["USD", "USD"]);
    expect(opts.some((o) => o.currency === "EUR" && o.rail === "virtual_account")).toBe(true);
    expect(opts.some((o) => o.currency === "GHS" && o.rail === "momo")).toBe(true);
    expect(opts.some((o) => o.currency === "KES")).toBe(false);
  });

  it("has no JPY or CNY option: no provider collects them", () => {
    expect(payerOptions(kes).some((o) => o.currency === "JPY" || o.currency === "CNY")).toBe(false);
  });
});

describe("priceRoute: what the payer is asked for", () => {
  const q = (over: Partial<RouteQuote> = {}): RouteQuote => ({
    provider: "yellowcard",
    sendCurrency: "EUR",
    sendAmount: 1000,
    receiveCurrency: "KES",
    receiveAmount: 136000,
    cost: 18.6,
    costPct: 0.0186,
    estimated: true,
    basis: "documented",
    expiresAt: null,
    ...over,
  });

  it("adds Meridian's 1% on top of the provider's charge, and the parts add up", () => {
    const p = priceRoute(q(), false);
    expect(p).toEqual({ amount: 981.4, providerFee: 18.6, meridianFee: 10, total: 1010 });
    expect(p.amount + p.providerFee + p.meridianFee).toBeCloseTo(p.total, 2);
  });

  it("rounds whole-unit currencies up and puts the rounding in the provider fee", () => {
    const p = priceRoute(q({ sendCurrency: "KES", sendAmount: 1000.4, cost: 20 }), true);
    expect(p.total).toBe(1011);
    expect(p.amount + p.providerFee + p.meridianFee).toBeCloseTo(1011, 2);
  });
});

describe("funderOptions: how a business pays for a transfer", () => {
  it("a Kenyan business pays from KES mobile money or bank first, then USD/EUR accounts and USDC", () => {
    const opts = funderOptions("KE");
    expect(opts[0]).toMatchObject({ currency: "KES", country: "KE" });
    expect(opts.some((o) => o.currency === "EUR" && o.rail === "virtual_account")).toBe(true);
    expect(opts.some((o) => o.currency === "USD" && o.rail === "stablecoin")).toBe(true);
    expect(opts.some((o) => o.rail === "card")).toBe(false);
    expect(opts.some((o) => o.currency === "NGN")).toBe(false);
  });
});

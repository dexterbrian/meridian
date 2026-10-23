import { describe, expect, it } from "vitest";
import {
  ENABLED_PROVIDERS,
  PROVIDERS,
  PROVIDER_IDS,
  funderOptions,
  payerOptions,
  payerRails,
  payoutDestinations,
  providersFor,
  type Endpoint,
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

// What a provider is able to do does not change when we switch it off, so these
// tests ask the whole registry. The switch has its own tests at the end.
const covering = (from: Endpoint, to: Endpoint) => providersFor(from, to, PROVIDER_IDS);

describe("providersFor: which providers can carry a payment", () => {
  it("Africa to Africa in local currencies: Ghana MoMo cedis to a Kenyan M-Pesa", () => {
    const m = covering(
      { currency: "GHS", rail: "momo", country: "GH" },
      { currency: "KES", rail: "momo", country: "KE" },
    );
    expect(ids(m)).toEqual(expect.arrayContaining(["kotani", "yellowcard"]));
    // Payaza can't convert, so it never carries a cross-currency payment.
    expect(ids(m)).not.toContain("payaza");
  });

  it("same currency in Kenya: Kotani and Yellow Card can both carry it", () => {
    const m = covering(
      { currency: "KES", rail: "momo", country: "KE" },
      { currency: "KES", rail: "momo", country: "KE" },
    );
    expect(ids(m)).toEqual(expect.arrayContaining(["kotani", "yellowcard"]));
  });

  it("Europe to Africa: a EUR buyer pays by SEPA into a Yellow Card virtual account", () => {
    const m = covering(
      { currency: "EUR", rail: "virtual_account" },
      { currency: "KES", rail: "momo", country: "KE" },
    );
    expect(ids(m)).toEqual(["yellowcard"]);
  });

  it("Middle East or anywhere to Africa in USD: an international bank transfer", () => {
    expect(
      ids(
        covering(
          { currency: "USD", rail: "virtual_account" },
          { currency: "KES", rail: "bank", country: "KE" },
        ),
      ),
    ).toEqual(["yellowcard"]);
  });

  it("nobody is offered a crypto rail: ordinary money in, ordinary money out", () => {
    for (const p of PROVIDERS) {
      for (const c of [...p.collect, ...p.payout]) {
        expect(c.rails).not.toContain("stablecoin" as never);
      }
    }
  });

  it("Africa to China and Japan: only Klasha pays CNY and JPY", () => {
    const kes = { currency: "KES", rail: "momo" as const, country: "KE" };
    expect(ids(covering(kes, { currency: "CNY", rail: "bank", country: "CN" }))).toEqual([
      "klasha",
    ]);
    expect(ids(covering(kes, { currency: "CNY", rail: "wallet", country: "CN" }))).toEqual([
      "klasha",
    ]);
    expect(ids(covering(kes, { currency: "JPY", rail: "bank", country: "JP" }))).toEqual([
      "klasha",
    ]);
  });

  it("Africa to Europe and the US: Klasha and Yellow Card compete", () => {
    const kes = { currency: "KES", rail: "momo" as const, country: "KE" };
    expect(ids(covering(kes, { currency: "EUR", rail: "bank", country: "BE" }))).toEqual([
      "yellowcard",
      "klasha",
    ]);
    expect(ids(covering(kes, { currency: "USD", rail: "bank", country: "US" }))).toEqual([
      "yellowcard",
      "klasha",
    ]);
  });

  it("nobody collects JPY or CNY from a payer", () => {
    for (const currency of ["JPY", "CNY"]) {
      for (const rail of ["bank", "card", "virtual_account", "wallet"] as const) {
        expect(
          covering({ currency, rail }, { currency: "KES", rail: "momo", country: "KE" }),
        ).toEqual([]);
      }
    }
  });

  it("marks a route assumed when either leg is undocumented", () => {
    const m = covering(
      { currency: "GHS", rail: "momo", country: "GH" },
      { currency: "KES", rail: "momo", country: "KE" },
    );
    expect(m.find((x) => x.provider === "kotani")?.basis).toBe("documented");
    expect(m.find((x) => x.provider === "yellowcard")?.basis).toBe("assumed");
  });

  it("lists the rails a payer can use and every payout destination", () => {
    expect(
      payerRails("EUR", undefined, { currency: "KES", rail: "momo", country: "KE" }, PROVIDER_IDS),
    ).toEqual(["virtual_account"]);
    const dest = payoutDestinations(PROVIDER_IDS);
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
      provider: "klasha",
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
  it("drops a quote whose amounts are not real numbers, so it cannot win", () => {
    const junk: RouteQuote = {
      provider: "kotani",
      sendCurrency: "GHS",
      sendAmount: NaN,
      receiveCurrency: "KES",
      receiveAmount: NaN,
      cost: NaN,
      costPct: NaN,
      estimated: false,
      basis: "documented",
      expiresAt: null,
    };
    const good: RouteQuote = {
      ...junk,
      provider: "klasha",
      sendAmount: 15588.14,
      receiveAmount: 129000,
      cost: 100,
      costPct: 0.006,
    };
    const ranked = rankQuotes([junk, good], "receive");
    expect(ranked.map((q) => q.provider)).toEqual(["klasha"]);
  });

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
      [q("kotani", 1050, 1000), q("yellowcard", 1020, 1000), q("klasha", 1030, 1000)],
      "receive",
    );
    expect(ids(r)).toEqual(["yellowcard", "klasha", "kotani"]);
  });

  it("with the payer's amount fixed, the biggest delivery wins", () => {
    const r = rankQuotes([q("kotani", 1000, 950), q("klasha", 1000, 980)], "send");
    expect(ids(r)).toEqual(["klasha", "kotani"]);
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
      candidates(req, PROVIDER_IDS).map((c) => estimateQuote(c.provider, req, c.basis)),
      "receive",
    );
    expect(ranked.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < ranked.length; i++)
      expect(ranked[i]!.sendAmount).toBeGreaterThanOrEqual(ranked[i - 1]!.sendAmount);
  });
});

describe("executeWithFallback", () => {
  const quotes = (["yellowcard", "kotani", "klasha"] as const).map(
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

  it("offers international bank transfer first, and the business's own currency too", () => {
    const opts = payerOptions(kes, PROVIDER_IDS);
    expect(opts[0]).toMatchObject({ currency: "USD", rail: "virtual_account" });
    expect(opts.some((o) => o.currency === "EUR" && o.rail === "virtual_account")).toBe(true);
    expect(opts.some((o) => o.currency === "GHS" && o.rail === "momo")).toBe(true);
    // A payer in Kenya pays shillings through a provider like everyone else.
    expect(opts.some((o) => o.currency === "KES" && o.rail === "momo")).toBe(true);
  });

  it("has no JPY or CNY option: no provider collects them", () => {
    expect(
      payerOptions(kes, PROVIDER_IDS).some((o) => o.currency === "JPY" || o.currency === "CNY"),
    ).toBe(false);
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
  it("a Kenyan business pays from KES mobile money or bank first, then USD/EUR accounts", () => {
    const opts = funderOptions("KE", PROVIDER_IDS);
    expect(opts[0]).toMatchObject({ currency: "KES", country: "KE" });
    expect(opts.some((o) => o.currency === "EUR" && o.rail === "virtual_account")).toBe(true);
    expect(opts.some((o) => o.rail === ("stablecoin" as never))).toBe(false);
    expect(opts.some((o) => o.rail === "card")).toBe(false);
    expect(opts.some((o) => o.currency === "NGN")).toBe(false);
  });
});

describe("the switch: only the providers that are on carry money", () => {
  const kes = { currency: "KES", rail: "momo" as const, country: "KE" };

  it("is Kotani Pay today, and nobody else", () => {
    expect([...ENABLED_PROVIDERS]).toEqual(["kotani"]);
  });

  it("a route a switched-off provider would carry has no candidates", () => {
    // Yellow Card is the only one that takes euros from abroad, and it is off.
    expect(providersFor({ currency: "EUR", rail: "virtual_account" }, kes)).toEqual([]);
    // Klasha is the only one that pays China and Japan, and it is off.
    expect(providersFor(kes, { currency: "CNY", rail: "bank", country: "CN" })).toEqual([]);
    expect(providersFor(kes, { currency: "JPY", rail: "bank", country: "JP" })).toEqual([]);
  });

  it("keeps the routes Kotani can carry on its own", () => {
    expect(ids(providersFor({ currency: "GHS", rail: "momo", country: "GH" }, kes))).toEqual([
      "kotani",
    ]);
    expect(ids(providersFor({ currency: "KES", rail: "momo", country: "KE" }, kes))).toEqual([
      "kotani",
    ]);
  });

  it("never offers a payer a way to pay that nobody switched on can take", () => {
    for (const o of payerOptions(kes)) {
      expect(providersFor(o, kes).length).toBeGreaterThan(0);
    }
    expect(payerOptions(kes).some((o) => o.currency === "EUR")).toBe(false);
  });

  it("only offers destinations a switched-on provider pays", () => {
    const dest = payoutDestinations();
    expect(dest.some((d) => d.country === "CN" || d.country === "JP")).toBe(false);
    expect(dest.some((d) => d.currency === "KES" && d.country === "KE")).toBe(true);
  });

  it("turning a provider back on is one list, with nothing else to change", () => {
    const withYellowCard = providersFor({ currency: "EUR", rail: "virtual_account" }, kes, [
      ...ENABLED_PROVIDERS,
      "yellowcard",
    ]);
    expect(ids(withYellowCard)).toEqual(["yellowcard"]);
  });
});

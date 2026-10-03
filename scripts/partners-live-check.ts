/* eslint-disable no-restricted-properties */
// Checks each routed provider's sandbox with real keys. Quotes only: nothing is
// paid out and no money moves.
//   npm run partners:check
// Put the keys in .env.local (see .env.example). A provider without keys is
// reported as skipped. Every call is logged to partner_calls, as in the app.

import { readFileSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const i = line.indexOf("=");
      if (i < 1 || line.startsWith("#")) continue;
      const k = line.slice(0, i).trim();
      if (!process.env[k])
        process.env[k] = line
          .slice(i + 1)
          .trim()
          .replace(/^"|"$/g, "");
    }
  } catch {
    /* optional */
  }
}
process.env["MERIDIAN_MODE"] = "sandbox";

const { ADAPTERS } = await import("../src/server/partners/adapters");
const { planRoute } = await import("../src/server/money/router");
import type { ProviderId } from "../src/lib/providers";
import type { RouteRequest } from "../src/lib/routing";

// One corridor per provider that its live quote supports, from the interviews.
const CHECKS: { provider: ProviderId; why: string; req: RouteRequest }[] = [
  {
    provider: "kotani",
    why: "Ann: Ghanaian buyer pays GHS, Ann gets KES",
    req: {
      from: { currency: "GHS", rail: "momo", country: "GH" },
      to: { currency: "KES", rail: "momo", country: "KE" },
      amount: 129000,
      side: "receive",
    },
  },
  {
    provider: "yellowcard",
    why: "Ann: Nigerian buyer pays NGN, Ann gets KES",
    req: {
      from: { currency: "NGN", rail: "bank", country: "NG" },
      to: { currency: "KES", rail: "momo", country: "KE" },
      amount: 129000,
      side: "receive",
    },
  },
  {
    provider: "minisend",
    why: "Chris: buyer abroad pays USDC, Chris gets KES",
    req: {
      from: { currency: "USD", rail: "stablecoin" },
      to: { currency: "KES", rail: "momo", country: "KE" },
      amount: 129000,
      side: "receive",
    },
  },
];

let failed = 0;
for (const c of CHECKS) {
  const a = ADAPTERS[c.provider];
  if (!a.configured()) {
    console.log(`skip ${c.provider}: no keys in .env.local`);
    continue;
  }
  try {
    const q = await a.quote(c.req, "documented");
    if (!q || q.estimated)
      throw new Error(q ? "returned an estimate, not a live quote" : "no quote");
    console.log(
      `ok   ${c.provider} (${c.why}): pay ${q.sendAmount} ${q.sendCurrency} → ${q.receiveAmount} ${q.receiveCurrency}`,
    );
  } catch (e) {
    failed++;
    console.log(`FAIL ${c.provider} (${c.why}): ${e instanceof Error ? e.message : String(e)}`);
  }
}

// Klasha quotes need a beneficiary (a recipient), so there is no quote-only check.
if (ADAPTERS.klasha.configured()) {
  console.log(
    "klasha: live quote is taken at payout time (needs a beneficiary); run a sandbox transfer to check it",
  );
} else {
  console.log("skip klasha: no keys in .env.local");
}

// The comparison the app makes, with whatever is live.
const plan = await planRoute(CHECKS[0]!.req);
console.log(
  "\nGHS → KES ranking:",
  plan.quotes
    .map((q) => `${q.provider}${q.estimated ? " (estimate)" : ""} ${q.sendAmount}`)
    .join(" < "),
);

process.exit(failed ? 1 : 0);

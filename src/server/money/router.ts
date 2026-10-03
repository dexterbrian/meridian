import "server-only";
import type { ProviderId } from "~/lib/providers";
import {
  candidates,
  rankQuotes,
  type RoutePlan,
  type RouteQuote,
  type RouteRequest,
} from "~/lib/routing";
import { ADAPTERS } from "../partners/adapters";

// Asks every provider that can carry a payment for a quote, at the same time,
// and ranks the answers cheapest first. A provider that is slow, errors or
// declines is listed as unavailable rather than holding the others up.

const QUOTE_TIMEOUT_MS = 8_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no quote within ${ms / 1000}s`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export async function planRoute(req: RouteRequest): Promise<RoutePlan> {
  const matches = candidates(req);
  const settled = await Promise.allSettled(
    matches.map((m) => withTimeout(ADAPTERS[m.provider].quote(req, m.basis), QUOTE_TIMEOUT_MS)),
  );
  const quotes: RouteQuote[] = [];
  const unavailable: { provider: ProviderId; reason: string }[] = [];
  settled.forEach((s, i) => {
    const provider = matches[i]!.provider;
    if (s.status === "rejected") {
      unavailable.push({
        provider,
        reason: s.reason instanceof Error ? s.reason.message : String(s.reason),
      });
    } else if (!s.value) {
      unavailable.push({ provider, reason: "gave no quote for this route" });
    } else {
      quotes.push(s.value);
    }
  });
  return { request: req, quotes: rankQuotes(quotes, req.side), unavailable };
}

import "server-only";
import { getRequestEvent } from "solid-js/web";
import { createRateLimiter } from "~/lib/rate-limit";

function event() {
  const e = getRequestEvent();
  if (!e) throw new Error("No request in scope");
  return e;
}

/** Best guess at the caller's IP. Cloudflare sets cf-connecting-ip; proxies set x-forwarded-for. */
export function clientIp(): string {
  const e = event();
  const h = e.request.headers;
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    e.clientAddress ??
    "unknown"
  );
}

/** Origin the visitor used, e.g. https://staging.meridian.appify.co.ke. */
export function requestOrigin(): string {
  return new URL(event().request.url).origin;
}

// TRD section 9: public inserts are limited to 10 per 10 minutes per IP.
const TEN_MINUTES = 10 * 60 * 1000;
const limiters = {
  waitlist: createRateLimiter(10, TEN_MINUTES),
  contact: createRateLimiter(10, TEN_MINUTES),
  demo: createRateLimiter(10, TEN_MINUTES),
  signIn: createRateLimiter(10, TEN_MINUTES),
};

export function allowRequest(bucket: keyof typeof limiters): boolean {
  return limiters[bucket].take(clientIp());
}

export const RATE_LIMITED = "Too many attempts. Please wait a few minutes and try again.";

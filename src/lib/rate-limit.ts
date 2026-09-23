// Fixed-window counter per key. In memory, so each server instance (or Worker
// isolate) keeps its own count. Enough for the MVP per TRD section 9.

export type RateLimiter = {
  /** Returns true if the call is allowed and counts it. */
  take(key: string, now?: number): boolean;
};

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    take(key, now = Date.now()) {
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      }
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      if (entry.count >= limit) return false;
      entry.count++;
      return true;
    },
  };
}

import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit, then blocks", () => {
    const rl = createRateLimiter(10, 600_000);
    for (let i = 0; i < 10; i++) expect(rl.take("1.2.3.4", 0)).toBe(true);
    expect(rl.take("1.2.3.4", 0)).toBe(false);
  });

  it("counts each key on its own", () => {
    const rl = createRateLimiter(1, 1000);
    expect(rl.take("a", 0)).toBe(true);
    expect(rl.take("b", 0)).toBe(true);
    expect(rl.take("a", 0)).toBe(false);
  });

  it("opens again when the window ends", () => {
    const rl = createRateLimiter(1, 1000);
    expect(rl.take("a", 0)).toBe(true);
    expect(rl.take("a", 999)).toBe(false);
    expect(rl.take("a", 1000)).toBe(true);
  });
});

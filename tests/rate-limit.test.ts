import { describe, expect, it, vi } from "vitest";
import { consumeRequestRateLimit, getRequestRateLimitKey } from "../lib/rate-limit";

describe("consumeRequestRateLimit", () => {
  it("allows 30 requests during a minute and blocks the 31st", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    const identifier = `test-${Date.now()}-${Math.random()}`;

    for (let requestNumber = 1; requestNumber <= 30; requestNumber += 1) {
      expect((await consumeRequestRateLimit(identifier, { limit: 30, windowMs: 60_000 })).allowed).toBe(true);
    }
    const blocked = await consumeRequestRateLimit(identifier, { limit: 30, windowMs: 60_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);

    vi.unstubAllEnvs();
  });

  it("derives the same privacy-preserving key for the same forwarded client IP", () => {
    const first = new Request("https://example.test", { headers: { "x-forwarded-for": "203.0.113.8, 10.0.0.1" } });
    const second = new Request("https://example.test", { headers: { "x-real-ip": "203.0.113.8" } });

    expect(getRequestRateLimitKey(first, "preview")).toBe(getRequestRateLimitKey(second, "preview"));
    expect(getRequestRateLimitKey(first, "preview")).not.toContain("203.0.113.8");
  });
});

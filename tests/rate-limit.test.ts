import { describe, expect, it, vi } from "vitest";
import { consumeRequestRateLimit } from "../lib/rate-limit";

describe("consumeRequestRateLimit", () => {
  it("allows requests up to the limit and then returns a retry window", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    const identifier = `test-${Date.now()}-${Math.random()}`;

    expect((await consumeRequestRateLimit(identifier, { limit: 2, lockoutMs: 5_000 })).allowed).toBe(true);
    expect((await consumeRequestRateLimit(identifier, { limit: 2, lockoutMs: 5_000 })).allowed).toBe(true);
    const blocked = await consumeRequestRateLimit(identifier, { limit: 2, lockoutMs: 5_000 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(5);

    vi.unstubAllEnvs();
  });
});

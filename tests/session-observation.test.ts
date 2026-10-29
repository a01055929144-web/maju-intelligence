import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { observeStaffSession } from "../application/organization/observe-staff-session";
import { buildStaffSessionObservation, shouldRefreshSessionObservation } from "../domains/organization/session-observation";

describe("staff session observation draft", () => {
  it("stays inert while the feature flag is disabled", async () => {
    const repository = { upsert: vi.fn() };
    expect(buildStaffSessionObservation({ companyId: "company-1", deviceHash: "a".repeat(64), enabled: false, observedAt: new Date(), userId: "user-1" })).toBeNull();
    await expect(observeStaffSession({ companyId: "company-1", deviceHash: "a".repeat(64), enabled: false, observedAt: new Date(), userId: "user-1" }, repository)).resolves.toBe("skipped");
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it("records only a complete server-hashed device observation", async () => {
    const repository = { upsert: vi.fn().mockResolvedValue(undefined) };
    const observedAt = new Date("2026-10-29T00:00:00.000Z");
    await expect(observeStaffSession({ companyId: "company-1", deviceHash: "b".repeat(64), enabled: true, observedAt, userId: "user-1" }, repository)).resolves.toBe("recorded");
    expect(repository.upsert).toHaveBeenCalledWith({ companyId: "company-1", deviceHash: "b".repeat(64), observedAt: observedAt.toISOString(), userId: "user-1" });
  });

  it("throttles best-effort heartbeats to five minutes", () => {
    expect(shouldRefreshSessionObservation({ now: 300_000 })).toBe(true);
    expect(shouldRefreshSessionObservation({ lastObservedAt: 1, now: 299_999 })).toBe(false);
    expect(shouldRefreshSessionObservation({ lastObservedAt: 1, now: 300_001 })).toBe(true);
  });

  it("keeps the default flag off and does not create alerts", () => {
    const env = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
    const store = readFileSync(resolve(process.cwd(), "lib/store/07-session-observation.ts"), "utf8");
    expect(env).toContain("STAFF_SESSION_OBSERVATION_ENABLED=false");
    expect(store).toContain("staff_account_sessions");
    expect(store).not.toContain("staff_security_alerts");
  });
});

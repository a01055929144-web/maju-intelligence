import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ values: new Map<string, string>(), options: new Map<string, unknown>() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    delete: (name: string) => state.values.delete(name),
    get: (name: string) => state.values.has(name) ? { value: state.values.get(name) } : undefined,
    set: (name: string, value: string, options: unknown) => { state.values.set(name, value); state.options.set(name, options); }
  }))
}));

import { clearStoreSession, getStoreSession, setStoreSession } from "../lib/auth";

const authUserId = "00000000-0000-4000-8000-000000000003";

beforeEach(() => {
  state.values.clear(); state.options.clear();
  vi.stubEnv("ADMIN_SESSION_SECRET", "synthetic-store-session-secret");
  vi.stubEnv("STORE_MEMBER_SESSION_ENABLED", "false");
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-07T00:00:00Z"));
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("store member session cookie", () => {
  it("stays inert while the server feature is off", async () => {
    await expect(setStoreSession(authUserId)).resolves.toBe(false);
    await expect(getStoreSession()).resolves.toBeNull();
    expect(state.values).toHaveLength(0);
  });

  it("stores only the internal auth user and bounded timestamps in an HttpOnly cookie", async () => {
    vi.stubEnv("STORE_MEMBER_SESSION_ENABLED", "true");
    await expect(setStoreSession(authUserId)).resolves.toBe(true);
    const encoded = state.values.get("maju_store_session")!;
    const payload = JSON.parse(Buffer.from(encoded.split(".")[0], "base64url").toString("utf8"));
    expect(payload).toEqual({ authUserId, issuedAt: 1794009600, expiresAt: 1794038400 });
    expect(payload).not.toHaveProperty("companyId");
    expect(payload).not.toHaveProperty("storeAccountId");
    expect(payload).not.toHaveProperty("role");
    expect(state.options.get("maju_store_session")).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 28800 });
    await expect(getStoreSession()).resolves.toEqual(payload);
  });

  it("rejects tampering and expiry and clears through the existing logout path", async () => {
    vi.stubEnv("STORE_MEMBER_SESSION_ENABLED", "true");
    await setStoreSession(authUserId);
    state.values.set("maju_store_session", state.values.get("maju_store_session") + "x");
    await expect(getStoreSession()).resolves.toBeNull();
    await setStoreSession(authUserId);
    vi.advanceTimersByTime(8 * 60 * 60 * 1000 + 1000);
    await expect(getStoreSession()).resolves.toBeNull();
    await clearStoreSession();
    expect(state.values.has("maju_store_session")).toBe(false);
  });
});

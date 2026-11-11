import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), connect: vi.fn(), list: vi.fn(), enabled: vi.fn(() => true),
  check: vi.fn(), fail: vi.fn(), clear: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getStoreSession: mocks.session }));
vi.mock("@/lib/rate-limit", () => ({ checkLoginThrottle: mocks.check, recordLoginFailure: mocks.fail, clearLoginThrottle: mocks.clear }));
vi.mock("@/lib/store/11-store-direct-signup", () => ({ storeDirectSignupEnabled: mocks.enabled, connectStoreProfile: mocks.connect, listStoreProfiles: mocks.list }));
import { POST } from "../app/api/store/connect/route";

const user = "11111111-1111-4111-8111-111111111111";
const profile = "22222222-2222-4222-8222-222222222222";
const post = (payload: unknown = { code: "ABCD-2345" }, origin: string | null = "http://localhost") => POST(new NextRequest("http://localhost/api/store/connect", {
  method: "POST", headers: origin ? { origin, "content-type": "application/json" } : { "content-type": "application/json" }, body: JSON.stringify(payload),
}));

describe("store invite code connect API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STORE_LINK_SECRET", "s".repeat(40));
    mocks.enabled.mockReturnValue(true);
    mocks.session.mockResolvedValue({ authUserId: user });
    mocks.check.mockResolvedValue({ allowed: true });
    mocks.list.mockResolvedValue([{ id: profile, role: "owner", storeName: "합성" }]);
    mocks.connect.mockResolvedValue({ ok: true, companyId: "c", storeAccountId: "a", alreadyLinked: false });
  });

  it("does not exist while the global switch is off", async () => {
    mocks.enabled.mockReturnValue(false);
    expect((await post()).status).toBe(404);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("requires a store session and the same origin", async () => {
    expect((await post({ code: "ABCD2345" }, "https://evil.example")).status).toBe(403);
    expect((await post({ code: "ABCD2345" }, null)).status).toBe(403);
    mocks.session.mockResolvedValue(null);
    expect((await post()).status).toBe(401);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("stops at the throttle before touching the database", async () => {
    mocks.check.mockResolvedValue({ allowed: false, retryAfterSeconds: 321 });
    const response = await post();
    expect(response.status).toBe(429);
    expect((await response.json()).message).toContain("321");
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.check).toHaveBeenCalledWith(`store-invite:${user}`);
  });

  it("answers a badly formatted code and a wrong code identically, and counts both as failures", async () => {
    const bad = await post({ code: "12" });
    mocks.connect.mockResolvedValue({ ok: false, reason: "invalid_code" });
    const wrong = await post({ code: "ABCD2345" });
    expect(bad.status).toBe(400);
    expect(wrong.status).toBe(400);
    expect(await bad.json()).toEqual(await wrong.json());
    expect(mocks.fail).toHaveBeenCalledTimes(2);
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it("connects the caller's own owner profile (never one from the body) with an HMAC, not the raw code", async () => {
    const response = await post({ code: "abcd-2345", storeProfileId: "33333333-3333-4333-8333-333333333333", authUserId: "x" });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ linked: true, alreadyLinked: false });
    const [authUserId, profileId, hash] = mocks.connect.mock.calls[0];
    expect(authUserId).toBe(user);
    expect(profileId).toBe(profile);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("ABCD2345");
    expect(mocks.clear).toHaveBeenCalledWith(`store-invite:${user}`);
  });

  it("does not reveal the distributor in the response and treats a repeat as ok", async () => {
    mocks.connect.mockResolvedValue({ ok: true, companyId: "secret-company", storeAccountId: "secret-account", alreadyLinked: true });
    const response = await post();
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });

  it("needs an owner profile, rejects non-owners, and hides server errors", async () => {
    mocks.list.mockResolvedValue([]);
    expect((await post()).status).toBe(409);
    mocks.list.mockResolvedValue([{ id: profile, role: "owner", storeName: "합성" }]);
    mocks.connect.mockResolvedValue({ ok: false, reason: "not_owner" });
    expect((await post()).status).toBe(403);
    mocks.connect.mockRejectedValue(new Error("secret db detail"));
    const response = await post();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
});

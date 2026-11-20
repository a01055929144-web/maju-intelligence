import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  db: vi.fn(),
  enabled: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getRequestAuthScope: mocks.auth }));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.db }));
vi.mock("@/lib/store/07-store-access-password-feature", () => ({
  isStoreAccessPasswordReadEnabled: mocks.enabled,
}));

import { POST } from "@/app/api/mobile/store-access-password/route";

const companyId = "10000000-0000-4000-8000-000000000001";
const profileId = "20000000-0000-4000-8000-000000000002";
const stopId = "30000000-0000-4000-8000-000000000003";
const userId = "40000000-0000-4000-8000-000000000004";

const request = (body: Record<string, unknown>, origin = "http://localhost") => new Request(
  "http://localhost/api/mobile/store-access-password",
  { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) },
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, companyId, customerSession: { userId } });
  mocks.enabled.mockReturnValue(true);
  mocks.db.mockResolvedValue("7391");
});

describe("store access password route", () => {
  it("fails closed before the RPC when the feature is off", async () => {
    mocks.enabled.mockReturnValue(false);
    const response = await POST(request({ storeProfileId: profileId }) as never);
    expect(response.status).toBe(404);
    expect(mocks.db).not.toHaveBeenCalled();
  });

  it("uses only the signed company and user while forwarding the exact stop", async () => {
    const response = await POST(request({ companyId: "forged", userId: "forged", storeProfileId: profileId, routeStopId: stopId }) as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accessPassword: "7391" });
    expect(JSON.parse(mocks.db.mock.calls[0][1].body)).toEqual({
      p_actor_user: userId,
      p_company: companyId,
      p_route_stop: stopId,
      p_store_profile: profileId,
    });
  });

  it("does not expose the secret when the RPC denies access", async () => {
    mocks.db.mockRejectedValue(new Error("store_access_password_read_forbidden"));
    const response = await POST(request({ storeProfileId: profileId }) as never);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: "출입 정보를 확인할 권한이 없습니다." });
  });

  it("rejects cross-origin and invalid identifiers before the RPC", async () => {
    expect((await POST(request({ storeProfileId: profileId }, "https://evil.test") as never)).status).toBe(403);
    expect((await POST(request({ storeProfileId: "bad" }) as never)).status).toBe(400);
    expect(mocks.db).not.toHaveBeenCalled();
  });
});

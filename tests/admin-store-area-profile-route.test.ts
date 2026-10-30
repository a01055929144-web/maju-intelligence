import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getAdminSession = vi.fn();
const getAdminStoreAreaProfile = vi.fn();

vi.mock("@/lib/auth", () => ({ getAdminSession }));
vi.mock("@/lib/lead-store-area-profile", () => ({ getAdminStoreAreaProfile }));

describe("admin store-area profile route", () => {
  beforeEach(() => {
    vi.resetModules();
    getAdminSession.mockReset();
    getAdminStoreAreaProfile.mockReset();
    delete process.env.ADMIN_LEAD_STORE_AREA_PROFILE_ENABLED;
    delete process.env.ADMIN_LEAD_STORE_AREA_RPC_ENABLED;
  });

  afterEach(() => {
    delete process.env.ADMIN_LEAD_STORE_AREA_PROFILE_ENABLED;
    delete process.env.ADMIN_LEAD_STORE_AREA_RPC_ENABLED;
  });

  it("blocks unauthenticated access before reading aggregates", async () => {
    getAdminSession.mockResolvedValue(false);
    const { GET } = await import("../app/api/admin/leads/store-area-profile/route");

    expect((await GET(new Request("http://localhost/api/admin/leads/store-area-profile"))).status).toBe(401);
    expect(getAdminStoreAreaProfile).not.toHaveBeenCalled();
  });

  it("does not read the database while the feature flag is off", async () => {
    getAdminSession.mockResolvedValue(true);
    const { GET } = await import("../app/api/admin/leads/store-area-profile/route");

    expect((await GET(new Request("http://localhost/api/admin/leads/store-area-profile"))).status).toBe(404);
    expect(getAdminStoreAreaProfile).not.toHaveBeenCalled();
  });

  it("keeps the RPC disabled until the SQL approval flag is enabled", async () => {
    process.env.ADMIN_LEAD_STORE_AREA_PROFILE_ENABLED = "true";
    getAdminSession.mockResolvedValue(true);
    const { GET } = await import("../app/api/admin/leads/store-area-profile/route");

    const response = await GET(new Request(
      "http://localhost/api/admin/leads/store-area-profile?companyId=00000000-0000-4000-8000-000000000001"
    ));
    expect(response.status).toBe(404);
    expect(getAdminStoreAreaProfile).not.toHaveBeenCalled();
  });

  it("returns only the prepared aggregate when explicitly enabled", async () => {
    process.env.ADMIN_LEAD_STORE_AREA_PROFILE_ENABLED = "true";
    process.env.ADMIN_LEAD_STORE_AREA_RPC_ENABLED = "true";
    getAdminSession.mockResolvedValue(true);
    getAdminStoreAreaProfile.mockResolvedValue({ measuredAt: "2026-10-29T00:00:00.000Z", profile: {}, sourceComparison: {} });
    const { GET } = await import("../app/api/admin/leads/store-area-profile/route");
    const companyId = "00000000-0000-4000-8000-000000000001";
    const response = await GET(new Request(`http://localhost/api/admin/leads/store-area-profile?companyId=${companyId}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ measuredAt: "2026-10-29T00:00:00.000Z", profile: {}, sourceComparison: {} });
    expect(getAdminStoreAreaProfile).toHaveBeenCalledTimes(1);
    expect(getAdminStoreAreaProfile).toHaveBeenCalledWith(companyId);
  });

  it("rejects a missing company scope before calling the RPC", async () => {
    process.env.ADMIN_LEAD_STORE_AREA_PROFILE_ENABLED = "true";
    process.env.ADMIN_LEAD_STORE_AREA_RPC_ENABLED = "true";
    getAdminSession.mockResolvedValue(true);
    const { GET } = await import("../app/api/admin/leads/store-area-profile/route");

    expect((await GET(new Request("http://localhost/api/admin/leads/store-area-profile"))).status).toBe(400);
    expect(getAdminStoreAreaProfile).not.toHaveBeenCalled();
  });
});

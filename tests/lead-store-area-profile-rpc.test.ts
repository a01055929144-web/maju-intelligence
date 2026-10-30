import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseRequest = vi.fn();
vi.mock("../lib/store", () => ({ supabaseRequest }));

describe("admin store-area profile RPC", () => {
  beforeEach(() => supabaseRequest.mockReset());

  it("sends only the required company scope to the server aggregate", async () => {
    const response = { measuredAt: "2026-10-30T00:00:00.000Z", profile: {}, sourceComparison: {} };
    supabaseRequest.mockResolvedValue(response);
    const { getAdminStoreAreaProfile } = await import("../lib/lead-store-area-profile");

    await expect(getAdminStoreAreaProfile("00000000-0000-4000-8000-000000000001")).resolves.toEqual(response);
    expect(supabaseRequest).toHaveBeenCalledWith("rpc/admin_store_area_profile", {
      method: "POST",
      body: JSON.stringify({ p_company_id: "00000000-0000-4000-8000-000000000001" })
    });
  });
});

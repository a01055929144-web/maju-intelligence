import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { changeStoreConnection } from "../application/organization/change-store-connection";
const mocks = vi.hoisted(() => ({ context: vi.fn(), enabled: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/store/07-store-member-context", () => ({ getStoreMemberContext: mocks.context }));
vi.mock("@/lib/store/07-store-connection", () => ({ saveStoreConnection: mocks.save, storeConnectionEnabled: mocks.enabled }));
import { GET, POST } from "../app/api/store/connection/route";
const companyId = "00000000-0000-4000-8000-000000000001";
const storeAccountId = "20000000-0000-4000-8000-000000000001";
const actor = { companyId, storeAccountId, memberId: "verified-member", authUserId: "verified-user", role: "owner" as const };
const request = (body: unknown, origin = "https://test") => new NextRequest("https://test/api/store/connection", {
  method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body)
});
describe("store connection boundaries", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.enabled.mockReturnValue(true); mocks.context.mockResolvedValue(actor); });
  it("does not read membership or write when OFF", async () => {
    mocks.enabled.mockReturnValue(false);
    expect((await POST(request({ companyId, storeAccountId, action: "close" }))).status).toBe(404);
    expect(mocks.context).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("rejects another origin and malformed input before database access", async () => {
    expect((await POST(request({ companyId, storeAccountId, action: "close" }, "https://other"))).status).toBe(403);
    expect((await POST(request({ companyId, storeAccountId, action: "delete_everything" }))).status).toBe(400);
    expect((await POST(request(null))).status).toBe(400);
    expect(mocks.context).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("uses only the verified member identity", async () => {
    expect((await POST(request({ companyId, storeAccountId, action: "close", memberId: "forged", authUserId: "forged" }))).status).toBe(200);
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ ...actor, action: "close" });
  });
  it.each([
    ["owner", "leave", 403], ["manager", "close", 403], ["staff", "close", 403],
    ["staff", "leave", 200], ["manager", "leave", 200]
  ] as const)("enforces %s %s", async (role, action, status) => {
    mocks.context.mockResolvedValue({ ...actor, role });
    expect((await POST(request({ companyId, storeAccountId, action }))).status).toBe(status);
    expect(mocks.save).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
  });
  it("blocks a revoked session and reports database failure without raw errors", async () => {
    mocks.context.mockResolvedValue(null);
    expect((await POST(request({ companyId, storeAccountId, action: "close" }))).status).toBe(403);
    mocks.context.mockResolvedValue(actor); mocks.save.mockRejectedValueOnce(new Error("private database detail"));
    const response = await POST(request({ companyId, storeAccountId, action: "close" }));
    expect(response.status).toBe(409); expect(await response.text()).not.toContain("private database detail");
  });
  it("returns no-store capabilities for the current role", async () => {
    const response = await GET(new NextRequest(`https://test/api/store/connection?companyId=${companyId}&storeAccountId=${storeAccountId}`));
    expect(await response.json()).toEqual({ canLeave: false, canClose: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("retains authorization at the application boundary", async () => {
    await expect(changeStoreConnection({ ...actor, action: "leave" }, mocks.save)).rejects.toThrow("forbidden");
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

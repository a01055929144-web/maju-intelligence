import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ context: vi.fn(), enabled: vi.fn(), get: vi.fn(), getProfile: vi.fn(), update: vi.fn(), updateProfile: vi.fn() }));
vi.mock("@/lib/store/07-store-member-context", () => ({ getStoreMemberContext: mocks.context }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.enabled }));
vi.mock("@/lib/store/07-store-information", () => ({ getStoreInformation: mocks.get, getStoreProfileInformation: mocks.getProfile,
  updateStoreInformation: mocks.update, updateStoreProfileInformation: mocks.updateProfile }));
import { GET, PATCH } from "../app/api/store/information/route";

const companyId = "00000000-0000-4000-8000-000000000001";
const storeAccountId = "20000000-0000-4000-8000-000000000001";
const url = `https://test/api/store/information?companyId=${companyId}&storeAccountId=${storeAccountId}`;
const request = (body: unknown, origin = "https://test") => new NextRequest(url, { method: "PATCH", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("store information route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(false);
    mocks.context.mockResolvedValue({ authUserId: "40000000-0000-4000-8000-000000000001", companyId, storeAccountId, role: "owner" });
    mocks.get.mockResolvedValue({ businessRegistrationNumber: "1234567890", phone: "0212345678", representativeName: "홍대표", storeName: "홍매장" });
  });

  it("returns only the verified store information", async () => {
    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ canEdit: true, storeName: "홍매장" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("allows only an owner to update the scoped customer fields", async () => {
    mocks.context.mockResolvedValueOnce({ companyId, storeAccountId, role: "manager" });
    expect((await PATCH(request({ storeName: "수정", representativeName: "대표", phone: "010-1234-5678" }))).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
    expect((await PATCH(request({ storeName: " 수정 매장 ", representativeName: " 대표 ", phone: "010-1234-5678" }))).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(companyId, storeAccountId, { storeName: "수정 매장", representativeName: "대표", phone: "01012345678" });
  });

  it("rejects another origin and invalid fields before membership access", async () => {
    expect((await PATCH(request({ storeName: "수정", representativeName: "", phone: "" }, "https://other"))).status).toBe(403);
    expect((await PATCH(request({ storeName: "", representativeName: "", phone: "123" }))).status).toBe(400);
    expect(mocks.context).not.toHaveBeenCalled();
  });

  it("uses the owner-only profile RPC when the company rollout is enabled", async () => {
    mocks.enabled.mockReturnValue(true);
    mocks.getProfile.mockResolvedValue({ storeProfileId: "50000000-0000-4000-8000-000000000001", businessRegistrationNumber: "1234567890",
      storeName: "홍매장", representativeName: "홍대표", phone: "", baseAddress: "서울", addressDetail: "1층", accessNote: "호출",
      deliveryContactPhone: "01012345678", preferredDeliveryTime: "오전" });
    const response = await PATCH(request({ storeName: "홍매장", representativeName: "홍대표", phone: "", baseAddress: "서울",
      addressDetail: "1층", accessNote: "호출", deliveryContactPhone: "01012345678", preferredDeliveryTime: "오전" }));
    expect(response.status).toBe(200);
    expect(mocks.updateProfile).toHaveBeenCalledWith("50000000-0000-4000-8000-000000000001", "40000000-0000-4000-8000-000000000001",
      expect.objectContaining({ baseAddress: "서울", accessNote: "호출" }), expect.any(String));
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("accepts scoped identity changes only when enabled and preserves leading zeros", async () => {
    mocks.getProfile.mockResolvedValue({ storeProfileId: "profile" });
    mocks.enabled.mockImplementation(feature => feature === "STORE_PROFILE_SETTINGS");
    const required = { storeName: "합성 매장", baseAddress: "합성 주소" };
    const fields = { businessName: null, subBusinessNumber: "0002" };

    expect((await PATCH(request({ ...required, ...fields }))).status).toBe(200);
    expect(mocks.updateProfile.mock.lastCall?.[2]).not.toHaveProperty("subBusinessNumber");
    mocks.updateProfile.mockClear();

    mocks.enabled.mockImplementation((feature, company) =>
      feature === "STORE_PROFILE_SETTINGS" || (feature === "STORE_BUSINESS_IDENTITY" && company === companyId));
    expect((await PATCH(request({ ...required, subBusinessNumber: "002" }))).status).toBe(400);
    expect(mocks.updateProfile).not.toHaveBeenCalled();
    expect((await PATCH(request({ ...required, ...fields }))).status).toBe(200);
    expect(mocks.updateProfile.mock.lastCall?.[2]).toMatchObject({ businessName: "", subBusinessNumber: "0002" });
    expect(mocks.updateProfile.mock.lastCall?.[2]).not.toHaveProperty("businessEntityType");
  });
});

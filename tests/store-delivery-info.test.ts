import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { missingDeliveryInfo } from "../domains/order/delivery-info";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ context: vi.fn(), enabled: vi.fn(), getProfile: vi.fn(), updateProfile: vi.fn(), updateDelivery: vi.fn(), updateAddress: vi.fn(), getAddress: vi.fn(), verify: vi.fn(), db: vi.fn() }));
vi.mock("@/lib/store/07-store-member-context", () => ({ getStoreMemberContext: mocks.context }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.enabled }));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.db }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
vi.mock("@/lib/store/07-store-information", () => ({ getStoreProfileInformation: mocks.getProfile, updateStoreProfileInformation: mocks.updateProfile, updateStoreProfileDeliveryInformation: mocks.updateDelivery }));
vi.mock("../lib/store/07-store-information", () => ({ getStoreProfileInformation: mocks.getProfile, updateStoreProfileInformation: mocks.updateProfile, updateStoreProfileDeliveryInformation: mocks.updateDelivery }));
vi.mock("@/lib/store/07-store-address-management", () => ({ updateStoreAddress: mocks.updateAddress, getStoreAddress: mocks.getAddress, verifyStoreAddressSelection: mocks.verify, searchStoreAddresses: vi.fn() }));
vi.mock("../lib/store/07-store-address-management", () => ({ updateStoreAddress: mocks.updateAddress, getStoreAddress: mocks.getAddress, verifyStoreAddressSelection: mocks.verify, searchStoreAddresses: vi.fn() }));
vi.mock("../lib/pricing/store-delivery-eligibility", () => ({ storeAddressVerificationEnabled: () => true, getStoreDeliveryEligibility: async () => ({ eligible: false, reason: "address_unknown" }) }));
import { PUT } from "../app/api/store/delivery-info/route";
import { readStoreOrderStatus } from "../lib/pricing/store-order-status";

const companyId = "00000000-0000-4000-8000-000000000001", storeAccountId = "20000000-0000-4000-8000-000000000001";
const put = (body: unknown) => new NextRequest(`https://test/api/store/delivery-info?companyId=${companyId}&storeAccountId=${storeAccountId}`,
  { method: "PUT", headers: { origin: "https://test", host: "test", "Content-Type": "application/json" }, body: JSON.stringify(body) });
const full = { selectionProof: "proof", addressDetail: "2층", accessNote: "후문 냉장고 앞", deliveryContactPhone: "010-1234-5678", receiveMethod: "door" };

describe("missingDeliveryInfo", () => {
  const on = { profile: true, receiveMethod: true };
  it("상세 주소가 비면 빠진 항목으로 나온다(주소·상세 주소는 프로필 설정이 꺼져도 필수)", () => {
    expect(missingDeliveryInfo({ baseAddress: "서울 중구 1", addressDetail: " ", required: { profile: false, receiveMethod: false } }).map(item => item.key)).toEqual(["addressDetail"]);
    expect(missingDeliveryInfo({ required: on }).map(item => item.key)).toEqual(["baseAddress", "addressDetail"]);
  });
  it("프로필 항목·새벽 비밀번호 유무만 본다(값은 받지 않는다)", () => {
    const profile = { accessNote: "", deliveryContactPhone: "", receiveMethod: "dawn", hasAccessPassword: false };
    expect(missingDeliveryInfo({ baseAddress: "a", addressDetail: "b", profile, required: on }).map(item => item.key)).toEqual(["accessNote", "deliveryContactPhone", "accessPassword"]);
    expect(missingDeliveryInfo({ baseAddress: "a", addressDetail: "b", profile: { ...profile, accessNote: "x", deliveryContactPhone: "0212345678", hasAccessPassword: true }, required: on })).toEqual([]);
  });
});

describe("PUT /api/store/delivery-info", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
    mocks.context.mockResolvedValue({ authUserId: "40000000-0000-4000-8000-000000000001", companyId, storeAccountId, role: "owner" });
    mocks.verify.mockReturnValue("서울 중구 세종대로 110");
    mocks.getProfile.mockResolvedValue({ storeProfileId: "p1", storeName: "합성", representativeName: "대표", preferredDeliveryTime: "", taxInvoiceEmail: "", hasAccessPassword: false });
  });
  it("새벽 배송인데 비밀번호가 없으면 저장하지 않는다", async () => {
    const response = await PUT(put({ ...full, receiveMethod: "dawn" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "출입 비밀번호를 입력해 주세요." });
    expect(mocks.updateAddress).not.toHaveBeenCalled();
    expect(mocks.updateDelivery).not.toHaveBeenCalled();
  });
  it("'출입 통제 있음'이어도 비밀번호가 필요하다", async () => {
    expect((await PUT(put({ ...full, accessControlled: true }))).status).toBe(400);
    expect(mocks.updateAddress).not.toHaveBeenCalled();
  });
  it("한 요청에서 주소는 배송지에, 나머지는 매장 프로필에 저장하고 비밀번호 값을 응답에 싣지 않는다", async () => {
    const response = await PUT(put({ ...full, receiveMethod: "dawn", accessPassword: "s3cret-pw" }));
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toContain("s3cret-pw");
    expect(mocks.updateAddress).toHaveBeenCalledWith({ companyId, storeAccountId, baseAddress: "서울 중구 세종대로 110", addressDetail: "2층" });
    expect(mocks.updateDelivery).toHaveBeenCalledWith("p1", "40000000-0000-4000-8000-000000000001",
      expect.objectContaining({ baseAddress: "서울 중구 세종대로 110", addressDetail: "2층", accessNote: "후문 냉장고 앞", receiveMethod: "dawn", accessPassword: "s3cret-pw" }), expect.any(String));
  });
  it("프로필 설정이 꺼진 회사도 주소·상세 주소 저장은 동작한다", async () => {
    mocks.enabled.mockReturnValue(false);
    expect((await PUT(put({ selectionProof: "proof", addressDetail: "2층" }))).status).toBe(200);
    expect(mocks.updateAddress).toHaveBeenCalledOnce();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
    expect((await PUT(put({ selectionProof: "proof", addressDetail: "  " }))).status).toBe(400);
  });
  it("직원 구성원이나 다른 출처는 막는다", async () => {
    mocks.context.mockResolvedValueOnce({ companyId, storeAccountId, role: "staff" });
    expect((await PUT(put(full))).status).toBe(403);
    expect((await PUT(new NextRequest(`https://test/api/store/delivery-info?companyId=${companyId}&storeAccountId=${storeAccountId}`, { method: "PUT", headers: { origin: "https://evil", host: "test" }, body: "{}" }))).status).toBe(403);
  });
});

describe("고객사 화면 order-status — 점주 배송 정보 입력 대기", () => {
  it("빠진 항목과 비밀번호 있음/없음만 돌려주고 값은 싣지 않는다", async () => {
    mocks.enabled.mockReturnValue(true);
    mocks.db.mockImplementation(async (path: string) => path.startsWith("normalized_customers?") ? [{ delivery_base_address: "서울 중구 1", delivery_address_detail: null }]
      : path.startsWith("store_accounts?") ? [{ store_profile_id: "p1", store_profiles: { access_note: "후문", delivery_contact_phone: "0212345678", receive_method: "dawn", access_password_updated_at: "2026-11-26T00:00:00Z" } }] : []);
    const status = await readStoreOrderStatus(companyId, "30000000-0000-4000-8000-000000000001");
    expect(status.deliveryInfo).toEqual({ missing: [{ key: "addressDetail", label: "상세 주소" }], passwordSet: true });
    expect(JSON.stringify(status)).not.toMatch(/access_password"|accessPassword/);
  });
});

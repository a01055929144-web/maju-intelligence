import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { deliveryBlockGuide } from "../domains/order/delivery-eligibility";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ db: vi.fn(), verify: vi.fn(), eligibility: vi.fn(), scope: vi.fn(), access: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db, canAccessAssignedCustomer: mocks.access }));
vi.mock("../lib/pricing/store-delivery-eligibility", () => ({ storeAddressVerificationEnabled: mocks.verify, getStoreDeliveryEligibility: mocks.eligibility }));
vi.mock("../lib/auth", () => ({ getRequestAuthScope: mocks.scope, getCustomerAssignmentKeys: () => [] }));
import { readStoreOrderStatus } from "../lib/pricing/store-order-status";
import { GET } from "../app/api/customers/[id]/order-status/route";

const company = "00000000-0000-4000-8000-000000000001", customer = "20000000-0000-4000-8000-000000000001";

describe("CX-145 P1-3 막힘 사유별 제목·다음 행동", () => {
  it("사유별로 제목과 행동이 갈린다", () => {
    expect(deliveryBlockGuide("address_unknown")).toEqual({ headline: "배송지 주소가 없습니다", action: "address" });
    expect(deliveryBlockGuide("outside_area")).toEqual({ headline: "이 주소는 아직 배송 지역이 아닙니다", action: "call" });
    for (const reason of ["territory_link_required", "weekdays_unconfigured", "territory_unconfigured", "verification_unavailable"])
      expect(deliveryBlockGuide(reason)).toEqual({ headline: "고객사 설정이 필요합니다", action: "call" });
  });
});

describe("CX-145 P1-3 고객사 화면 주문 불가 사유", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.scope.mockResolvedValue({ ok: true, companyId: company }); mocks.access.mockResolvedValue(true); });
  it("주소 확인이 켜진 회사: 주소 없음이면 사유와 안내", async () => {
    mocks.verify.mockReturnValue(true); mocks.eligibility.mockResolvedValue({ eligible: false, reason: "address_unknown" });
    const status = await readStoreOrderStatus(company, customer);
    expect(status).toMatchObject({ orderable: false, reason: "address_unknown", headline: "배송지 주소가 없습니다" });
    expect(status.message).toContain("주소");
  });
  it("주소 확인이 켜진 회사: 가능하면 주문 가능", async () => {
    mocks.verify.mockReturnValue(true); mocks.eligibility.mockResolvedValue({ eligible: true, reason: "eligible", weekdays: [1] });
    expect(await readStoreOrderStatus(company, customer)).toMatchObject({ orderable: true });
  });
  it("주소 확인이 꺼진 회사: 거래처·권역·회사 기본 요일이 모두 없으면 요일 미설정, 회사 기본이 있으면 가능", async () => {
    mocks.verify.mockReturnValue(false);
    mocks.db.mockImplementation(async (path: string) => path.startsWith("normalized_customers?") ? [{ delivery_territory_id: null }] : []);
    expect(await readStoreOrderStatus(company, customer)).toMatchObject({ orderable: false, reason: "weekdays_unconfigured", headline: "고객사 설정이 필요합니다" });
    mocks.db.mockImplementation(async (path: string) => path.startsWith("normalized_customers?") ? [{ delivery_territory_id: null }] : path.startsWith("company_profiles?") ? [{ delivery_weekdays: [1, 2, 3] }] : []);
    expect(await readStoreOrderStatus(company, customer)).toMatchObject({ orderable: true });
  });
  it("라우트: 세션 없음 401, 담당 아님 403, 잘못된 id 400", async () => {
    const call = (id: string) => GET(new NextRequest("http://localhost/x"), { params: Promise.resolve({ id }) });
    mocks.scope.mockResolvedValueOnce({ ok: false });
    expect((await call(customer)).status).toBe(401);
    expect((await call("bad")).status).toBe(400);
    mocks.access.mockResolvedValueOnce(false);
    expect((await call(customer)).status).toBe(403);
    mocks.verify.mockReturnValue(true); mocks.eligibility.mockResolvedValue({ eligible: false, reason: "outside_area" });
    const ok = await call(customer);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ orderable: false, headline: "이 주소는 아직 배송 지역이 아닙니다" });
  });
});

import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ feature: vi.fn(), member: vi.fn(), request: vi.fn(), sign: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.feature }));
vi.mock("@/lib/store/07-store-member-context", () => ({ getStoreMemberContext: mocks.member }));
vi.mock("@/lib/store", () => ({ createCustomerAttachmentSignedUrl: mocks.sign, supabaseRequest: mocks.request }));
import { GET } from "../app/api/store/order-delivery-photos/route";

const company = "00000000-0000-4000-8000-000000000001";
const account = "20000000-0000-4000-8000-000000000001";
const order = "10000000-0000-4000-8000-000000000001";
const call = () => GET(new NextRequest(`https://test/api/store/order-delivery-photos?companyId=${company}&storeAccountId=${account}&orderId=${order}`));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.member.mockResolvedValue({ companyId: company, storeAccountId: account, memberId: "member-1" });
  mocks.feature.mockReturnValue(true);
  mocks.request.mockResolvedValueOnce([{ customer_id: "customer-1" }]).mockResolvedValueOnce([{ id: order }]).mockResolvedValueOnce([
    { id: "photo-1", storage_path: `${company}/customer-1/proof.jpg`, sort_order: 1 },
  ]);
  mocks.sign.mockResolvedValue("https://signed.test/store-photo");
});

it("활성 매장 구성원의 회사·매장·거래처 주문만 사진을 읽는다", async () => {
  const response = await call();
  expect(response.status).toBe(200);
  expect(mocks.member).toHaveBeenCalledWith({ companyId: company, storeAccountId: account });
  expect(mocks.request.mock.calls[1][0]).toContain(`customer_id=eq.customer-1&id=eq.${order}&or=(store_account_id.eq.${account},store_account_id.is.null)`);
  expect(mocks.sign).toHaveBeenCalledWith(`${company}/customer-1/proof.jpg`, 600);
});

it("다른 매장 주문이면 사진 저장소를 읽지 않는다", async () => {
  mocks.request.mockReset().mockResolvedValueOnce([{ customer_id: "customer-1" }]).mockResolvedValueOnce([]);
  expect((await call()).status).toBe(404);
  expect(mocks.request).toHaveBeenCalledTimes(2);
  expect(mocks.sign).not.toHaveBeenCalled();
});

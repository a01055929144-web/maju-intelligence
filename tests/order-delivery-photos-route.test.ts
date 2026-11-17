import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), feature: vi.fn(), request: vi.fn(), sign: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getRequestAuthScope: mocks.auth }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.feature }));
vi.mock("@/lib/store", () => ({ createCustomerAttachmentSignedUrl: mocks.sign, supabaseRequest: mocks.request }));
import { GET } from "../app/api/orders/delivery-photos/route";

const company = "00000000-0000-4000-8000-000000000001";
const order = "10000000-0000-4000-8000-000000000001";
const call = () => GET(new NextRequest(`https://test/api/orders/delivery-photos?orderId=${order}`));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, companyId: company, customerSession: { id: "customer-session" } });
  mocks.feature.mockReturnValue(true);
  mocks.request.mockResolvedValueOnce([{ id: order }]).mockResolvedValueOnce([
    { id: "photo-1", storage_path: `${company}/customer/proof.jpg`, sort_order: 1 },
    { id: "photo-2", storage_path: "other-company/customer/leak.jpg", sort_order: 2 },
  ]);
  mocks.sign.mockResolvedValue("https://signed.test/photo");
});

it("고객사 주문 소유권을 먼저 확인하고 회사 저장 경로만 10분 서명한다", async () => {
  const response = await call();
  expect(response.status).toBe(200);
  expect(mocks.request.mock.calls[0][0]).toContain(`company_id=eq.${company}&id=eq.${order}`);
  expect(mocks.request.mock.calls[1][0]).toContain(`order_id=eq.${order}`);
  expect(mocks.sign).toHaveBeenCalledWith(`${company}/customer/proof.jpg`, 600);
  expect(await response.json()).toEqual({ photos: [{ id: "photo-1", sortOrder: 1, url: "https://signed.test/photo" }] });
});

it("기본 OFF면 주문이나 사진을 읽지 않는다", async () => {
  mocks.feature.mockReturnValue(false);
  expect((await call()).status).toBe(404);
  expect(mocks.request).not.toHaveBeenCalled();
});

import { beforeEach, expect, it, vi } from "vitest";

const request = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/store", () => ({ supabaseRequest: request }));
import { listCompanyStoreNotifications, markNewOrderNotificationProcessed } from "../lib/store/07-company-notifications";

const company = "00000000-0000-4000-8000-000000000001";

beforeEach(() => request.mockReset());

it("한 회사의 새 주문·새 매장·정보 변경을 같은 목록으로 읽는다", async () => {
  request.mockResolvedValue([{ id: "n1", notification_type: "new_order", store_account_id: "s", customer_id: "c",
    before_values: {}, after_values: { storeName: "합성 매장" }, read_at: null, processed_at: null, created_at: "2026-11-17T00:00:00Z" }]);
  expect((await listCompanyStoreNotifications(company))[0]).toMatchObject({ notificationType: "new_order", subject: "합성 매장" });
  expect(request.mock.calls[0][0]).toContain(`company_id=eq.${company}`);
  expect(request.mock.calls[0][0]).toContain("notification_type=in.(new_order,new_store,store_review_required,store_profile_changed)");
});

it("주문 확인 뒤 그 주문의 새 주문 알림만 처리 표시한다", async () => {
  request.mockResolvedValue(undefined);
  await markNewOrderNotificationProcessed(company, "00000000-0000-4000-8000-000000000002");
  expect(request.mock.calls[0][0]).toContain(`company_id=eq.${company}&order_id=eq.00000000-0000-4000-8000-000000000002&notification_type=eq.new_order&processed_at=is.null`);
  expect(JSON.parse(request.mock.calls[0][1].body)).toHaveProperty("processed_at");
});

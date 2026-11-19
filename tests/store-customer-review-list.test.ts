import { beforeEach, expect, it, vi } from "vitest";

const request = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/store", () => ({ supabaseRequest: request }));
import { listStoreCustomerReviews } from "../lib/store/07-store-customer-review";

const company = "00000000-0000-4000-8000-000000000001";

beforeEach(() => request.mockReset());

it("회사 범위의 확인 필요 계정만 읽고 비밀번호 칸은 조회하지 않는다", async () => {
  request
    .mockResolvedValueOnce([{ id: "a1", customer_id: "c1", store_profile_id: "p1", business_status: "active", created_at: "2026-11-19T00:00:00Z" }])
    .mockResolvedValueOnce([{ id: "p1", store_name: "합성 매장", business_registration_number: "1234567890", business_status: "active", base_address: "서울", address_detail: "1층" }])
    .mockResolvedValueOnce([{ id: "c1", customer_name: "자동 매출처" }]);
  expect(await listStoreCustomerReviews(company)).toEqual([expect.objectContaining({ storeAccountId: "a1", storeName: "합성 매장", address: "서울 1층" })]);
  expect(request.mock.calls[0][0]).toContain(`company_id=eq.${company}`);
  expect(request.mock.calls[0][0]).toContain("customer_review_status=eq.needs_review");
  expect(request.mock.calls.map(([path]) => path).join("\n")).not.toContain("access_password");
});

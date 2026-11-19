import { beforeEach, expect, it, vi } from "vitest";

const getSession = vi.hoisted(() => vi.fn());
const hasCapability = vi.hoisted(() => vi.fn());
const enabled = vi.hoisted(() => vi.fn());
const list = vi.hoisted(() => vi.fn());
const candidates = vi.hoisted(() => vi.fn());
const confirmNew = vi.hoisted(() => vi.fn());
const linkExisting = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  getCustomerSession: getSession,
  customerHasCapability: hasCapability,
  getCustomerOperationalName: () => "합성 담당자",
}));
vi.mock("@/lib/store/07-store-customer-review-feature", () => ({ storeCustomerReviewEnabled: enabled }));
vi.mock("@/lib/store/07-store-customer-review", () => ({ listStoreCustomerReviews: list }));
vi.mock("@/lib/pricing/store-customer-review", () => ({
  StoreReviewError: class StoreReviewError extends Error { constructor(message: string, readonly status = 400) { super(message); } },
  reviewCandidates: candidates,
  confirmNewCustomer: confirmNew,
  linkExistingCustomer: linkExisting,
}));

import { GET, POST } from "../app/api/customer/store-reviews/route";

const company = "00000000-0000-4000-8000-000000000001";
const account = "10000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ companyId: company, userId: "20000000-0000-4000-8000-000000000001", name: "담당", workspaceRole: "owner" });
  hasCapability.mockReturnValue(true);
  enabled.mockReturnValue(true);
  list.mockResolvedValue([]);
});

it("기능 OFF면 목록 조회도 하지 않고 404다", async () => {
  enabled.mockReturnValue(false);
  expect((await GET()).status).toBe(404);
  expect(list).not.toHaveBeenCalled();
});

it("서명 세션 회사만 목록 범위로 사용한다", async () => {
  expect((await GET()).status).toBe(200);
  expect(list).toHaveBeenCalledWith(company);
});

it("대표·관리자가 아니면 거부한다", async () => {
  hasCapability.mockReturnValue(false);
  expect((await GET()).status).toBe(403);
  expect(list).not.toHaveBeenCalled();
});

it("교차 origin 쓰기를 거부한다", async () => {
  const request = new Request("https://maju.test/api/customer/store-reviews", { method: "POST", headers: { origin: "https://evil.test", "content-type": "application/json" }, body: JSON.stringify({ action: "confirm_new", storeAccountId: account }) });
  expect((await POST(request as never)).status).toBe(403);
  expect(confirmNew).not.toHaveBeenCalled();
});

it("본문 회사값 없이 세션 회사로만 새 매출처 확정 RPC를 호출한다", async () => {
  confirmNew.mockResolvedValue({ customerId: "c1" });
  const request = new Request("https://maju.test/api/customer/store-reviews", { method: "POST", headers: { origin: "https://maju.test", "content-type": "application/json" }, body: JSON.stringify({ action: "confirm_new", storeAccountId: account, companyId: "다른 회사" }) });
  expect((await POST(request as never)).status).toBe(200);
  expect(confirmNew).toHaveBeenCalledWith(company, account, expect.objectContaining({ name: "합성 담당자" }));
});

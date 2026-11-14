import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/store", () => ({ getSupabaseConfig: () => ({ url: "https://example.supabase.co", serviceRoleKey: "test-key" }) }));

import { getStageFQueue } from "../app/admin/operations/stage-f-read";

function response(ids: string[], total = ids.length, ok = true) {
  return { headers: new Headers({ "content-range": `0-${Math.max(0, ids.length - 1)}/${total}` }), json: async () => ids.map((id) => ({ id })), ok, status: ok ? 200 : 500 } as Response;
}

beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", mocks.fetch); });

it("returns exact issue counts and at most 20 source IDs", async () => {
  mocks.fetch.mockImplementation(async (input: string | URL | Request) => {
    const url = String(input);
    expect(url).toContain("company_id=eq.company-1");
    expect(url).toMatch(/limit=(20|1000)/);
    if (url.includes("customer_imports?")) return response(["import-1"], 21);
    if (url.includes("product_catalog?")) return response(["product-1"], 1);
    if (url.includes("active_match=is.null")) return response(["supplier-unmatched"], 1);
    if (url.includes("conversion_confirmed=eq.false")) return response(["supplier-unconfirmed"], 1);
    if (url.includes("storefront_links?")) return response(["link-1"], 1);
    if (url.includes("document_version_id=is.null")) return response([], 0); // 전체 상품 링크 주문 구분용 두 번째 조회
    if (url.includes("store_orders?")) return response(["order-1"], 1);
    throw new Error(`Unexpected query: ${url}`);
  });
  const queue = await getStageFQueue("company-1");
  expect(queue.map(({ count, ids, key, status }) => ({ count, ids, key, status }))).toEqual([
    { count: 21, ids: ["import-1"], key: "uploads", status: "ready" },
    { count: 3, ids: ["product-1", "supplier-unmatched", "supplier-unconfirmed"], key: "products", status: "ready" },
    { count: 1, ids: ["link-1"], key: "links", status: "ready" },
    { count: 1, ids: ["order-1"], key: "orders", status: "ready" }
  ]);
});

it("keeps every source query isolated to the selected company", async () => {
  mocks.fetch.mockResolvedValue(response([], 0));
  await getStageFQueue("company/a");
  expect(mocks.fetch).toHaveBeenCalledTimes(7);
  for (const [url] of mocks.fetch.mock.calls) expect(String(url)).toContain("company_id=eq.company%2Fa");
});

it("reports a failed source instead of a normal zero", async () => {
  mocks.fetch.mockImplementation(async (input: string | URL | Request) => String(input).includes("customer_imports?") ? response([], 0, false) : response([], 0));
  const [uploads] = await getStageFQueue("company-1");
  expect(uploads).toMatchObject({ count: null, ids: [], key: "uploads", status: "error" });
});

it("does not count catalog-link orders without a document version as broken", async () => {
  mocks.fetch.mockImplementation(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("document_version_id=is.null")) return { ok: true, status: 200, headers: new Headers(), json: async () => [{ id: "order-doc", link_id: "link-doc" }, { id: "order-catalog", link_id: "link-catalog" }] } as Response;
    if (url.includes("source=eq.catalog")) return { ok: true, status: 200, headers: new Headers(), json: async () => [{ id: "link-catalog" }] } as Response;
    return response([], 0);
  });
  const orders = (await getStageFQueue("company-1")).find((item) => item.key === "orders");
  expect(orders).toMatchObject({ count: 1, ids: ["order-doc"], status: "ready" });
});

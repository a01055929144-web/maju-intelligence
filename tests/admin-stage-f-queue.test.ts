import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.db }));

import { getStageFQueue } from "../app/admin/operations/stage-f-read";

beforeEach(() => vi.clearAllMocks());

it("returns company-scoped issue counts and source IDs", async () => {
  mocks.db.mockImplementation(async (path: string) => {
    expect(path).toContain("company_id=eq.company-1");
    if (path.startsWith("customer_imports?")) return [{ id: "import-1", status: "failed", quality_score: 100, duplicate_count: 0, ai_reports: [] }];
    if (path.startsWith("product_catalog?")) return [{ id: "product-1", canonical_name: "상품", purchase_product_name: "상품", sales_unit: null, tax_type: "taxable" }];
    if (path.startsWith("supplier_products?")) return [{ id: "supplier-product-1" }];
    if (path.startsWith("supplier_product_matches?")) return [{ supplier_product_id: "supplier-product-1", match_status: "confirmed", conversion_confirmed: false }];
    if (path.startsWith("storefront_links?")) return [{ id: "link-1", can_order: true, expires_at: "2099-01-01T00:00:00Z", revoked_at: "2026-01-01T00:00:00Z" }];
    if (path.startsWith("store_orders?")) return [{ id: "order-1", customer_id: "customer-1", document_version_id: "version-1", link_id: "missing-link" }];
    throw new Error(`Unexpected query: ${path}`);
  });

  const queue = await getStageFQueue("company-1");
  expect(queue.map(({ count, ids, key, status }) => ({ count, ids, key, status }))).toEqual([
    { count: 1, ids: ["import-1"], key: "uploads", status: "ready" },
    { count: 2, ids: ["product-1", "supplier-product-1"], key: "products", status: "ready" },
    { count: 1, ids: ["link-1"], key: "links", status: "ready" },
    { count: 1, ids: ["order-1"], key: "orders", status: "ready" }
  ]);
});

it("reports a failed source instead of a normal zero", async () => {
  mocks.db.mockImplementation(async (path: string) => {
    if (path.startsWith("customer_imports?")) throw new Error("synthetic read failure");
    return [];
  });
  const [uploads] = await getStageFQueue("company-1");
  expect(uploads).toMatchObject({ count: null, ids: [], key: "uploads", status: "error" });
});

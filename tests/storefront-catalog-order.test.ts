vi.mock("@/domains/order/order-rules", () => import("../domains/order/order-rules"));
vi.mock("@/domains/pricing/document", () => import("../domains/pricing/document"));
vi.mock("@/lib/pricing/storefront", () => import("../lib/pricing/storefront"));
vi.mock("@/lib/pricing/storefront-public", () => import("../lib/pricing/storefront-public"));
vi.mock("@/lib/feature-flags", () => import("../lib/feature-flags"));
vi.mock("@/lib/pricing/feature", () => import("../lib/pricing/feature"));
vi.mock("@/lib/pricing/store-order-feature", () => import("../lib/pricing/store-order-feature"));
vi.mock("@/lib/pricing/store-order-member", () => ({ getStoreOrderActor: async () => null }));
vi.mock("@/lib/store/07-store-member-context", () => ({ getStoreOrderMemberContext: async () => null }));
vi.mock("@/lib/auth", () => ({ storeMemberSessionEnabled: () => false }));
vi.mock("@/lib/store/07-store-member-feature", () => ({ isStoreMemberCompanyAllowlisted: () => false }));
vi.mock("@/lib/pricing/store-order-delivery-feature", () => import("../lib/pricing/store-order-delivery-feature"));
vi.mock("@/lib/pricing/store-order-delivery-producer", () => import("../lib/pricing/store-order-delivery-producer"));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const { db } = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("@/lib/store", () => ({ supabaseRequest: db }));
vi.mock("@/lib/pricing/store-link-token", () => ({ verifyStoreLinkToken: () => ({ id: "link", hash: "a".repeat(64) }) }));
vi.mock("../lib/pricing/store-link-token", () => ({ verifyStoreLinkToken: () => ({ id: "link", hash: "a".repeat(64) }) }));
import { readStorefront } from "../lib/pricing/storefront";
import { PUT } from "../app/api/storefront/route";

// CC-36c-2b: 전체 상품 링크(문서 없음)로 읽고 주문. 가짜 데이터만.
const company = "00000000-0000-4000-8000-000000000001";
const product = "00000000-0000-4000-8000-000000000002";
const idem = "00000000-0000-4000-8000-000000000009";

function fixture(path: string, documentVersionId: string | null) {
  if (path.startsWith("storefront_links?")) return [{ id: "link", company_id: company, customer_id: "customer", document_version_id: documentVersionId, expires_at: "2099-12-31T00:00:00Z", revoked_at: null, can_order: true }];
  if (path.startsWith("companies?")) return [{ name: "가짜유통" }];
  if (path.startsWith("normalized_customers?")) return [{ id: "customer", customer_name: "가짜상점", delivery_territory_id: "territory" }];
  if (path.startsWith("store_order_territory_rules?")) return [{ delivery_weekdays: [0, 1, 2, 3, 4, 5, 6], cutoff_time: "23:59:00" }];
  if (path.startsWith("rpc/place_store_")) return { id: "order", revision: 1 };
  return [];
}
const put = () => new NextRequest("https://store.example.test/api/storefront", {
  method: "PUT", headers: { origin: "https://store.example.test" },
  body: JSON.stringify({ token: "signed", deliveryDate: "2099-01-01", memo: "", idempotencyKey: idem, lines: [{ productId: product, quantity: 2, unitPrice: 1 }] }),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PRICE_SHEETS_ENABLED", "true"); vi.stubEnv("STORE_ORDERING_ENABLED", "true");
  vi.stubEnv("STORE_LINK_SECRET", "synthetic-test-secret-32-characters-long");
  vi.stubEnv("STORE_PUBLIC_BASE_URL", "https://store.example.test"); vi.stubEnv("HOLD_MODULES_ENABLED_COMPANY_IDS", "");
  vi.stubEnv("FEATURE_PRICING_COMPANY_IDS", company); vi.stubEnv("FEATURE_STORE_ORDERING_COMPANY_IDS", company);
  db.mockImplementation(async (path: string) => fixture(path, null));
});
afterEach(() => vi.unstubAllEnvs());

describe("전체 상품 링크 읽기", () => {
  it("스위치가 꺼진 회사는 열리지 않는다", async () => {
    expect(await readStorefront("signed", "2099-01-01")).toBeNull();
  });
  it("스위치가 켜진 회사는 품목 없는 catalog 매장으로 열리고 주문 가능 상태", async () => {
    vi.stubEnv("FEATURE_STORE_CATALOG_LINK_COMPANY_IDS", company);
    const store = await readStorefront("signed", "2099-01-01");
    expect(store).toMatchObject({ source: "catalog", companyName: "가짜유통", customerName: "가짜상점", lines: [], priceAvailable: true, canOrder: true });
  });
  it("문서 링크는 그대로 document", async () => {
    db.mockImplementation(async (path: string) => path.startsWith("pricing_document_versions?")
      ? [{ id: "version", version: 1, published_at: "2026-01-01", content: { kind: "sheet", title: "합성", companyName: "합성", footer: "", showPrice: true, validUntil: "2099-12-31", lines: [] } }]
      : fixture(path, "version"));
    expect((await readStorefront("signed", "2099-01-01"))?.source).toBe("document");
  });
});

describe("전체 상품 주문 연결", () => {
  it("catalog 링크는 catalog 주문 RPC로 보내고 문서 주문 RPC는 부르지 않는다(요청 단가는 보내지 않음)", async () => {
    vi.stubEnv("FEATURE_STORE_CATALOG_LINK_COMPANY_IDS", company);
    expect((await PUT(put())).status).toBe(200);
    const calls = db.mock.calls.filter(([path]) => String(path).startsWith("rpc/place_store_"));
    expect(calls.map(([path]) => path)).toEqual(["rpc/place_store_catalog_order_v1"]);
    const body = JSON.parse(calls[0][1].body);
    expect(body.p_lines).toEqual([{ productId: product, promotionId: undefined, quantity: 2 }].map((line) => JSON.parse(JSON.stringify(line))));
  });
  it("문서 링크는 기존 주문 RPC", async () => {
    db.mockImplementation(async (path: string) => path.startsWith("pricing_document_versions?")
      ? [{ id: "version", version: 1, published_at: "2026-01-01", content: { kind: "sheet", title: "합성", companyName: "합성", footer: "", showPrice: true, validUntil: "2099-12-31", lines: [] } }]
      : fixture(path, "version"));
    expect((await PUT(put())).status).toBe(200);
    expect(db.mock.calls.some(([path]) => path === "rpc/place_store_order")).toBe(true);
  });
  it("배송지 스냅샷이 켜진 회사의 catalog 주문은 거부하고 주문 RPC를 부르지 않는다", async () => {
    vi.stubEnv("FEATURE_STORE_CATALOG_LINK_COMPANY_IDS", company);
    vi.stubEnv("STORE_ORDER_DELIVERY_SNAPSHOT_ENABLED", "true"); vi.stubEnv("STORE_ORDER_DELIVERY_COMPANY_IDS", company);
    expect((await PUT(put())).status).toBe(409);
    expect(db.mock.calls.some(([path]) => String(path).startsWith("rpc/place_store_"))).toBe(false);
  });
});

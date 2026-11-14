vi.mock("@/lib/feature-flags",()=>import("../lib/feature-flags"));
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// CC-36c-2a: 전체 상품 링크 발급·목록 (문서 없는 링크). 스위치 STORE_CATALOG_LINK 회사 allowlist.
const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getRequestAuthScope: mocks.auth, getCustomerOperationalName: () => "대표" }));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.db }));
vi.mock("@/domains/pricing/access", () => ({ canManagePriceSheets: () => true }));
vi.mock("@/lib/pricing/feature", () => ({ priceSheetsEnabled: () => true }));
vi.mock("@/lib/pricing/store-order-feature", () => ({ storeOrderingEnabled: () => true }));
vi.mock("@/domains/pricing/document", () => ({
  isId: (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
}));
vi.mock("@/lib/pricing/store-link-token", async () => import("../lib/pricing/store-link-token"));

import { GET, POST } from "../app/api/pricing-store-links/route";
import { issueStoreLinkToken } from "../lib/pricing/store-link-token";

const company = "00000000-0000-4000-8000-000000000001";
const customer = "00000000-0000-4000-8000-000000000003";
const linkId = "00000000-0000-4000-8000-000000000004";
const keys = ["PRICE_SHEETS_ENABLED", "STORE_ORDERING_ENABLED", "STORE_LINK_SECRET", "STORE_PUBLIC_BASE_URL", "FEATURE_PRICING_COMPANY_IDS", "FEATURE_STORE_ORDERING_COMPANY_IDS", "FEATURE_STORE_CATALOG_LINK_COMPANY_IDS"];
const oldEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PRICE_SHEETS_ENABLED = "true";
  process.env.STORE_ORDERING_ENABLED = "true";
  process.env.STORE_LINK_SECRET = "synthetic-local-test-secret-longer-than-32-characters";
  process.env.STORE_PUBLIC_BASE_URL = "https://store.example.test";
  process.env.FEATURE_PRICING_COMPANY_IDS = company;
  process.env.FEATURE_STORE_ORDERING_COMPANY_IDS = company;
  delete process.env.FEATURE_STORE_CATALOG_LINK_COMPANY_IDS;
  mocks.auth.mockResolvedValue({ ok: true, companyId: company, customerSession: { role: "owner", workspaceRole: "owner", userId: customer } });
});
afterEach(() => {
  for (const [key, value] of Object.entries(oldEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const create = () => POST(new NextRequest("http://localhost/api/pricing-store-links", {
  method: "POST",
  headers: { origin: "http://localhost" },
  body: JSON.stringify({ companyId: company, action: "create", kind: "catalog", customerId: customer }),
}));

it("스위치가 꺼진 회사는 전체 상품 링크를 만들 수 없고 DB도 건드리지 않는다", async () => {
  expect((await create()).status).toBe(400);
  expect(mocks.db).not.toHaveBeenCalled();
});

it("스위치가 켜진 회사: 문서 조회 없이 전체 상품 발급 RPC만 호출한다", async () => {
  process.env.FEATURE_STORE_CATALOG_LINK_COMPANY_IDS = company;
  const nonce = "a".repeat(32);
  mocks.db.mockImplementation(async (path: string) => {
    if (path.startsWith("normalized_customers?")) return [{ id: customer }];
    if (path === "rpc/issue_catalog_storefront_links_v1")
      return [{ issued_customer_id: customer, issued_link_id: linkId, issued_token_nonce: nonce, issued_token_hash: issueStoreLinkToken(linkId, nonce).hash, was_created: true }];
    throw new Error(`Unexpected query ${path}`);
  });
  const response = await create();
  expect(response.status).toBe(200);
  expect(((await response.json()) as { created: boolean }).created).toBe(true);
  const paths = mocks.db.mock.calls.map(([path]) => String(path));
  expect(paths).toContain("rpc/issue_catalog_storefront_links_v1");
  expect(paths.some((path) => path.startsWith("pricing_document_versions") || path === "rpc/issue_storefront_links")).toBe(false);
  const body = JSON.parse(mocks.db.mock.calls.find(([path]) => path === "rpc/issue_catalog_storefront_links_v1")![1].body);
  expect(body).not.toHaveProperty("p_document_version");
  expect(body.p_links[0]).toMatchObject({ customerId: customer });
});

it("목록에 전체 상품 링크(문서 없음)가 종류와 함께 보인다", async () => {
  process.env.FEATURE_STORE_CATALOG_LINK_COMPANY_IDS = company;
  const nonce = "b".repeat(32);
  mocks.db.mockImplementation(async (path: string) => {
    if (path.startsWith("storefront_links?")) return [{ id: linkId, customer_id: customer, document_version_id: null, token_nonce: nonce, issued_at: "2026-11-14T00:00:00Z", expires_at: "2027-11-14T00:00:00Z", revoked_at: null, can_order: true, view_count: 0, last_viewed_at: null }];
    if (path.startsWith("normalized_customers?")) return [{ id: customer, customer_name: "가짜상점" }];
    if (path === "rpc/storefront_link_metrics") return [];
    throw new Error(`Unexpected query ${path}`);
  });
  const response = await GET(new NextRequest(`http://localhost/api/pricing-store-links?companyId=${company}`));
  const body = (await response.json()) as { items: Array<{ kind: string; documentTitle: string; documentVersionId: string | null }>; catalogEnabled: boolean };
  expect(response.status).toBe(200);
  expect(body.catalogEnabled).toBe(true);
  expect(body.items[0]).toMatchObject({ kind: "catalog", documentTitle: "전체 상품", documentVersionId: null });
});

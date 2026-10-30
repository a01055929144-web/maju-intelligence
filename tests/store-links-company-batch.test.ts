import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getRequestAuthScope: mocks.auth,
  getCustomerOperationalName: () => "대표",
}));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.db }));
vi.mock("@/lib/feature-modules", () => ({ areHoldModulesEnabled: () => true }));
vi.mock("@/domains/pricing/access", () => ({ canManagePriceSheets: () => true }));
vi.mock("@/lib/pricing/feature", () => ({ priceSheetsEnabled: () => process.env.PRICE_SHEETS_ENABLED === "true" }));
vi.mock("@/lib/pricing/store-order-feature", () => ({
  storeOrderingEnabled: () => process.env.STORE_ORDERING_ENABLED === "true",
}));
vi.mock("@/domains/pricing/document", () => ({
  isId: (value: unknown) => typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
}));
vi.mock("@/lib/pricing/store-link-token", async () =>
  import("../lib/pricing/store-link-token"));

import { GET, POST } from "../app/api/pricing-store-links/route";
import { verifyStoreLinkToken } from "../lib/pricing/store-link-token";

const company = "00000000-0000-4000-8000-000000000001";
const version = "00000000-0000-4000-8000-000000000002";
const customer = "00000000-0000-4000-8000-000000000003";
const oldEnv = Object.fromEntries(["PRICE_SHEETS_ENABLED", "STORE_ORDERING_ENABLED",
  "STORE_LINK_SECRET", "STORE_PUBLIC_BASE_URL", "HOLD_MODULES_ENABLED_COMPANY_IDS"]
  .map((key) => [key, process.env[key]]));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PRICE_SHEETS_ENABLED = "true";
  process.env.STORE_ORDERING_ENABLED = "true";
  process.env.STORE_LINK_SECRET = "synthetic-local-test-secret-longer-than-32-characters";
  process.env.STORE_PUBLIC_BASE_URL = "https://store.example.test";
  process.env.HOLD_MODULES_ENABLED_COMPANY_IDS = company;
  mocks.auth.mockResolvedValue({ ok: true, companyId: company,
    customerSession: { role: "owner", workspaceRole: "owner", userId: customer } });
});
afterEach(() => {
  for (const [key, value] of Object.entries(oldEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

it("pages the full company by customer ID without an unbounded read", async () => {
  mocks.db.mockResolvedValueOnce(Array.from({ length: 51 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    customer_name: `매장 ${index + 1}`,
  })));
  const response = await GET(new NextRequest(
    `http://localhost/api/pricing-store-links?companyId=${company}&customerPage=1`,
  ));
  const body = await response.json() as { items: unknown[]; nextCursor: string };
  expect(response.status).toBe(200);
  expect(body.items).toHaveLength(50);
  expect(body.nextCursor).toBe("00000000-0000-4000-8000-000000000050");
  expect(mocks.db.mock.calls[0][0]).toContain("select=id,customer_name,address");
  expect(mocks.db.mock.calls[0][0]).toContain("&order=id.asc&limit=51");
});

it("issues through the atomic RPC and rebuilds a reusable existing link", async () => {
  const existingId = "00000000-0000-4000-8000-000000000004";
  const nonce = "a".repeat(32);
  mocks.db.mockImplementation(async (path: string) => {
    if (path.startsWith("normalized_customers?")) return [{ id: customer }];
    if (path.startsWith("pricing_document_versions?")) return [{ id: version }];
    if (path === "rpc/issue_storefront_links") return [{ issued_customer_id: customer,
      issued_link_id: existingId, issued_token_nonce: nonce, was_created: false }];
    throw new Error(`Unexpected query ${path}`);
  });
  const response = await POST(new NextRequest("http://localhost/api/pricing-store-links", {
    method: "POST", headers: { origin: "http://localhost" },
    body: JSON.stringify({ companyId: company, action: "create-batch",
      customerIds: [customer], documentVersionId: version }),
  }));
  const body = await response.json() as { links: { customerId: string; created: boolean; url: string }[] };
  expect(response.status).toBe(200);
  expect(body.links[0]).toMatchObject({ customerId: customer, created: false });
  expect(verifyStoreLinkToken(new URL(body.links[0].url).hash.slice(1))?.id).toBe(existingId);
  expect(mocks.db.mock.calls.some(([path]) => path === "rpc/issue_storefront_links")).toBe(true);
  expect(mocks.db.mock.calls.some(([path, options]) =>
    path === "storefront_links" && options?.method === "POST")).toBe(false);
});

it("rejects a customer outside the company before issuing any link", async () => {
  mocks.db.mockImplementation(async (path: string) => path.startsWith("normalized_customers?") ? [] : [{ id: version }]);
  const response = await POST(new NextRequest("http://localhost/api/pricing-store-links", {
    method: "POST", headers: { origin: "http://localhost" },
    body: JSON.stringify({ companyId: company, action: "create-batch",
      customerIds: [customer], documentVersionId: version }),
  }));
  expect(response.status).toBe(400);
  expect(mocks.db.mock.calls.some(([path]) => path === "rpc/issue_storefront_links")).toBe(false);
});

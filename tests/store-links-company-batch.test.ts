vi.mock("@/lib/feature-flags",()=>import("../lib/feature-flags"));
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn(), canManage: true }));
vi.mock("@/lib/auth", () => ({
  getRequestAuthScope: mocks.auth,
  getCustomerOperationalName: () => "대표",
}));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.db }));
vi.mock("@/domains/pricing/access", () => ({
  canManagePriceSheets: () => mocks.canManage,
}));
vi.mock("@/lib/pricing/feature", () => ({
  priceSheetsEnabled: () => process.env.PRICE_SHEETS_ENABLED === "true",
}));
vi.mock("@/lib/pricing/store-order-feature", () => ({
  storeOrderingEnabled: () => process.env.STORE_ORDERING_ENABLED === "true",
}));
vi.mock("@/domains/pricing/document", () => ({
  isId: (value: unknown) =>
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    ),
}));
vi.mock(
  "@/lib/pricing/store-link-token",
  async () => import("../lib/pricing/store-link-token"),
);

import { GET, POST } from "../app/api/pricing-store-links/route";
import {
  issueStoreLinkToken,
  verifyStoreLinkToken,
} from "../lib/pricing/store-link-token";

const company = "00000000-0000-4000-8000-000000000001";
const version = "00000000-0000-4000-8000-000000000002";
const customer = "00000000-0000-4000-8000-000000000003";
const oldEnv = Object.fromEntries(
  [
    "PRICE_SHEETS_ENABLED",
    "STORE_ORDERING_ENABLED",
    "STORE_LINK_SECRET",
    "STORE_PUBLIC_BASE_URL",
    "FEATURE_PRICING_COMPANY_IDS",
    "FEATURE_STORE_ORDERING_COMPANY_IDS",
    "READ_ONLY_STORE_LINKS_ENABLED",
  ].map((key) => [key, process.env[key]]),
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.canManage = true;
  process.env.READ_ONLY_STORE_LINKS_ENABLED = "false";
  process.env.PRICE_SHEETS_ENABLED = "true";
  process.env.STORE_ORDERING_ENABLED = "true";
  process.env.STORE_LINK_SECRET =
    "synthetic-local-test-secret-longer-than-32-characters";
  process.env.STORE_PUBLIC_BASE_URL = "https://store.example.test";
  process.env.FEATURE_PRICING_COMPANY_IDS = company;
  process.env.FEATURE_STORE_ORDERING_COMPANY_IDS = company;
  mocks.auth.mockResolvedValue({
    ok: true,
    companyId: company,
    customerSession: {
      role: "owner",
      workspaceRole: "owner",
      userId: customer,
    },
  });
});
afterEach(() => {
  for (const [key, value] of Object.entries(oldEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

it("pages the full company by customer ID without an unbounded read", async () => {
  mocks.db.mockResolvedValueOnce(
    Array.from({ length: 51 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      customer_name: `매장 ${index + 1}`,
    })),
  );
  const response = await GET(
    new NextRequest(
      `http://localhost/api/pricing-store-links?companyId=${company}&customerPage=1`,
    ),
  );
  const body = (await response.json()) as {
    items: unknown[];
    nextCursor: string;
  };
  expect(response.status).toBe(200);
  expect(body.items).toHaveLength(50);
  expect(body.nextCursor).toBe("00000000-0000-4000-8000-000000000050");
  expect(mocks.db.mock.calls[0][0]).toContain(
    "select=id,customer_name,address",
  );
  expect(mocks.db.mock.calls[0][0]).toContain("&order=id.asc&limit=51");
});

it("issues through the atomic RPC and rebuilds a reusable existing link", async () => {
  const existingId = "00000000-0000-4000-8000-000000000004";
  const nonce = "a".repeat(32);
  mocks.db.mockImplementation(async (path: string) => {
    if (path.startsWith("normalized_customers?")) return [{ id: customer }];
    if (path.startsWith("pricing_document_versions?"))
      return [{ id: version, document_id: version }];
    if (path.startsWith("pricing_documents?"))
      return [{ id: version, kind: "sheet" }];
    if (path === "rpc/issue_storefront_links")
      return [
        {
          issued_customer_id: customer,
          issued_link_id: existingId,
          issued_token_nonce: nonce,
          issued_token_hash: issueStoreLinkToken(existingId, nonce).hash,
          was_created: false,
        },
      ];
    throw new Error(`Unexpected query ${path}`);
  });
  const response = await POST(
    new NextRequest("http://localhost/api/pricing-store-links", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body: JSON.stringify({
        companyId: company,
        action: "create-batch",
        customerIds: [customer],
        documentVersionId: version,
      }),
    }),
  );
  const body = (await response.json()) as {
    links: { customerId: string; created: boolean; url: string }[];
  };
  expect(response.status).toBe(200);
  expect(body.links[0]).toMatchObject({ customerId: customer, created: false });
  expect(
    verifyStoreLinkToken(new URL(body.links[0].url).hash.slice(1))?.id,
  ).toBe(existingId);
  expect(
    mocks.db.mock.calls.some(([path]) => path === "rpc/issue_storefront_links"),
  ).toBe(true);
  expect(
    mocks.db.mock.calls.some(
      ([path, options]) =>
        path === "storefront_links" && options?.method === "POST",
    ),
  ).toBe(false);
});

it("rejects a customer outside the company before issuing any link", async () => {
  mocks.db.mockImplementation(async (path: string) =>
    path.startsWith("normalized_customers?") ? [] : [{ id: version }],
  );
  const response = await POST(
    new NextRequest("http://localhost/api/pricing-store-links", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body: JSON.stringify({
        companyId: company,
        action: "create-batch",
        customerIds: [customer],
        documentVersionId: version,
      }),
    }),
  );
  expect(response.status).toBe(400);
  expect(
    mocks.db.mock.calls.some(([path]) => path === "rpc/issue_storefront_links"),
  ).toBe(false);
});

it("does not return a broken link after the signing secret changes", async () => {
  mocks.db.mockImplementation(async (path: string) => {
    if (path.startsWith("normalized_customers?")) return [{ id: customer }];
    if (path.startsWith("pricing_document_versions?"))
      return [{ id: version, document_id: version }];
    if (path.startsWith("pricing_documents?"))
      return [{ id: version, kind: "sheet" }];
    if (path === "rpc/issue_storefront_links")
      return [
        {
          issued_customer_id: customer,
          issued_link_id: customer,
          issued_token_nonce: "a".repeat(32),
          issued_token_hash: "b".repeat(64),
          was_created: false,
        },
      ];
    throw new Error(`Unexpected query ${path}`);
  });
  const response = await POST(
    new NextRequest("http://localhost/api/pricing-store-links", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body: JSON.stringify({
        companyId: company,
        action: "create",
        customerId: customer,
        documentVersionId: version,
      }),
    }),
  );
  expect(response.status).toBe(400);
  expect(((await response.json()) as { message: string }).message).toContain(
    "서명 설정이 변경",
  );
});

it("continues the company cursor with the same tenant and strict ID ordering", async () => {
  mocks.db.mockResolvedValueOnce([]);
  const after = "00000000-0000-4000-8000-000000000050";
  expect(
    (
      await GET(
        new NextRequest(
          `http://localhost/api/pricing-store-links?customerPage=1&afterId=${after}`,
        ),
      )
    ).status,
  ).toBe(200);
  expect(mocks.db.mock.calls[0][0]).toContain(
    `company_id=eq.${company}&id=gt.${after}`,
  );
});
it("rejects another author's quote before invoking issuance RPC", async () => {
  mocks.db.mockImplementation(async (path: string) => {
    if (path.startsWith("normalized_customers?")) return [{ id: customer }];
    if (path.startsWith("pricing_document_versions?"))
      return [{ id: version, document_id: version }];
    if (path.startsWith("pricing_documents?"))
      return [{ id: version, kind: "quote", owner_key: "another-author" }];
    throw new Error(`Unexpected query ${path}`);
  });
  const response = await POST(
    new NextRequest("http://localhost/api/pricing-store-links", {
      method: "POST",
      headers: { origin: "http://localhost" },
      body: JSON.stringify({
        action: "create",
        customerId: customer,
        documentVersionId: version,
      }),
    }),
  );
  expect(response.status).toBe(400);
  expect(
    mocks.db.mock.calls.some(([path]) => path === "rpc/issue_storefront_links"),
  ).toBe(false);
});

it("hides another author's quote links and denies their event details", async () => {
  mocks.db.mockImplementation(async (path: string) => {
    if (path.startsWith("storefront_links?")) return [{ id: customer, customer_id: customer, document_version_id: version }];
    if (path.startsWith("pricing_document_versions?")) return [{ id: version, document_id: version, content: { title: "private quote" } }];
    if (path.startsWith("pricing_documents?")) return [{ id: version, kind: "quote", owner_key: "other-author" }];
    return [];
  });
  const response = await GET(new NextRequest("http://localhost/api/pricing-store-links"));
  expect((await response.json()).items).toEqual([]);
  const detail = await GET(new NextRequest(`http://localhost/api/pricing-store-links?linkId=${customer}`));
  expect(detail.status).toBe(404);
  expect(mocks.db.mock.calls.some(([path]) => String(path).startsWith("storefront_link_events?"))).toBe(false);
});

it.each(["FEATURE_PRICING_COMPANY_IDS", "FEATURE_STORE_ORDERING_COMPANY_IDS"])("blocks link reads and issuance when %s excludes the session company",async flag=>{
  process.env[flag]="other-company";
  expect((await GET(new NextRequest("http://localhost/api/pricing-store-links"))).status).toBe(404);
  expect((await POST(new NextRequest("http://localhost/api/pricing-store-links",{method:"POST",body:JSON.stringify({action:"create",companyId:"other-company",customerId:customer,documentVersionId:version})}))).status).toBe(404);
  expect(mocks.db).not.toHaveBeenCalled();
});

function readonlyRequest(canOrder: unknown, action = "create") {
  return new NextRequest("http://localhost/api/pricing-store-links", { method: "POST", headers: { origin: "http://localhost" }, body: JSON.stringify({ companyId: company, action, customerId: customer, customerIds: [customer], documentVersionId: version, canOrder }) });
}
function mockIssue() {
  mocks.db.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.startsWith("normalized_customers?")) return [{ id: customer }];
    if (path.startsWith("pricing_document_versions?")) return [{ id: version, document_id: version }];
    if (path.startsWith("pricing_documents?")) return [{ id: version, kind: "sheet" }];
    if (path === "rpc/issue_storefront_links") {
      const link = JSON.parse(String(init?.body)).p_links[0];
      return [{ issued_customer_id: customer, issued_link_id: link.id, issued_token_nonce: link.nonce, issued_token_hash: link.hash, was_created: true }];
    }
    throw new Error(`Unexpected query ${path}`);
  });
}
it("blocks readonly issuance before DB reads with the default OFF flag", async () => {
  expect((await POST(readonlyRequest(false))).status).toBe(400);
  expect(mocks.db).not.toHaveBeenCalled();
});
it("passes explicit false inside the existing issuer RPC without a later PATCH", async () => {
  process.env.READ_ONLY_STORE_LINKS_ENABLED = "true"; mockIssue();
  const response = await POST(readonlyRequest(false)); expect(response.status).toBe(200);
  const calls = mocks.db.mock.calls.filter(([path]) => path === "rpc/issue_storefront_links");
  expect(calls).toHaveLength(1); expect(JSON.parse(String(calls[0][1].body)).p_links[0].canOrder).toBe(false);
  expect(mocks.db.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  expect(verifyStoreLinkToken(new URL((await response.json()).url).hash.slice(1))).not.toBeNull();
});
it.each([undefined, true])("keeps ordinary %s issuance on the legacy default", async canOrder => {
  mockIssue(); expect((await POST(readonlyRequest(canOrder))).status).toBe(200);
  const call = mocks.db.mock.calls.find(([path]) => path === "rpc/issue_storefront_links")!;
  expect(JSON.parse(String(call[1].body)).p_links[0]).not.toHaveProperty("canOrder");
});
it.each([null, "false", 0])("rejects a nonboolean readonly value %# before DB reads", async value => {
  process.env.READ_ONLY_STORE_LINKS_ENABLED = "true";
  expect((await POST(readonlyRequest(value))).status).toBe(400); expect(mocks.db).not.toHaveBeenCalled();
});
it("rejects readonly bulk issuance and unauthorized managers before DB reads", async () => {
  process.env.READ_ONLY_STORE_LINKS_ENABLED = "true";
  expect((await POST(readonlyRequest(false, "create-batch"))).status).toBe(400); expect(mocks.db).not.toHaveBeenCalled();
  mocks.canManage = false;
  expect((await POST(readonlyRequest(false))).status).toBe(403); expect(mocks.db).not.toHaveBeenCalled();
});
it("reports an existing orderable link conflict without a fallback write", async () => {
  process.env.READ_ONLY_STORE_LINKS_ENABLED = "true"; mockIssue();
  const issue = mocks.db.getMockImplementation()!;
  mocks.db.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "rpc/issue_storefront_links") throw new Error("Supabase request failed: readonly_link_existing_orderable_conflict");
    return issue(path, init);
  });
  const response = await POST(readonlyRequest(false)); expect(response.status).toBe(400);
  expect((await response.json()).message).toContain("회수");
  expect(mocks.db.mock.calls.filter(([path]) => path === "rpc/issue_storefront_links")).toHaveLength(1);
});

vi.mock("@/lib/feature-flags",()=>import("../lib/feature-flags"));
vi.mock("@/lib/pricing/feature",()=>import("../lib/pricing/feature"));
vi.mock("@/lib/pricing/store-order-feature",()=>import("../lib/pricing/store-order-feature"));
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), request: vi.fn() }));
vi.mock("../lib/auth", () => ({ getRequestAuthScope: mocks.auth }));
vi.mock("../lib/pricing/documents-repository", () => ({
  pricingDocumentsRepository: { request: mocks.request },
}));
import { GET, POST } from "../app/api/pricing-documents/route";
import { lineFromCatalog, type DocumentContent } from "../domains/pricing/document";
const c = "00000000-0000-4000-8000-000000000001",
  flag = process.env.PRICE_SHEETS_ENABLED,
  hold = process.env.FEATURE_PRICING_COMPANY_IDS;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.PRICE_SHEETS_ENABLED = "true";
  process.env.FEATURE_PRICING_COMPANY_IDS = c;
  mocks.auth.mockResolvedValue({
    ok: true,
    companyId: c,
    customerSession: {
      role: "owner",
      workspaceRole: "owner",
      email: "synthetic@example.test",
    },
  });
  mocks.request.mockResolvedValue({ items: [], total: 0 });
});
const documentContent: DocumentContent = {
  kind: "sheet", title: "합성 저장 재현", companyName: "합성 회사", contact: "", recipient: "", footer: "", validUntil: "2099-12-31",
  theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true,
  lines: [lineFromCatalog({ id: "20000000-0000-4000-8000-000000000001", name: "합성 면세 상품", displayName: "합성 면세 상품", brand: "", spec: "", unit: "개", price: 1000, taxType: "exempt" })],
};
function saveRequest() {
  return new NextRequest("http://localhost/api/pricing-documents", { method: "POST", body: JSON.stringify({ action: "save", id: "10000000-0000-4000-8000-000000000001", expected: 19, content: documentContent }) });
}
it.each([
  ["Stale document", "P0001", 409, "document_conflict", "다른 화면"],
  ["Promotion not found", "P0001", 400, "promotion_not_found", "행사·임박"],
  ["Promotion not enabled for sheets", "P0001", 400, "promotion_sheet_disabled", "단가표 표시"],
  ["Product not found in company", "P0001", 400, "product_unavailable", "비활성"],
  ["Invalid printable line", "P0001", 400, "invalid_document_line", "과세"],
  ["column does not exist", "42703", 503, "document_storage_failed", "서버 저장 오류"],
  ["Stale document", "23505", 503, "document_storage_failed", "서버 저장 오류"],
  ["toString", "P0001", 503, "document_storage_failed", "서버 저장 오류"],
])("revision 19: %s is classified without exposing DB details", async (message, databaseCode, status, code, hint) => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    mocks.request.mockRejectedValueOnce(new Error(`Supabase request failed: 400 ${JSON.stringify({ code: databaseCode, message, details: "PRIVATE_DOCUMENT_CONTENT", hint: "PRIVATE_DATABASE_HINT" })}`));
    const response = await POST(saveRequest()), body = await response.json();
    expect(response.status).toBe(status);
    expect(body).toMatchObject({ code, databaseCode, message: expect.stringContaining(hint) });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(JSON.stringify([body, log.mock.calls])).not.toMatch(/PRIVATE_DOCUMENT_CONTENT|PRIVATE_DATABASE_HINT/);
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ companyId: c }), "save", expect.objectContaining({ expected: 19 }));
  } finally { log.mockRestore(); }
});
it("unknown save failure keeps revision and permits same-content retry", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    mocks.request.mockRejectedValueOnce(new Error("PRIVATE_NETWORK_OR_REQUEST_VALUE"));
    const failed = await POST(saveRequest());
    expect(failed.status).toBe(503);
    expect(JSON.stringify(await failed.json())).not.toContain("PRIVATE_");
    mocks.request.mockResolvedValueOnce({ id: "10000000-0000-4000-8000-000000000001", revision: 20, content: documentContent });
    expect((await (await POST(saveRequest())).json()).result.revision).toBe(20);
    expect(mocks.request.mock.calls.filter(call => call[1] === "save").map(call => call[2].expected)).toEqual([19, 19]);
    expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE_");
  } finally { log.mockRestore(); }
});
afterEach(() => {
  if (flag === undefined) delete process.env.PRICE_SHEETS_ENABLED;
  else process.env.PRICE_SHEETS_ENABLED = flag;
  if (hold === undefined) delete process.env.FEATURE_PRICING_COMPANY_IDS;
  else process.env.FEATURE_PRICING_COMPANY_IDS = hold;
});
it("OFF performs no auth or SQL call", async () => {
  process.env.PRICE_SHEETS_ENABLED = "false";
  expect(
    (await GET(new NextRequest("http://localhost/api/pricing-documents")))
      .status,
  ).toBe(404);
  expect(
    (
      await POST(
        new NextRequest("http://localhost/api/pricing-documents", {
          method: "POST",
          body: "{}",
        }),
      )
    ).status,
  ).toBe(404);
  expect(mocks.auth).not.toHaveBeenCalled();
  expect(mocks.request).not.toHaveBeenCalled();
});
it("allows manager and sales with a server-derived opaque author", async () => {
  for (const workspaceRole of ["manager", "sales"]) {
    mocks.auth.mockResolvedValueOnce({
      ok: true,
      companyId: c,
      customerSession: {
        role: "member",
        workspaceRole,
        email: "synthetic@example.test",
      },
    });
    expect(
      (
        await GET(
          new NextRequest(
            "http://localhost/api/pricing-documents?action=list&companyId=other",
          ),
        )
      ).status,
    ).toBe(200);
  }
  expect(mocks.request).toHaveBeenLastCalledWith(
    {
      companyId: c,
      manager: false,
      actor: expect.stringMatching(/^[a-f0-9]{64}$/),
    },
    "list",
    expect.objectContaining({ page: 1 }),
  );
});
it.each(["driver", "member", "temporary"])(
  "denies %s",
  async (workspaceRole) => {
    mocks.auth.mockResolvedValueOnce({
      ok: true,
      companyId: c,
      customerSession: {
        role: "member",
        workspaceRole,
        email: "synthetic@example.test",
      },
    });
    expect(
      (await GET(new NextRequest("http://localhost/api/pricing-documents")))
        .status,
    ).toBe(403);
    expect(mocks.request).not.toHaveBeenCalled();
  },
);
it("denies anonymous, unscoped and disabled companies before SQL", async () => {
  mocks.auth.mockResolvedValueOnce({ ok: false });
  expect(
    (await GET(new NextRequest("http://localhost/api/pricing-documents")))
      .status,
  ).toBe(401);
  process.env.FEATURE_PRICING_COMPANY_IDS = "";
  expect(
    (await GET(new NextRequest("http://localhost/api/pricing-documents")))
      .status,
  ).toBe(404);
  expect(mocks.request).not.toHaveBeenCalled();
});

it("accepts actual incoming Host when Next normalizes the internal URL and rejects cross-site writes", async () => {
  const id = "10000000-0000-4000-8000-000000000001";
  const valid = new NextRequest("http://localhost:3179/api/pricing-documents", {
    method: "POST",
    headers: { host: "127.0.0.1:3179", origin: "http://127.0.0.1:3179" },
    body: JSON.stringify({ action: "publish", id, expected: 1 }),
  });
  expect((await POST(valid)).status).toBe(200);
  mocks.request.mockClear();
  expect(
    (
      await POST(
        new NextRequest("http://localhost/api/pricing-documents", {
          method: "POST",
          headers: { host: "localhost", origin: "https://other.example.test" },
          body: "{}",
        }),
      )
    ).status,
  ).toBe(403);
  expect(mocks.request).not.toHaveBeenCalled();
});

it("HOLD allowlisting alone cannot grant pricing access",async()=>{
 const previous=process.env.HOLD_MODULES_ENABLED_COMPANY_IDS;
 try {process.env.HOLD_MODULES_ENABLED_COMPANY_IDS="00000000-0000-4000-8000-000000000001";process.env.FEATURE_PRICING_COMPANY_IDS="";
 expect((await GET(new NextRequest("http://localhost/api/pricing-documents"))).status).toBe(404);
 expect(mocks.request).not.toHaveBeenCalled();
 }finally{if(previous===undefined)delete process.env.HOLD_MODULES_ENABLED_COMPANY_IDS;else process.env.HOLD_MODULES_ENABLED_COMPANY_IDS=previous;}
});

it("gates the new VAT contract on the authenticated company before any write", async () => {
  const enabled = process.env.PRICING_DOCUMENT_VAT_ENABLED, allowed = process.env.PRICING_DOCUMENT_VAT_COMPANY_IDS;
  const input = { action: "save", id: "10000000-0000-4000-8000-000000000001", expected: 0, content: { ...documentContent, priceContract: "promotion-gross-v1" } };
  const request = () => new NextRequest("http://localhost/api/pricing-documents?companyId=other-company", { method: "POST", body: JSON.stringify(input) });
  try {
    process.env.PRICING_DOCUMENT_VAT_ENABLED = "true"; process.env.PRICING_DOCUMENT_VAT_COMPANY_IDS = "other-company";
    expect((await POST(request())).status).toBe(400); expect(mocks.request).not.toHaveBeenCalled();
    process.env.PRICING_DOCUMENT_VAT_COMPANY_IDS = c;
    expect((await POST(request())).status).toBe(200);
    expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ companyId: c, documentVatEnabled: true }), "save", expect.objectContaining({ content: expect.objectContaining({ priceContract: "promotion-gross-v1" }) }));
  } finally {
    if (enabled === undefined) delete process.env.PRICING_DOCUMENT_VAT_ENABLED; else process.env.PRICING_DOCUMENT_VAT_ENABLED = enabled;
    if (allowed === undefined) delete process.env.PRICING_DOCUMENT_VAT_COMPANY_IDS; else process.env.PRICING_DOCUMENT_VAT_COMPANY_IDS = allowed;
  }
});

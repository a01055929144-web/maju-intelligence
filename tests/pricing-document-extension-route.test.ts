import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), request: vi.fn() }));
vi.mock("../lib/auth", () => ({ getRequestAuthScope: mocks.auth }));
vi.mock("../lib/pricing/documents-repository", () => ({ pricingDocumentsRepository: { request: mocks.request } }));
import { POST } from "../app/api/pricing-documents/route";

const companyId = "10000000-0000-4000-8000-000000000001";
const content = {
  kind: "sheet", title: "숨김 품목 회귀", companyName: "합성 유통", contact: "", recipient: "합성 매장", footer: "",
  validUntil: "2026-12-31", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true,
  lines: [
    { productId: "30000000-0000-4000-8000-000000000001", displayName: "양파", brand: "", spec: "1망", unit: "망", price: 1200, taxType: "exempt", visible: true, promotionId: null, startsOn: null, endsOn: null, remaining: null, badge: "" },
    { productId: "30000000-0000-4000-8000-000000000002", displayName: "감자", brand: "", spec: "1박스", unit: "박스", price: 1400, taxType: "taxable", visible: false, promotionId: null, startsOn: null, endsOn: null, remaining: null, badge: "" },
  ],
};

beforeEach(() => {
  vi.stubEnv("PRICE_SHEETS_ENABLED", "true");
  vi.stubEnv("FEATURE_PRICING_COMPANY_IDS", companyId);
  vi.stubEnv("PRICING_DOCUMENT_EXTENSION_ENABLED", "true");
  vi.stubEnv("PRICING_DOCUMENT_EXTENSION_COMPANY_IDS", companyId);
  mocks.auth.mockResolvedValue({ ok: true, companyId, customerSession: { workspaceRole: "owner", email: "synthetic@example.test" } });
  mocks.request.mockImplementation(async (_scope, _action, payload) => payload);
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

it("keeps hidden lines intact through the extension review API boundary", async () => {
  const response = await POST(new NextRequest("https://synthetic.test/api/pricing-documents", {
    method: "POST", headers: { origin: "https://synthetic.test" },
    body: JSON.stringify({ action: "extension-review", id: "40000000-0000-4000-8000-000000000001", expected: 2,
      mode: "latest", validUntil: "2027-01-31", stage: "review", content }),
  }));
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.result.content.lines).toHaveLength(2);
  expect(body.result.content.lines[1].visible).toBe(false);
  expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ companyId }), "extension-review",
    expect.objectContaining({ content: expect.objectContaining({ lines: expect.arrayContaining([expect.objectContaining({ visible: false })]) }) }));
});

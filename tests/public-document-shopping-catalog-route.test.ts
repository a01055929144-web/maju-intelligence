import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ context: vi.fn(), member: vi.fn(), rollout: vi.fn(), enabled: vi.fn(), catalog: vi.fn() }));
vi.mock("@/lib/pricing/document-share", () => ({ getPublicDocumentOrderContext: mocks.context }));
vi.mock("@/lib/store/07-store-member-context", () => ({ getStoreOrderMemberContextForCompany: mocks.member }));
vi.mock("@/lib/pricing/public-document-order-feature", () => ({ publicDocumentShoppingEnabled: mocks.rollout }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.enabled }));
vi.mock("@/lib/pricing/storefront-catalog-read", () => ({ readStorefrontCatalogPage: mocks.catalog }));
import { POST } from "../app/api/pricing-documents/shopping-catalog/route";

const request = (origin = "https://example.test") => new NextRequest("https://example.test/api/pricing-documents/shopping-catalog", {
  method: "POST", headers: { origin, "Content-Type": "application/json" },
  body: JSON.stringify({ token: "signed", page: 1, q: "아몬드", companyId: "untrusted", customerId: "untrusted" }),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({ companyId: "issuer" });
  mocks.rollout.mockReturnValue(true);
  mocks.enabled.mockReturnValue(true);
  mocks.member.mockResolvedValue({ companyId: "issuer", customerId: "member-customer" });
  mocks.catalog.mockResolvedValue({ hasMore: false, lines: [{ productId: "product", name: "아몬드", price: 1000, internalCost: 200 }] });
});

it("uses the link issuer and the verified member customer, with sales fields only", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(mocks.member).toHaveBeenCalledWith("issuer");
  expect(mocks.catalog).toHaveBeenCalledWith({ companyId: "issuer", customerId: "member-customer", marketPriceNotice: "" }, 1, "아몬드", true);
  expect(await response.json()).toEqual({ hasMore: false, lines: [{ id: "product", name: "아몬드", price: 1000 }] });
});

it("rejects another origin, anonymous or wrong-company readers and disabled companies", async () => {
  expect((await POST(request("https://other.test"))).status).toBe(404);
  expect(mocks.context).not.toHaveBeenCalled();
  mocks.member.mockResolvedValueOnce(null).mockResolvedValueOnce({ companyId: "other" });
  expect((await POST(request())).status).toBe(404);
  expect((await POST(request())).status).toBe(404);
  mocks.rollout.mockReturnValue(false);
  expect((await POST(request())).status).toBe(404);
  expect(mocks.catalog).not.toHaveBeenCalled();
});

import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mock = vi.hoisted(() => ({ flag: vi.fn(), member: vi.fn(), accounts: vi.fn(), store: vi.fn(), catalog: vi.fn(), share: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mock.flag }));
vi.mock("@/lib/store/07-store-member-context", () => ({ getStoreMemberContext: mock.member }));
vi.mock("@/lib/store/07-store-portal", () => ({ listStorePortalAccounts: mock.accounts }));
vi.mock("@/lib/store/07-store-activity", () => ({ recordStoreActivity: async () => undefined }));
vi.mock("@/lib/pricing/storefront", () => ({ readStorefront: mock.store }));
vi.mock("@/lib/pricing/storefront-catalog-read", () => ({ readStorefrontCatalogPage: mock.catalog }));
vi.mock("@/lib/pricing/document-share", () => ({ readPublicDocument: mock.share }));
import { GET } from "../app/api/store/price-search/route";

const companyId = "00000000-0000-4000-8000-000000000001";
const storeAccountId = "00000000-0000-4000-8000-000000000002";
const request = (extra: Record<string, string> = {}) => GET(new NextRequest(
  `https://example.test/api/store/price-search?${new URLSearchParams({ companyId, storeAccountId, kind: "sheet", document: "issued-link", ...extra })}`,
));
beforeEach(() => {
  vi.resetAllMocks();
  mock.flag.mockReturnValue(true);
  mock.member.mockResolvedValue({ companyId, storeAccountId });
  mock.accounts.mockResolvedValue([{ companyId, storeAccountId, documents: [
    { href: "/store#link.secret", kind: "sheet", canOrder: true, validUntil: "2099-01-01" },
    { href: "/pricing-document#quote.secret", kind: "quote", validUntil: "2099-01-01" },
  ] }]);
});

it("rejects disabled, unrelated store, and out-of-scope document reads", async () => {
  mock.flag.mockReturnValueOnce(false);
  expect((await request()).status).toBe(404);
  expect(mock.member).not.toHaveBeenCalled();
  mock.member.mockResolvedValueOnce(null);
  expect((await request()).status).toBe(404);
  expect(mock.accounts).not.toHaveBeenCalled();
  expect((await request({ storeAccountId: companyId })).status).toBe(404);
  expect((await request({ document: "issued-other" })).status).toBe(404);
  expect(mock.store).not.toHaveBeenCalled();
  expect(mock.share).not.toHaveBeenCalled();
});

it("uses only verified order-link prices and filters by spec", async () => {
  mock.store.mockResolvedValue({ companyId, priceAvailable: true, lines: [
    { key: "1", name: "양파", spec: "10kg", unit: "박스", unitPrice: 11000, cost: 4000 },
    { key: "2", name: "대파", spec: "1kg", unit: "단", unitPrice: 2000 },
  ] });
  const result = await request({ q: "10kg" });
  expect(result.status).toBe(200);
  expect(mock.store).toHaveBeenCalledExactlyOnceWith("link.secret");
  expect(await result.json()).toEqual({ rows: [{ id: "1", name: "양파", spec: "10kg", unit: "박스", price: 11000, recent: null }], hasMore: false });
});

it("keeps recent dispatch separate from the price and within the selected account", async () => {
  const store = { companyId, customerId: "customer", marketPriceNotice: "" };
  mock.store.mockResolvedValue(store);
  mock.catalog.mockResolvedValue({ lines: [
    { productId: "1", name: "양파", spec: "10kg", unit: "박스", price: null, lastDispatch: { price: 9800, date: "2026-11-12" } },
  ], hasMore: false });
  const result = await request({ kind: "catalog", q: "10kg" });
  expect(mock.catalog).toHaveBeenCalledWith(store, 1, "10kg", true);
  expect((await result.json()).rows[0]).toMatchObject({ price: null, recent: { price: 9800, date: "2026-11-12" } });
});

it("uses the verified public quote projection and suppresses expired prices", async () => {
  mock.share.mockResolvedValue({ document: { expired: true, lines: [{ displayName: "합성 품목", spec: "", unit: "", price: 1000 }] } });
  const result = await request({ kind: "quote", document: "shared-quote" });
  expect(mock.share).toHaveBeenCalledWith("quote.secret", `store-price-search:${storeAccountId}`);
  expect((await result.json()).rows[0].price).toBeNull();
});

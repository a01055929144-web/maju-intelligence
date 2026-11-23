import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ request: vi.fn(), enabled: vi.fn(), eligibility: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.request }));
vi.mock("../lib/pricing/store-delivery-eligibility", () => ({ storeAddressVerificationEnabled: mocks.enabled, getStoreDeliveryEligibility: mocks.eligibility }));
import { readDocumentOrderFooter, readPublicDocumentOrderFooter } from "../lib/pricing/document-order-footer";
import { documentOrderFooterEnabled } from "../lib/pricing/feature";
import { orderFooterNotice, withOrderFooter } from "../domains/pricing/document-order-footer";
import { pricingDocuments } from "../application/pricing/documents";
const company = "10000000-0000-4000-8000-000000000001", customerId = "20000000-0000-4000-8000-000000000001", territoryId = "30000000-0000-4000-8000-000000000001";
const scope = { companyId: company, actor: "synthetic-owner", manager: true, orderFooterEnabled: true };
let companyRule: object[], customers: object[], territory: object[], customer: object[];
beforeEach(() => {
  vi.resetAllMocks(); mocks.enabled.mockReturnValue(false);
  companyRule = [{ cutoff_days_before: 1, cutoff_time: "23:59:00" }];
  customers = [{ delivery_territory_id: territoryId }];
  territory = [{ cutoff_days_before: 2, cutoff_time: "19:15:00", delivery_weekdays: [4,2] }]; customer = [];
  mocks.request.mockImplementation(async (path: string) => {
    expect(path).toContain("company_id=eq." + company);
    expect(path).not.toContain("select=*");
    if (path.startsWith("store_order_settings?")) return companyRule;
    if (path.startsWith("normalized_customers?")) return customers;
    if (path.startsWith("store_order_territory_rules?")) return territory;
    if (path.startsWith("store_order_customer_rules?")) return customer;
    throw new Error("Unexpected table");
  });
});
afterEach(() => vi.unstubAllEnvs());
it("is OFF without an explicit company and rejects before reading", async () => {
  vi.stubEnv("FEATURE_DOCUMENT_ORDER_FOOTER_COMPANY_IDS", "other");
  expect(documentOrderFooterEnabled(company)).toBe(false);
  vi.stubEnv("FEATURE_DOCUMENT_ORDER_FOOTER_COMPANY_IDS", company);
  expect(documentOrderFooterEnabled(company)).toBe(true); expect(documentOrderFooterEnabled("")).toBe(false);
  await expect(readDocumentOrderFooter({ ...scope, orderFooterEnabled: false })).rejects.toMatchObject({ status: 404 });
  expect(mocks.request).not.toHaveBeenCalled();
});
it("shows the actual company cutoff without inventing common delivery weekdays", async () => {
  const rows = await readDocumentOrderFooter(scope);
  expect(rows.map(row => row.value)).toEqual(["전날 23:59 (권역·매장별 예외)", "권역·매장별 확인"]);
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
it("inherits territory then company independently, preserving explicit zero and midnight", async () => {
  expect((await readDocumentOrderFooter(scope, customerId)).map(row => row.value)).toEqual(["2일 전 19:15", "화·목"]);
  customer = [{ cutoff_days_before: 0, cutoff_time: null, delivery_weekdays: [0,6] }];
  expect((await readDocumentOrderFooter(scope, customerId)).map(row => row.value)).toEqual(["당일 19:15", "일·토"]);
  customer = [{ cutoff_days_before: 0, cutoff_time: "00:00:00", delivery_weekdays: [0] }];
  expect((await readDocumentOrderFooter(scope, customerId)).map(row => row.value)).toEqual(["당일 00:00", "일"]);
  territory = []; customer = [];
  expect((await readDocumentOrderFooter(scope, customerId)).map(row => row.value)).toEqual(["전날 23:59", "배송 설정 확인 필요"]);
});
it("uses the same verified territory boundary as actual storefront ordering", async () => {
  mocks.enabled.mockReturnValue(true); mocks.eligibility.mockResolvedValue({ eligible: false, reason: "address_unknown", weekdays: [] });
  expect((await readDocumentOrderFooter(scope, customerId)).map(row => row.value)).toEqual(["전날 23:59", "배송 설정 확인 필요"]);
  expect(mocks.request.mock.calls.some(([path]) => path.startsWith("store_order_territory_rules?"))).toBe(false);
  mocks.eligibility.mockResolvedValue({ eligible: true, territoryId, weekdays: [1,5] });
  expect((await readDocumentOrderFooter(scope, customerId))[1].value).toBe("월·금");
  expect(mocks.eligibility).toHaveBeenCalledWith(company, customerId);
});
it("rejects a foreign or missing customer and never returns names or addresses", async () => {
  customers = [];
  await expect(readDocumentOrderFooter(scope, customerId)).rejects.toMatchObject({ status: 404 });
  expect(mocks.request).toHaveBeenCalledTimes(2);
});
it("keeps the same absent-row default as ordering and fails closed on errors", async () => {
  companyRule = [];
  expect((await readDocumentOrderFooter(scope))[0].value).toBe("전날 22:00 (권역·매장별 예외)");
  mocks.request.mockRejectedValue(new Error("synthetic read failure"));
  await expect(readDocumentOrderFooter(scope)).rejects.toThrow("synthetic read failure");
});
it("allows only validated read metadata through the application boundary", async () => {
  const request = vi.fn().mockResolvedValue([]), app = pricingDocuments({ request });
  expect(() => app.read(scope, "order-footer", { customerId: "other-company-filter" })).toThrow();
  expect(() => app.read({ ...scope, orderFooterEnabled: false }, "order-footer", {})).toThrow();
  await app.read(scope, "order-footer", { customerId, companyId: "forged", values: { price: 0 } });
  expect(request).toHaveBeenCalledWith(scope, "order-footer", { customerId });
});
it("overlays only chosen order fields without mutating stored content or adding fields", () => {
  const saved = [...orderFooterNotice("전날 00:00"), { key: "other", label: "기존", value: "keep", place: "footer" as const }];
  const frozen = JSON.stringify(saved), current = orderFooterNotice("전날 23:59");
  expect(withOrderFooter(saved)).toBe(saved);
  const result = withOrderFooter(saved, current);
  expect(result[0].value).toBe("전날 23:59"); expect(result[2]).toBe(saved[2]); expect(JSON.stringify(saved)).toBe(frozen);
  expect(withOrderFooter([saved[2]], current)).toEqual([saved[2]]);
});

it("adds only allowlisted current public policy and degrades without exposing read errors", async () => {
  vi.stubEnv("FEATURE_DOCUMENT_ORDER_FOOTER_COMPANY_IDS", "other");
  expect(await readPublicDocumentOrderFooter(company)).toBeUndefined(); expect(mocks.request).not.toHaveBeenCalled();
  vi.stubEnv("FEATURE_DOCUMENT_ORDER_FOOTER_COMPANY_IDS", company);
  const result = await readPublicDocumentOrderFooter(company);
  expect(result).toEqual({ status: "available", items: await readDocumentOrderFooter(scope) });
  mocks.request.mockRejectedValue(new Error("PRIVATE-ERROR-CANARY"));
  expect(await readPublicDocumentOrderFooter(company)).toEqual({ status: "unavailable" });
});

import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db, getSupabaseConfig: vi.fn() }));
import { pricingDocumentsRepository } from "../lib/pricing/documents-repository";
import { pricingDocuments } from "../application/pricing/documents";
const company = "00000000-0000-4000-8000-000000000001", product = "20000000-0000-4000-8000-000000000001";
const scope = { companyId: company, actor: "a".repeat(64), manager: true };
const content = { productId: product, name: "합성 계란", displayName: "합성 계란", startsOn: "2026-11-18", endsOn: "2099-12-31", cost: 1000, margin: 10, stock: null, perStoreLimit: null, allowSheet: true, badge: "행사", taxType: "taxable" };
const input = (expected = 0) => ({ action: "save-promotion", id: "30000000-0000-4000-8000-000000000001", expected, content });
const service = pricingDocuments(pricingDocumentsRepository);
afterEach(() => { vi.resetAllMocks(); });
describe("new promotion inherits current server product tax", () => {
  it.each(["taxable", "exempt"])("uses server %s even when client sent another tax", async tax_type => {
    mocks.db.mockResolvedValueOnce([{ id: product, tax_type }]).mockResolvedValueOnce({ revision: 1 });
    const submitted = { ...input(), companyId: "forged-company", content: { ...content, taxType: tax_type === "exempt" ? "taxable" : "exempt" } };
    expect(await service.execute(scope, submitted)).toEqual({ revision: 1 });
    expect(mocks.db.mock.calls[0][0]).toBe(`product_catalog?company_id=eq.${company}&id=eq.${product}&is_active=eq.true&select=id,tax_type&limit=1`);
    const request = JSON.parse(mocks.db.mock.calls[1][1].body);
    expect(mocks.db.mock.calls[1][0]).toBe("rpc/pricing_p1");
    expect(request).toMatchObject({ p_company: company, p_actor: scope.actor, p_manager: true, p_action: "save-promotion", p_payload: { expected: 0, content: { taxType: tax_type, cost: 1000, margin: 10 } } });
    expect(submitted.content.taxType).not.toBe(tax_type);
  });
  it.each([[], [{ id: product, tax_type: null }], [{ id: product, tax_type: "unknown" }], [{ id: "other-product", tax_type: "exempt" }]])("rejects missing/unknown/foreign product before writing: %j", async rows => {
    mocks.db.mockResolvedValueOnce(rows);
    await expect(service.execute(scope, input())).rejects.toThrow("원상품의 과세·면세");
    expect(mocks.db).toHaveBeenCalledTimes(1);
  });
  it("does not write if current-tax read fails", async () => {
    mocks.db.mockRejectedValueOnce(new Error("synthetic read failed"));
    await expect(service.execute(scope, input())).rejects.toThrow("synthetic read failed");
    expect(mocks.db).toHaveBeenCalledTimes(1);
  });
  it("preserves explicit existing promotion edit and revision without automatically rewriting records", async () => {
    mocks.db.mockResolvedValueOnce({ revision: 5 });
    await service.execute(scope, { ...input(4), content: { ...content, taxType: "exempt" } });
    expect(mocks.db).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mocks.db.mock.calls[0][1].body).p_payload).toMatchObject({ expected: 4, content: { taxType: "exempt" } });
  });
  it("rejects unauthorized new promotion before product or write access", () => {
    expect(() => service.execute({ ...scope, manager: false }, input())).toThrow("행사 관리 권한");
    expect(mocks.db).not.toHaveBeenCalled();
  });
});

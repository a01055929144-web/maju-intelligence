import { beforeEach, describe, expect, it, vi } from "vitest";
import { productOrderCutoff } from "../domains/product/order-cutoff";

const { supabaseRequest } = vi.hoisted(() => ({ supabaseRequest: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest }));
import { listProductOrderCutoffsForAdmin, updateProductCatalogForAdmin, updateProductOrderCutoffsForAdmin } from "../lib/product-catalog-admin";

const company = "00000000-0000-4000-8000-000000000001";
const id = "10000000-0000-4000-8000-000000000001";
const input = { name: "합성 양파", purchaseUnit: "박스", salesUnit: "kg", purchasePrice: 1000, isActive: true };
const row = { id, canonical_name: "합성 양파", purchase_unit: "박스", sales_unit: "kg", is_active: true, purchase_price: 1000 };

describe("product order cutoff", () => {
  beforeEach(() => { supabaseRequest.mockReset(); delete process.env.FEATURE_PRODUCT_ORDER_CUTOFF_COMPANY_IDS; });

  it("requires both fields and accepts zero days or both empty", () => {
    expect(productOrderCutoff(0, "12:00")).toEqual({ order_cutoff_days_before: 0, order_cutoff_time: "12:00" });
    expect(productOrderCutoff(null, null)).toEqual({ order_cutoff_days_before: null, order_cutoff_time: null });
    expect(() => productOrderCutoff(2, null)).toThrow("함께");
    expect(() => productOrderCutoff(366, "12:00")).toThrow("0~365");
  });

  it("does not probe the DB when the company is not allowlisted", async () => {
    expect(await listProductOrderCutoffsForAdmin(company)).toBeNull();
    expect(await listProductOrderCutoffsForAdmin("")).toBeNull();
    expect(supabaseRequest).not.toHaveBeenCalled();
  });

  it("hides only missing S-3b columns, not other DB failures", async () => {
    process.env.FEATURE_PRODUCT_ORDER_CUTOFF_COMPANY_IDS = company;
    supabaseRequest.mockRejectedValueOnce(new Error("42703 column product_catalog.order_cutoff_time does not exist"));
    expect(await listProductOrderCutoffsForAdmin(company)).toBeNull();
    supabaseRequest.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(listProductOrderCutoffsForAdmin(company)).rejects.toThrow("database unavailable");
  });

  it("keeps the legacy product update free of cutoff columns", async () => {
    supabaseRequest.mockResolvedValueOnce([row]).mockResolvedValueOnce([row]);
    await updateProductCatalogForAdmin(company, id, input, { name: "합성 관리자" }, true);
    expect(JSON.parse(supabaseRequest.mock.calls[1][1].body)).not.toHaveProperty("order_cutoff_days_before");
  });

  it("rejects an incomplete editor cutoff before writing", async () => {
    await expect(updateProductCatalogForAdmin(company, id, { ...input, orderCutoffDaysBefore: 1 }, { name: "합성 관리자" }, true)).rejects.toThrow("함께");
    expect(supabaseRequest).not.toHaveBeenCalled();
  });

  it("writes the paired cutoff for one item and the selected company items only", async () => {
    supabaseRequest.mockResolvedValueOnce([row]).mockResolvedValueOnce([row]);
    await updateProductCatalogForAdmin(company, id, { ...input, orderCutoffDaysBefore: 0, orderCutoffTime: "12:00" }, { name: "합성 관리자" }, true);
    expect(JSON.parse(supabaseRequest.mock.calls[1][1].body)).toMatchObject({ order_cutoff_days_before: 0, order_cutoff_time: "12:00" });
    supabaseRequest.mockResolvedValueOnce([{ id }]);
    expect(await updateProductOrderCutoffsForAdmin(company, [id], null, null)).toEqual([id]);
    expect(supabaseRequest.mock.calls[2][0]).toContain(`company_id=eq.${company}`);
    expect(JSON.parse(supabaseRequest.mock.calls[2][1].body)).toMatchObject({ order_cutoff_days_before: null, order_cutoff_time: null });
  });
});


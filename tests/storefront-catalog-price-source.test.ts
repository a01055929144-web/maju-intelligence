import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => vi.fn());
vi.mock("@/lib/store", () => ({ supabaseRequest: db }));
import { readStorefrontCatalogPage } from "../lib/pricing/storefront-catalog-read";

const company = "00000000-0000-4000-8000-000000000001", customer = "20000000-0000-4000-8000-000000000001";
const egg = "30000000-0000-4000-8000-000000000001", butter = "30000000-0000-4000-8000-000000000002", market = "30000000-0000-4000-8000-000000000003";
const product = (id: string, name: string, tax: string, mode = "fixed") => ({ id, canonical_name: name, purchase_product_name: null, sales_product_name: name, category: "식자재", brand_name: null,
  sales_spec: "", sales_unit: "EA", order_pricing_mode: mode, purchase_price_date: null, tax_type: tax });
const priced: Record<string, { price: number | null; includes_tax: boolean }> = {
  [egg]: { price: 5500, includes_tax: false }, [butter]: { price: 7535, includes_tax: true }, [market]: { price: null, includes_tax: false } };
let agreements: unknown[];

beforeEach(() => {
  vi.clearAllMocks(); agreements = [];
  db.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path.startsWith("product_catalog?")) return [product(egg, "계란", "exempt"), product(butter, "버터", "taxable"), product(market, "시세품목", "exempt", "market")];
    if (path === "rpc/self_order_price_v2") return [priced[JSON.parse(String(init?.body)).p_product]];
    if (path.startsWith("customer_price_agreements?")) return agreements;
    return [];
  });
});

describe("CX-148b: 화면 가격은 주문 저장과 같은 가격 함수(self_order_price_v2)에서만 나온다", () => {
  it("행사·단가표 가격과 세금 포함 표시를 그대로 싣고, 가격 계산은 따로 하지 않는다", async () => {
    const { lines } = await readStorefrontCatalogPage({ companyId: company, customerId: customer, marketPriceNotice: "" }, 1, "");
    expect(lines.find(line => line.productId === egg)?.price).toBe(5500);
    const butterLine = lines.find(line => line.productId === butter)!;
    expect(butterLine.price).toBe(7535);
    expect(butterLine.priceIncludesTax).toBe(true);
    expect(lines.find(line => line.productId === egg)).not.toHaveProperty("priceIncludesTax");
    const calls = db.mock.calls.map(call => String(call[0]));
    expect(calls).toContain("rpc/self_order_price_v2");
    expect(calls.some(path => path.includes("margin_template_price_v1") || path.startsWith("pricing_p0_effective"))).toBe(false);
    const body = JSON.parse(String(db.mock.calls.find(call => call[0] === "rpc/self_order_price_v2")![1].body));
    expect(body).toMatchObject({ p_company: company, p_customer: customer, p_include_promise: true });
  });

  it("시세 품목은 가격 없음, 매장 계약가(price-search)는 계속 우선", async () => {
    const plain = await readStorefrontCatalogPage({ companyId: company, customerId: customer, marketPriceNotice: "" }, 1, "");
    expect(plain.lines.find(line => line.productId === market)?.price).toBeNull();
    agreements = [{ product_catalog_id: egg, sales_unit: "EA", unit_price: 5000 }];
    const search = await readStorefrontCatalogPage({ companyId: company, customerId: customer, marketPriceNotice: "" }, 1, "", true);
    expect(search.lines.find(line => line.productId === egg)?.price).toBe(5000);
    expect(search.lines.find(line => line.productId === butter)?.price).toBe(7535);
  });

  it("일반 화면은 가격 함수 오류를 가격 없음으로, 가격 검색은 오류를 올린다", async () => {
    db.mockImplementation(async (path: string) => {
      if (path.startsWith("product_catalog?")) return [product(egg, "계란", "exempt")];
      if (path === "rpc/self_order_price_v2") throw new Error("rpc failed");
      return [];
    });
    const plain = await readStorefrontCatalogPage({ companyId: company, customerId: customer, marketPriceNotice: "" }, 1, "");
    expect(plain.lines[0].price).toBeNull();
    await expect(readStorefrontCatalogPage({ companyId: company, customerId: customer, marketPriceNotice: "" }, 1, "", true)).rejects.toThrow("rpc failed");
  });
});

describe("CX-149: 받은 단가표 품목만(receivedOnly) — 상품 조회 단계에서 거르고 가격은 같은 함수", () => {
  const store = { companyId: company, customerId: customer, marketPriceNotice: "" };
  it("받은 품목 id만 product_catalog 조회에 넣고 행사 배지·기한을 싣는다(가격은 self_order_price_v2)", async () => {
    db.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "rpc/received_document_products_v1") return [{ product_id: egg, badge: "행사", ends_on: "2026-11-30" }, { product_id: butter, badge: "", ends_on: null }];
      if (path.startsWith("product_catalog?")) return [product(egg, "계란", "exempt"), product(butter, "버터", "taxable")];
      if (path === "rpc/self_order_price_v2") return [priced[JSON.parse(String(init?.body)).p_product]];
      return [];
    });
    const { lines } = await readStorefrontCatalogPage(store, 1, "", false, true);
    const productQuery = String(db.mock.calls.find(call => String(call[0]).startsWith("product_catalog?"))![0]);
    expect(productQuery).toContain(`id=in.(${egg},${butter})`);
    expect(lines.find(line => line.productId === egg)).toMatchObject({ price: 5500, badge: "행사", endsOn: "2026-11-30" });
    expect(lines.find(line => line.productId === butter)).not.toHaveProperty("badge");
    expect(lines.find(line => line.productId === butter)?.price).toBe(7535);
    const rpc = db.mock.calls.find(call => call[0] === "rpc/received_document_products_v1")!;
    expect(JSON.parse(String(rpc[1].body))).toMatchObject({ p_company: company, p_customer: customer });
  });
  it("받은 단가표가 없으면 빈 목록이고 상품·가격 조회를 하지 않는다", async () => {
    db.mockImplementation(async (path: string) => (path === "rpc/received_document_products_v1" ? [] : [product(egg, "계란", "exempt")]));
    const page = await readStorefrontCatalogPage(store, 1, "", false, true);
    expect(page).toMatchObject({ lines: [], hasMore: false, page: 1 });
    expect(db.mock.calls.map(call => String(call[0]))).toEqual(["rpc/received_document_products_v1"]);
  });
  it("receivedOnly가 아니면 받은 품목 함수를 부르지 않는다(전체 상품 그대로)", async () => {
    await readStorefrontCatalogPage(store, 1, "");
    expect(db.mock.calls.some(call => call[0] === "rpc/received_document_products_v1")).toBe(false);
    expect(String(db.mock.calls.find(call => String(call[0]).startsWith("product_catalog?"))![0])).not.toContain("id=in.");
  });
});

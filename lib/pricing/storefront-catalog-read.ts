import { koreaDay } from "@/domains/pricing/document";
import { priceOrNull, todayBaseOnly, type CatalogLine } from "@/domains/pricing/storefront-catalog";
import { supabaseRequest } from "@/lib/store";

const PAGE = 50;
type Product = { id: string; canonical_name: string | null; purchase_product_name: string | null; sales_product_name: string | null; category: string | null; brand_name: string | null; sales_spec: string | null; sales_unit: string | null; order_pricing_mode: string | null; purchase_price_date: string | null; tax_type: string | null };
type Recent = { product_id: string; unit_price: number; document_date: string };

export async function readStorefrontCatalogPage(store: { companyId: string; customerId: string; marketPriceNotice: string }, page: number, q: string, priceSearch = false, receivedOnly = false) {
  const company = store.companyId, customer = store.customerId, today = koreaDay();
  // CX-149: 매장 홈 "받은 단가표 품목" 목록 — 받은 단가표에 있는 상품만 조회 단계에서 남긴다(가격은 아래에서 self_order_price_v2로만).
  // shortcut: id in (...)는 URL 길이 때문에 250개까지, 그보다 많은 단가표는 서버 쪽 페이지 함수로 옮길 때.
  const received = receivedOnly ? await supabaseRequest<Array<{ product_id: string; badge: string; ends_on: string | null }>>("rpc/received_document_products_v1", {
    method: "POST", body: JSON.stringify({ p_company: company, p_customer: customer, p_date: today }) }) : [];
  if (receivedOnly && !received.length) return { lines: [] as CatalogLine[], page, hasMore: false, marketPriceNotice: store.marketPriceNotice };
  const receivedBy = new Map(received.slice(0, 250).map(row => [row.product_id, row]));
  const filter = `company_id=eq.${company}&is_active=is.true${receivedOnly ? `&id=in.(${Array.from(receivedBy.keys()).join(",")})` : ""}${q ? `&or=(${["canonical_name", "sales_product_name", "purchase_product_name", ...(priceSearch ? ["sales_spec"] : [])].map((column) => `${column}.ilike.*${encodeURIComponent(q)}*`).join(",")})` : ""}`;
  const products = await supabaseRequest<Product[]>(`product_catalog?select=id,canonical_name,purchase_product_name,sales_product_name,category,brand_name,sales_spec,sales_unit,order_pricing_mode,purchase_price_date,tax_type&${filter}&order=category,canonical_name,id&limit=${PAGE + 1}&offset=${(page - 1) * PAGE}`);
  const hasMore = products.length > PAGE;
  const shown = products.slice(0, PAGE);
  const ids = shown.map(p => p.id).join(",");
  const agreements = priceSearch && ids ? await supabaseRequest<Array<{ product_catalog_id: string; sales_unit: string; unit_price: number }>>(
    `customer_price_agreements?company_id=eq.${company}&customer_id=eq.${customer}&product_catalog_id=in.(${ids})&status=eq.active` +
    `&effective_from=lte.${today}&or=(effective_until.is.null,effective_until.gte.${today})` +
    "&select=product_catalog_id,sales_unit,unit_price&order=effective_from.desc,id.desc",
  ) : [];
  const prices = await Promise.all(shown.map(async p => {
    const contract = p.order_pricing_mode !== "market" && agreements.find(row => row.product_catalog_id === p.id && row.sales_unit === p.sales_unit);
    if (contract) return { price: priceOrNull(contract.unit_price), includesTax: false };
    try {
      // CX-148b: 주문 저장과 같은 가격 함수(받은 단가표 → 카탈로그 → 기본가). 화면 가격과 주문 가격이 갈라지지 않게 여기서 따로 계산하지 않는다.
      const priced = await supabaseRequest<Array<{ price: number | null; includes_tax: boolean | null }>>("rpc/self_order_price_v2", {
        method: "POST", body: JSON.stringify({ p_company: company, p_customer: customer, p_product: p.id, p_date: today, p_include_promise: true }),
      });
      return { price: priceOrNull(priced[0]?.price), includesTax: priced[0]?.includes_tax === true };
    } catch (error) {
      if (priceSearch) throw error;
      return { price: null, includesTax: false };
    }
  }));
  const recentIds = shown.filter((p, index) => p.order_pricing_mode === "market" || (priceSearch && prices[index].price === null)).map(p => p.id);
  const recent = recentIds.length ? await supabaseRequest<Recent[]>("rpc/store_recent_dispatch_prices", { method: "POST", body: JSON.stringify({ p_company: company, p_customer: customer, p_products: recentIds }) }) : [];
  const recentBy = new Map(recent.map((r) => [r.product_id, r]));
  const lines: CatalogLine[] = shown.map((p, index) => {
    const isMarket = p.order_pricing_mode === "market";
    const price = prices[index].price;
    const last = recentBy.get(p.id);
    return {
      productId: p.id, name: (p.sales_product_name || p.canonical_name || p.purchase_product_name || "").trim(), category: (p.category ?? "").split(">")[0].trim() || "미분류", brand: p.brand_name ?? "", spec: p.sales_spec ?? "", unit: p.sales_unit ?? "", isMarket, taxType: p.tax_type === "exempt" ? "exempt" as const : "taxable" as const,
      price: isMarket ? null : price,
      ...(receivedBy.get(p.id)?.badge ? { badge: receivedBy.get(p.id)!.badge, ...(receivedBy.get(p.id)!.ends_on ? { endsOn: receivedBy.get(p.id)!.ends_on! } : {}) } : {}),
      ...(!isMarket && prices[index].includesTax && p.tax_type === "taxable" ? { priceIncludesTax: true } : {}),
      todayBasePrice: isMarket ? todayBaseOnly(p.purchase_price_date, today, price) : null,
      lastDispatch: last ? { price: last.unit_price, date: last.document_date } : null,
    };
  });
  return { lines, page, hasMore, marketPriceNotice: store.marketPriceNotice };
}

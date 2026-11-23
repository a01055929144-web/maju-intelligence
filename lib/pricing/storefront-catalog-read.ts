import { koreaDay } from "@/domains/pricing/document";
import { priceOrNull, todayBaseOnly, type CatalogLine } from "@/domains/pricing/storefront-catalog";
import { supabaseRequest } from "@/lib/store";

const PAGE = 50;
type Product = { id: string; canonical_name: string | null; purchase_product_name: string | null; sales_product_name: string | null; category: string | null; brand_name: string | null; sales_spec: string | null; sales_unit: string | null; order_pricing_mode: string | null; purchase_price_date: string | null; tax_type: string | null };
type Recent = { product_id: string; unit_price: number; document_date: string };

export async function readStorefrontCatalogPage(store: { companyId: string; customerId: string; marketPriceNotice: string }, page: number, q: string, priceSearch = false) {
  const company = store.companyId, customer = store.customerId, today = koreaDay();
  const filter = `company_id=eq.${company}&is_active=is.true${q ? `&or=(${["canonical_name", "sales_product_name", "purchase_product_name", ...(priceSearch ? ["sales_spec"] : [])].map((column) => `${column}.ilike.*${encodeURIComponent(q)}*`).join(",")})` : ""}`;
  const products = await supabaseRequest<Product[]>(`product_catalog?select=id,canonical_name,purchase_product_name,sales_product_name,category,brand_name,sales_spec,sales_unit,order_pricing_mode,purchase_price_date,tax_type&${filter}&order=category,canonical_name,id&limit=${PAGE + 1}&offset=${(page - 1) * PAGE}`);
  const hasMore = products.length > PAGE;
  const shown = products.slice(0, PAGE);
  const ids = shown.map(p => p.id).join(",");
  const [agreements, basePrices] = priceSearch && ids ? await Promise.all([
    supabaseRequest<Array<{ product_catalog_id: string; sales_unit: string; unit_price: number }>>(
      `customer_price_agreements?company_id=eq.${company}&customer_id=eq.${customer}&product_catalog_id=in.(${ids})&status=eq.active` +
      `&effective_from=lte.${today}&or=(effective_until.is.null,effective_until.gte.${today})` +
      "&select=product_catalog_id,sales_unit,unit_price&order=effective_from.desc,id.desc",
    ),
    supabaseRequest<Array<{ product_id: string; price: number }>>(
      `pricing_p0_effective?company_id=eq.${company}&product_id=in.(${ids})&select=product_id,price`,
    ),
  ]) : [[], []];
  const baseByProduct = new Map(basePrices.map(row => [row.product_id, row.price]));
  const prices = await Promise.all(shown.map(async p => {
    const contract = p.order_pricing_mode !== "market" && agreements.find(row => row.product_catalog_id === p.id && row.sales_unit === p.sales_unit);
    if (contract) return priceOrNull(contract.unit_price);
    try {
      const grade = await supabaseRequest<number | null>("rpc/margin_template_price_v1", {
        method: "POST", body: JSON.stringify({ p_company: company, p_customer: customer, p_product: p.id }),
      });
      return priceOrNull(grade) ?? priceOrNull(baseByProduct.get(p.id));
    } catch (error) {
      if (priceSearch) throw error;
      return null;
    }
  }));
  const recentIds = shown.filter((p, index) => p.order_pricing_mode === "market" || (priceSearch && prices[index] === null)).map(p => p.id);
  const recent = recentIds.length ? await supabaseRequest<Recent[]>("rpc/store_recent_dispatch_prices", { method: "POST", body: JSON.stringify({ p_company: company, p_customer: customer, p_products: recentIds }) }) : [];
  const recentBy = new Map(recent.map((r) => [r.product_id, r]));
  const lines: CatalogLine[] = shown.map((p, index) => {
    const isMarket = p.order_pricing_mode === "market";
    const price = prices[index];
    const last = recentBy.get(p.id);
    return {
      productId: p.id, name: (p.sales_product_name || p.canonical_name || p.purchase_product_name || "").trim(), category: (p.category ?? "").split(">")[0].trim() || "미분류", brand: p.brand_name ?? "", spec: p.sales_spec ?? "", unit: p.sales_unit ?? "", isMarket, taxType: p.tax_type === "exempt" ? "exempt" as const : "taxable" as const,
      price: isMarket ? null : price,
      todayBasePrice: isMarket ? todayBaseOnly(p.purchase_price_date, today, price) : null,
      lastDispatch: last ? { price: last.unit_price, date: last.document_date } : null,
    };
  });
  return { lines, page, hasMore, marketPriceNotice: store.marketPriceNotice };
}

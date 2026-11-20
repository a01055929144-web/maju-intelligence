import { koreaDay } from "@/domains/pricing/document";
import { pickDocumentPrice, type DocumentPriceSource } from "@/domains/pricing/document-price";
import { supabaseRequest } from "@/lib/store";

export type PriceExplanationOption = { id: string; name: string; detail: string };
export type PriceExplanationPromotion = { id: string; name: string; price: number; endsOn: string; badge: string };
export type PriceExplanation = {
  customer: PriceExplanationOption;
  product: PriceExplanationOption & { unit: string; market: boolean };
  current: { price: number; source: DocumentPriceSource } | null;
  agreement: { price: number; acceptedQuote: boolean } | null;
  gradePrice: number | null;
  basePrice: number | null;
  promotions: PriceExplanationPromotion[];
  date: string;
};

type CustomerRow = { id: string; customer_name: string | null; address: string | null };
type ProductRow = { id: string; canonical_name: string | null; purchase_product_name: string | null; sales_product_name: string | null; sales_spec: string | null; sales_unit: string | null; order_pricing_mode: string | null };
type PromotionRow = { id: string; display_name: string | null; name: string | null; price: number; ends_on: string; badge: string; stock: number | null };

const enc = encodeURIComponent;
const validId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const search = (value: string) => value.trim().slice(0, 80).replace(/[%*,()]/g, " ").trim();
const positive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
const productName = (row: ProductRow) => (row.sales_product_name || row.canonical_name || row.purchase_product_name || "이름 없는 상품").trim();

export async function searchPriceExplanationOptions(companyId: string, customerQuery: string, productQuery: string) {
  const cq = search(customerQuery), pq = search(productQuery);
  const [customers, products] = await Promise.all([
    cq ? supabaseRequest<CustomerRow[]>(`normalized_customers?select=id,customer_name,address&company_id=eq.${enc(companyId)}&duplicate_of=is.null&customer_name=ilike.*${enc(cq)}*&order=customer_name&limit=20`) : Promise.resolve([]),
    pq ? supabaseRequest<ProductRow[]>(`product_catalog?select=id,canonical_name,purchase_product_name,sales_product_name,sales_spec,sales_unit,order_pricing_mode&company_id=eq.${enc(companyId)}&is_active=eq.true&or=(canonical_name.ilike.*${enc(pq)}*,sales_product_name.ilike.*${enc(pq)}*,purchase_product_name.ilike.*${enc(pq)}*)&order=canonical_name,id&limit=20`) : Promise.resolve([]),
  ]);
  return {
    customers: customers.map(row => ({ id: row.id, name: row.customer_name?.trim() || "이름 없는 매장", detail: row.address?.trim() || "주소 정보 없음" })),
    products: products.map(row => ({ id: row.id, name: productName(row), detail: [row.sales_spec, row.sales_unit].filter(Boolean).join(" · ") || "규격 정보 없음" })),
  };
}

export async function readPriceExplanation(companyId: string, customerId: string, productId: string, date = koreaDay()): Promise<PriceExplanation | null> {
  if (!validId(customerId) || !validId(productId)) return null;
  const [[customer], [product]] = await Promise.all([
    supabaseRequest<CustomerRow[]>(`normalized_customers?select=id,customer_name,address&company_id=eq.${enc(companyId)}&id=eq.${enc(customerId)}&duplicate_of=is.null&limit=1`),
    supabaseRequest<ProductRow[]>(`product_catalog?select=id,canonical_name,purchase_product_name,sales_product_name,sales_spec,sales_unit,order_pricing_mode&company_id=eq.${enc(companyId)}&id=eq.${enc(productId)}&is_active=eq.true&limit=1`),
  ]);
  if (!customer || !product) return null;

  const customerOption = { id: customer.id, name: customer.customer_name?.trim() || "이름 없는 매장", detail: customer.address?.trim() || "주소 정보 없음" };
  const productOption = { id: product.id, name: productName(product), detail: [product.sales_spec, product.sales_unit].filter(Boolean).join(" · ") || "규격 정보 없음", unit: product.sales_unit?.trim() || "단위 미지정", market: product.order_pricing_mode === "market" };
  if (productOption.market) return { customer: customerOption, product: productOption, current: null, agreement: null, gradePrice: null, basePrice: null, promotions: [], date };

  const [agreements, gradeResult, baseRows, promotionRows] = await Promise.all([
    supabaseRequest<Array<{ unit_price: number; sales_unit: string; source_quote_id: string | null }>>(`customer_price_agreements?select=unit_price,sales_unit,source_quote_id&company_id=eq.${enc(companyId)}&customer_id=eq.${enc(customerId)}&product_catalog_id=eq.${enc(productId)}&status=eq.active&effective_from=lte.${date}&or=(effective_until.is.null,effective_until.gte.${date})&order=effective_from.desc,id.desc&limit=20`),
    supabaseRequest<number | null>("rpc/margin_template_price_v1", { method: "POST", body: JSON.stringify({ p_company: companyId, p_customer: customerId, p_product: productId }) }),
    supabaseRequest<Array<{ price: number }>>(`pricing_p0_effective?select=price&company_id=eq.${enc(companyId)}&product_id=eq.${enc(productId)}&limit=1`),
    supabaseRequest<PromotionRow[]>(`pricing_promotions?select=id,display_name,name,price,ends_on,badge,stock&company_id=eq.${enc(companyId)}&product_id=eq.${enc(productId)}&starts_on=lte.${date}&ends_on=gte.${date}&or=(stock.is.null,stock.gt.0)&order=ends_on,id&limit=20`),
  ]);
  const agreementRow = agreements.find(row => row.sales_unit === product.sales_unit && positive(row.unit_price) !== null);
  const agreement = agreementRow ? { price: Number(agreementRow.unit_price), acceptedQuote: Boolean(agreementRow.source_quote_id) } : null;
  const gradePrice = positive(gradeResult), basePrice = positive(baseRows[0]?.price);
  const applicable = await Promise.all(promotionRows.map(async row => ({ row, applies: await supabaseRequest<boolean>("rpc/promotion_applies_to", { method: "POST", body: JSON.stringify({ p_company: companyId, p_promotion: row.id, p_customer: customerId }) }) })));
  const promotions = applicable.filter(item => item.applies && positive(item.row.price) !== null).map(({ row }) => ({ id: row.id, name: (row.display_name || row.name || "행사").trim(), price: Number(row.price), endsOn: row.ends_on, badge: row.badge === "임박" ? "임박" : "행사" }));
  return {
    customer: customerOption,
    product: productOption,
    current: pickDocumentPrice({ store: agreement?.price, grade: gradePrice, base: basePrice }),
    agreement,
    gradePrice,
    basePrice,
    promotions,
    date,
  };
}

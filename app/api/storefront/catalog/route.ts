import { NextRequest, NextResponse } from "next/server";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { storeOrderingEnabled } from "@/lib/pricing/store-order-feature";
import { readStorefront } from "@/lib/pricing/storefront";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { koreaDay } from "@/domains/pricing/document";
import { priceOrNull, todayBaseOnly, type CatalogLine } from "@/domains/pricing/storefront-catalog";
import { supabaseRequest } from "@/lib/store";

export const dynamic = "force-dynamic";

// CC-36a: 매장 화면 "전체 상품"(읽기 전용, 주문은 36c). 매장은 받은 링크(토큰)로 들어오고, 회사·매장은 토큰에서 정한다.
// 가격은 서버 함수 margin_template_price_v1 결과만 쓴다(여기서 계산하지 않음). 스위치 STORE_CATALOG_LINK 기본 OFF.
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const PAGE = 50;
type Product = { id: string; canonical_name: string | null; purchase_product_name: string | null; sales_product_name: string | null; category: string | null; brand_name: string | null; sales_spec: string | null; sales_unit: string | null; order_pricing_mode: string | null; purchase_price_date: string | null; tax_type: string | null };
type Recent = { product_id: string; unit_price: number; document_date: string };

const unavailable = () => NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404, headers });
const sameOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  try { return Boolean(origin) && new URL(origin!).host.toLowerCase() === (request.headers.get("host") || request.nextUrl.host).toLowerCase(); } catch { return false; }
};

/** body: { token, page?, q? } */
export async function POST(request: NextRequest) {
  if (!priceSheetsEnabled() || !storeOrderingEnabled()) return unavailable();
  if (!sameOrigin(request)) return NextResponse.json({ message: "같은 화면에서 다시 시도해 주세요." }, { status: 403, headers });
  const body = await request.json().catch(() => null) as { token?: unknown; page?: unknown; q?: unknown } | null;
  if (!body || typeof body.token !== "string" || body.token.length > 200) return unavailable();
  const page = body.page === undefined ? 1 : Number(body.page);
  const q = typeof body.q === "string" ? body.q.trim().slice(0, 60).replace(/[%*,()]/g, " ") : "";
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000) return NextResponse.json({ message: "페이지를 확인해 주세요." }, { status: 400, headers });
  try {
    const store = await readStorefront(body.token);
    if (!store || !isFeatureEnabled("STORE_CATALOG_LINK", store.companyId)) return unavailable();
    const company = store.companyId, customer = store.customerId, today = koreaDay();
    const filter = `company_id=eq.${company}&is_active=is.true${q ? `&or=(${["canonical_name", "sales_product_name", "purchase_product_name"].map((column) => `${column}.ilike.*${encodeURIComponent(q)}*`).join(",")})` : ""}`;
    const products = await supabaseRequest<Product[]>(`product_catalog?select=id,canonical_name,purchase_product_name,sales_product_name,category,brand_name,sales_spec,sales_unit,order_pricing_mode,purchase_price_date,tax_type&${filter}&order=category,canonical_name&limit=${PAGE + 1}&offset=${(page - 1) * PAGE}`);
    const hasMore = products.length > PAGE;
    const shown = products.slice(0, PAGE);
    const marketIds = shown.filter((p) => p.order_pricing_mode === "market").map((p) => p.id);
    // 이 매장의 지난 출고가: 기존 서버 함수(이 매장·이 회사 것만). 다른 매장 가격은 읽지 않는다.
    const recent = marketIds.length ? await supabaseRequest<Recent[]>("rpc/store_recent_dispatch_prices", { method: "POST", body: JSON.stringify({ p_company: company, p_customer: customer, p_products: marketIds }) }) : [];
    const recentBy = new Map(recent.map((r) => [r.product_id, r]));
    const priceOf = (productId: string) => supabaseRequest<number | null>("rpc/margin_template_price_v1", { method: "POST", body: JSON.stringify({ p_company: company, p_customer: customer, p_product: productId }) }).then(priceOrNull).catch(() => null);
    const lines: CatalogLine[] = await Promise.all(shown.map(async (p) => {
      const isMarket = p.order_pricing_mode === "market";
      const price = await priceOf(p.id);
      const last = recentBy.get(p.id);
      return {
        productId: p.id, name: (p.sales_product_name || p.canonical_name || p.purchase_product_name || "").trim(), category: (p.category ?? "").split(">")[0].trim() || "미분류", brand: p.brand_name ?? "", spec: p.sales_spec ?? "", unit: p.sales_unit ?? "", isMarket, taxType: p.tax_type === "exempt" ? "exempt" as const : "taxable" as const,
        price: isMarket ? null : price,
        todayBasePrice: isMarket ? todayBaseOnly(p.purchase_price_date, today, price) : null,
        lastDispatch: isMarket && last ? { price: last.unit_price, date: last.document_date } : null,
      };
    }));
    return NextResponse.json({ lines, page, hasMore, marketPriceNotice: store.marketPriceNotice }, { headers });
  } catch (error) {
    console.error("storefront catalog failed", error);
    return NextResponse.json({ message: "전체 상품을 불러오지 못했습니다." }, { status: 500, headers });
  }
}

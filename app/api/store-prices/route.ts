import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "../../../lib/auth";
import { canManagePriceSheets } from "../../../domains/pricing/access";
import { isFeatureEnabled } from "../../../lib/feature-flags";
import { priceSheetsEnabled } from "../../../lib/pricing/feature";
import { supabaseRequest } from "../../../lib/store";
import { storePriceSource } from "../../../domains/pricing/store-price";
export const dynamic = "force-dynamic";

// CC-30b: 매장 가격 화면의 조회. customerId 없이 부르면 매장 목록(검색·"매장 가격 N개"), 주면 그 매장의 상품별 기본 판매가와 이 매장 가격.
// 쓰기는 POST /api/customers/[id]/contract-prices. 대표·관리자만.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const enc = encodeURIComponent;

export async function GET(request: NextRequest) {
  if (!priceSheetsEnabled()) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  const scope = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!scope.ok) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!scope.companyId || !isFeatureEnabled("PRICING", scope.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  if (!scopeHasCapability(scope, "manage_sales") || (scope.customerSession && !canManagePriceSheets(scope.customerSession))) return NextResponse.json({ message: "대표·관리자만 볼 수 있습니다." }, { status: 403 });
  const company = enc(scope.companyId), customerId = request.nextUrl.searchParams.get("customerId");
  try {
    if (!customerId) {
      const q = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 60).replace(/[%*,()]/g, " ");
      const stores = await supabaseRequest<Array<{ id: string; customer_name: string; margin_template_id: string | null }>>(`normalized_customers?select=id,customer_name,margin_template_id&company_id=eq.${company}&duplicate_of=is.null${q ? `&customer_name=ilike.*${enc(q)}*` : ""}&order=customer_name&limit=50`);
      const ids = stores.map((s) => s.id);
      const [agreements, templates] = await Promise.all([
        ids.length ? supabaseRequest<Array<{ customer_id: string }>>(`customer_price_agreements?select=customer_id&company_id=eq.${company}&status=eq.active&customer_id=in.(${ids.join(",")})&limit=5000`) : Promise.resolve([]),
        supabaseRequest<Array<{ id: string; name: string }>>(`margin_templates?select=id,name&company_id=eq.${company}&archived_at=is.null`).catch(() => []),
      ]);
      const count = new Map<string, number>();
      for (const row of agreements) count.set(row.customer_id, (count.get(row.customer_id) ?? 0) + 1);
      const grade = new Map(templates.map((t) => [t.id, t.name]));
      return NextResponse.json({ stores: stores.map((s) => ({ id: s.id, name: s.customer_name, grade: s.margin_template_id ? grade.get(s.margin_template_id) ?? null : null, priceCount: count.get(s.id) ?? 0 })) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!UUID.test(customerId)) return NextResponse.json({ message: "매장을 확인해 주세요." }, { status: 400 });
    const [products, agreements] = await Promise.all([
      supabaseRequest<Array<{ product_id: string; name: string; category: string; price: number }>>(`pricing_p0_effective?select=product_id,name,category,price&company_id=eq.${company}&active=eq.true&price=gt.0&order=name&limit=1000`),
      supabaseRequest<Array<{ product_catalog_id: string; unit_price: number; effective_from: string; source_quote_id: string | null }>>(`customer_price_agreements?select=product_catalog_id,unit_price,effective_from,source_quote_id&company_id=eq.${company}&customer_id=eq.${customerId}&status=eq.active`),
    ]);
    const byProduct = new Map(agreements.map((a) => [a.product_catalog_id, a]));
    return NextResponse.json({ rows: products.map((p) => { const a = byProduct.get(p.product_id); return { productId: p.product_id, name: p.name, category: p.category, basePrice: p.price, storePrice: a?.unit_price ?? null, since: a?.effective_from ?? null, source: storePriceSource(a ? { fromQuote: Boolean(a.source_quote_id) } : null) }; }) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "매장 가격을 불러오지 못했습니다." }, { status: 500 }); }
}

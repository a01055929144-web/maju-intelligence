import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { validateIndustryBasket, type IndustryBasketInput } from "@/domains/pricing/industry-basket";
import { industryBasketsEnabled } from "@/lib/pricing/industry-basket-feature";
import { supabaseRequest } from "@/lib/store";

export const dynamic = "force-dynamic";

async function scope(request: NextRequest) {
  const auth = await getRequestAuthScope(request);
  if (!auth.ok) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!industryBasketsEnabled(auth.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  if (!scopeHasCapability(auth, "manage_sales")) return NextResponse.json({ message: "업종별 기본 품목을 관리할 권한이 없습니다." }, { status: 403 });
  return auth;
}

export async function GET(request: NextRequest) {
  const auth = await scope(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const [products, rows] = await Promise.all([
      supabaseRequest<Array<{ id: string; product_code: string | null; canonical_name: string | null; purchase_product_name: string; sales_unit: string | null }>>(
        `product_catalog?company_id=eq.${encodeURIComponent(auth.companyId!)}&is_active=eq.true&select=id,product_code,canonical_name,purchase_product_name,sales_unit&order=updated_at.desc&limit=5000`,
      ),
      supabaseRequest<Array<{ industry_key: string; product_catalog_id: string; default_qty: number; is_core: boolean; sort_order: number }>>(
        `company_industry_baskets?company_id=eq.${encodeURIComponent(auth.companyId!)}&select=industry_key,product_catalog_id,default_qty,is_core,sort_order&order=industry_key,sort_order&limit=1000`,
      ),
    ]);
    return NextResponse.json({
      products: products.map((item) => ({ id: item.id, code: item.product_code, name: item.canonical_name || item.purchase_product_name, unit: item.sales_unit || "EA" })),
      rows: rows.map((item) => ({ industry: item.industry_key, productCatalogId: item.product_catalog_id, defaultQty: Number(item.default_qty), isCore: item.is_core, sortOrder: item.sort_order })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "업종별 기본 품목을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await scope(request);
  if (auth instanceof NextResponse) return auth;
  const memberId = auth.customerSession?.companyMemberId;
  if (!memberId) return NextResponse.json({ message: "회사 구성원 정보를 확인해 주세요." }, { status: 403 });
  try {
    const body = await request.json() as { industry?: string; rows?: IndustryBasketInput[] };
    const industry = typeof body.industry === "string" ? body.industry : "";
    const rows = validateIndustryBasket(industry, Array.isArray(body.rows) ? body.rows : []);
    const company = auth.companyId!;
    const existing = await supabaseRequest<Array<{ product_catalog_id: string }>>(
      `company_industry_baskets?company_id=eq.${encodeURIComponent(company)}&industry_key=eq.${encodeURIComponent(industry)}&select=product_catalog_id&limit=1000`,
    );
    if (rows.length) await supabaseRequest("company_industry_baskets?on_conflict=company_id,industry_key,product_catalog_id", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.map((row) => ({ company_id: company, industry_key: industry, product_catalog_id: row.productCatalogId, default_qty: row.defaultQty, is_core: row.isCore, sort_order: row.sortOrder, updated_by: memberId, updated_at: new Date().toISOString() }))),
    });
    const keep = new Set(rows.map((row) => row.productCatalogId));
    const removed = existing.filter((item) => !keep.has(item.product_catalog_id)).map((item) => item.product_catalog_id);
    if (removed.length) await supabaseRequest(`company_industry_baskets?company_id=eq.${encodeURIComponent(company)}&industry_key=eq.${encodeURIComponent(industry)}&product_catalog_id=in.(${removed.join(",")})`, { method: "DELETE" });
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error && !error.message.startsWith("Supabase") ? error.message : "업종별 기본 품목을 저장하지 못했습니다." }, { status: 400 });
  }
}

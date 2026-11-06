import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { supabaseRequest } from "@/lib/store";
import { categoryOptions, suggestCategory } from "@/domains/pricing/product-category";

export const dynamic = "force-dynamic";

type Row = { id: string; product_code: string | null; canonical_name: string | null; purchase_product_name: string | null; sales_spec: string | null; sales_unit: string | null; category: string | null };
const PAGE_SIZE = 1000;

async function listRows(companyId: string) {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await supabaseRequest<Row[]>(
      `product_catalog?select=id,product_code,canonical_name,purchase_product_name,sales_spec,sales_unit,category&company_id=eq.${encodeURIComponent(companyId)}&is_active=eq.true&order=product_code.asc.nullslast,id.asc&limit=${PAGE_SIZE}&offset=${offset}`
    );
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

/** 11/4: 품목 그룹(카테고리) 정리 화면용 — 활성 상품의 현재 카테고리와 MAJU 추천을 함께 내려줍니다. 저장은 /api/price-sheets/products PATCH(category). */
export async function GET(request: NextRequest) {
  if (!priceSheetsEnabled()) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  const auth = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!auth.ok || !auth.companyId) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!isFeatureEnabled("PRICING", auth.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  if (!scopeHasCapability(auth, "manage_sales")) return NextResponse.json({ message: "상품 원장을 관리할 권한이 없습니다." }, { status: 403 });
  if (auth.customerSession && !canManagePriceSheets(auth.customerSession)) return NextResponse.json({ message: "대표·관리자 권한이 필요합니다." }, { status: 403 });
  try {
    const rows = await listRows(auth.companyId);
    const items = rows.map((row) => {
      const name = (row.canonical_name || row.purchase_product_name || "").trim();
      const spec = row.sales_spec || "";
      return { id: row.id, code: row.product_code || "", name, spec, unit: row.sales_unit || "", category: (row.category || "").trim(), suggestion: suggestCategory(name, spec) };
    });
    return NextResponse.json({ items, options: categoryOptions(items.map((item) => item.category).filter(Boolean)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Product categories failed", error);
    return NextResponse.json({ message: "상품 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

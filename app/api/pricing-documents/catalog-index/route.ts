import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "../../../../lib/auth";
import { isFeatureEnabled } from "../../../../lib/feature-flags";
import { priceSheetsEnabled } from "../../../../lib/pricing/feature";
import { canManagePriceSheets } from "../../../../domains/pricing/access";
import { supabaseRequest } from "../../../../lib/store";
import { catalogDisplaySpec } from "../../../../domains/pricing/document";

export const dynamic = "force-dynamic";

type Row = { id: string; product_code: string | null; canonical_name: string | null; purchase_product_name: string | null; sales_product_name: string | null; sales_spec: string | null; spec_value: number | null; spec_unit: string | null; sales_unit: string | null };

/**
 * 11/4: 단가표·견적서 왼쪽 상품 목록의 빠른 필터(코드·상품명·규격·단위)용 가벼운 목록. 가격은 담지 않습니다
 * (가격은 기존 catalog 조회로 보이는 줄만 가져옴). 영업 담당은 노출 상품명이 있는 상품만, 노출 상품명으로 봅니다.
 */
export async function GET(request: NextRequest) {
  if (!priceSheetsEnabled()) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  const auth = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!auth.ok) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!auth.companyId || !isFeatureEnabled("PRICING", auth.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  const manager = !auth.customerSession || canManagePriceSheets(auth.customerSession);
  if (!manager && auth.customerSession?.workspaceRole !== "sales") return NextResponse.json({ message: "문서 작성 권한이 없습니다." }, { status: 403 });
  try {
    const rows = await supabaseRequest<Row[]>(
      `product_catalog?select=id,product_code,canonical_name,purchase_product_name,sales_product_name,sales_spec,spec_value,spec_unit,sales_unit&company_id=eq.${encodeURIComponent(auth.companyId)}&is_active=eq.true&order=product_code.asc.nullslast&limit=5000`
    );
    const items = rows.flatMap((row) => {
      const sales = (row.sales_product_name || "").trim();
      if (!manager && !sales) return [];
      const name = manager ? (row.canonical_name || row.purchase_product_name || sales || "").trim() : sales;
      return [{ id: row.id, code: row.product_code || "", name, displayName: sales, spec: catalogDisplaySpec(row), unit: row.sales_unit || "" }];
    });
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Pricing catalog index failed", error);
    return NextResponse.json({ message: "상품 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

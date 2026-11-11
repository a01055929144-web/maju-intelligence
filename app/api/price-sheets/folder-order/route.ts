import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "../../../../lib/auth";
import { priceSheetsEnabled } from "../../../../lib/pricing/feature";
import { isFeatureEnabled } from "../../../../lib/feature-flags";
import { supabaseRequest } from "../../../../lib/store";
export const dynamic = "force-dynamic";

// CC-26: 회사별 폴더 순서(읽기). 상품관리·마진 설정·문서·행사 화면이 같은 순서로 분류를 보여 주려고 읽는다.
// 읽기만 하므로 매출 권한이면 충분(순서 바꾸기는 대표·관리자용 별도 경로).
export async function GET(request: NextRequest) {
  if (!priceSheetsEnabled()) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  const scope = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!scope.ok) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!scope.companyId || !isFeatureEnabled("PRICING", scope.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "권한이 없습니다." }, { status: 403 });
  try {
    const rows = await supabaseRequest<Array<{ path: string; sort_order: number }>>(`product_category_folders?select=path,sort_order&company_id=eq.${encodeURIComponent(scope.companyId)}&order=sort_order&limit=5000`);
    return NextResponse.json({ folders: rows.map((row) => ({ path: row.path, sortOrder: row.sort_order })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("folder order read failed", error);
    // 순서 테이블이 없거나 읽지 못해도 화면은 이름순으로 계속 동작해야 한다.
    return NextResponse.json({ folders: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}

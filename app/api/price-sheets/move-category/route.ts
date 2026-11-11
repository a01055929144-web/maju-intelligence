import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "../../../../lib/auth";
import { canManagePriceSheets } from "../../../../domains/pricing/access";
import { priceSheetsEnabled } from "../../../../lib/pricing/feature";
import { isFeatureEnabled } from "../../../../lib/feature-flags";
import { supabaseRequest } from "../../../../lib/store";
export const dynamic = "force-dynamic";

// CC-17: 폴더(분류) 이름 바꾸기·이동. 상품 분류와 마진 연결이 DB 함수 한 번(한 트랜잭션)으로 같이 바뀐다. 판매가 재계산은 화면이 이어서 호출.
export async function POST(request: NextRequest) {
  if (!priceSheetsEnabled()) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  const body = await request.json().catch(() => null) as { companyId?: string; from?: string; to?: string } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!scope.companyId || !isFeatureEnabled("PRICING", scope.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "마진 설정 권한이 없습니다." }, { status: 403 });
  if (scope.customerSession && !canManagePriceSheets(scope.customerSession)) return NextResponse.json({ message: "대표·관리자 권한이 필요합니다." }, { status: 403 });
  const from = String(body?.from ?? "").trim(), to = String(body?.to ?? "").trim();
  if (!from || !to || from.length > 100 || to.length > 100) return NextResponse.json({ message: "옮길 폴더와 새 경로를 입력해 주세요(100자 이하)." }, { status: 400 });
  try {
    const result = await supabaseRequest<{ productCount: number; from: string; to: string }>("rpc/move_product_category", { method: "POST", body: JSON.stringify({ p_company: scope.companyId, p_from: from, p_to: to, p_actor: scope.customerSession?.userId || null }) });
    return NextResponse.json(result);
  } catch (error) {
    const text = error instanceof Error ? error.message : "";
    if (text.includes("cc17_cannot_move_into_itself")) return NextResponse.json({ message: "폴더를 자기 하위로 옮길 수 없습니다." }, { status: 400 });
    if (text.includes("cc17_invalid_path")) return NextResponse.json({ message: "경로를 확인해 주세요." }, { status: 400 });
    console.error("CC-17 folder move failed", error);
    return NextResponse.json({ message: "폴더를 옮기지 못했습니다. 아무것도 바뀌지 않았습니다. 다시 시도해 주세요." }, { status: 409 });
  }
}

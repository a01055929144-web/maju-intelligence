import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "../../../../lib/auth";
import { canManagePriceSheets } from "../../../../domains/pricing/access";
import { priceSheetsEnabled } from "../../../../lib/pricing/feature";
import { isFeatureEnabled } from "../../../../lib/feature-flags";
import { supabaseRequest } from "../../../../lib/store";
export const dynamic = "force-dynamic";

// CC-26: 폴더 순서 바꾸기. 같은 부모 안에서 `before` 폴더 앞으로(없으면 맨 끝으로) 옮긴다. DB 함수 한 번(한 트랜잭션)이 형제 순서를 다시 매긴다.
export async function POST(request: NextRequest) {
  if (!priceSheetsEnabled()) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  const body = await request.json().catch(() => null) as { companyId?: string; path?: string; before?: string | null } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!scope.companyId || !isFeatureEnabled("PRICING", scope.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  if (!scopeHasCapability(scope, "manage_sales")) return NextResponse.json({ message: "마진 설정 권한이 없습니다." }, { status: 403 });
  if (scope.customerSession && !canManagePriceSheets(scope.customerSession)) return NextResponse.json({ message: "대표·관리자 권한이 필요합니다." }, { status: 403 });
  const path = String(body?.path ?? "").trim(), before = String(body?.before ?? "").trim();
  if (!path || path.length > 100 || before.length > 100) return NextResponse.json({ message: "옮길 폴더를 확인해 주세요(100자 이하)." }, { status: 400 });
  try {
    const result = await supabaseRequest<{ path: string; changed: boolean }>("rpc/reorder_product_category_folder", { method: "POST", body: JSON.stringify({ p_company: scope.companyId, p_path: path, p_before: before || null }) });
    return NextResponse.json(result);
  } catch (error) {
    const text = error instanceof Error ? error.message : "";
    if (text.includes("cc26a_not_siblings")) return NextResponse.json({ message: "같은 상위 폴더 안에서만 순서를 바꿀 수 있습니다." }, { status: 400 });
    if (text.includes("cc26a_invalid_path")) return NextResponse.json({ message: "경로를 확인해 주세요." }, { status: 400 });
    console.error("CC-26 folder reorder failed", error);
    return NextResponse.json({ message: "순서를 바꾸지 못했습니다. 아무것도 바뀌지 않았습니다. 다시 시도해 주세요." }, { status: 409 });
  }
}

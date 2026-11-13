import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "./auth";
import { isFeatureEnabled } from "./feature-flags";

/** CC-21/23 공통 문 지기: 로그인 + 리드 관리 권한 + DISTRIBUTOR_SALES를 켠 회사만(꺼져 있으면 404, 권한 없으면 403). */
export async function distributorGate(request: NextRequest, companyId?: string) {
  const scope = await getRequestAuthScope(request, companyId);
  if (!scope.ok) return { error: NextResponse.json({ message: "Unauthorized" }, { status: 401 }) };
  if (!scopeHasCapability(scope, "manage_customers")) return { error: NextResponse.json({ message: "유통사 리드를 관리할 권한이 없습니다." }, { status: 403 }) };
  if (!isFeatureEnabled("DISTRIBUTOR_SALES", scope.companyId)) return { error: NextResponse.json({ message: "준비 중인 기능입니다." }, { status: 404 }) };
  return { scope, companyId: scope.companyId! };
}

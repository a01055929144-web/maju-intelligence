import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "../auth";
import { canManagePriceSheets } from "../../domains/pricing/access";
import { priceSheetsEnabled } from "./feature";
import { isFeatureEnabled } from "../feature-flags";

/** CC-32c: PRICING + STORE_GRADES(기본 OFF, 회사 allowlist)를 켠 회사의 대표·관리자만. SQL은 11/13 운영 적용 완료. */
export async function storeGradeGate(request: NextRequest, companyId: string | undefined) {
  const off = { error: NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 }) };
  if (!priceSheetsEnabled()) return off;
  const scope = await getRequestAuthScope(request, companyId);
  if (!scope.ok) return { error: NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 }) };
  if (!scope.companyId || !isFeatureEnabled("PRICING", scope.companyId) || !isFeatureEnabled("STORE_GRADES", scope.companyId)) return off;
  if (!scopeHasCapability(scope, "manage_sales") || (scope.customerSession && !canManagePriceSheets(scope.customerSession))) return { error: NextResponse.json({ message: "대표·관리자 권한이 필요합니다." }, { status: 403 }) };
  return { companyId: scope.companyId };
}

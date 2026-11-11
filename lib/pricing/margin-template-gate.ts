import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "../auth";
import { canManagePriceSheets } from "../../domains/pricing/access";
import { priceSheetsEnabled } from "./feature";
import { isFeatureEnabled } from "../feature-flags";

/** CC-19b/c 공통 문 지기: PRICING + MARGIN_TEMPLATES를 켠 회사, manage_sales 권한. managerOnly면 대표·관리자만(템플릿 편집), 아니면 영업도(문서에서 고르기). */
export async function marginTemplateGate(request: NextRequest, companyId: string | undefined, managerOnly: boolean) {
  const off = { error: NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 }) };
  if (!priceSheetsEnabled()) return off;
  const scope = await getRequestAuthScope(request, companyId);
  if (!scope.ok) return { error: NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 }) };
  if (!scope.companyId || !isFeatureEnabled("PRICING", scope.companyId) || !isFeatureEnabled("MARGIN_TEMPLATES", scope.companyId)) return off;
  if (!scopeHasCapability(scope, "manage_sales") || (managerOnly && scope.customerSession && !canManagePriceSheets(scope.customerSession))) return { error: NextResponse.json({ message: "대표·관리자 권한이 필요합니다." }, { status: 403 }) };
  return { companyId: scope.companyId, userId: scope.customerSession?.userId || null };
}

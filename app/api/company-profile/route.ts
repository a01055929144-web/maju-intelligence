import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { getCompanyProfile, saveCompanyBusinessNumber, saveCompanyProfile, syncDeliveryRegionsToSalesAreas } from "@/lib/company-profile-store";
import { getAppUserMobilePhone } from "@/lib/store";
import { redactCompanyProfile, sanitizeCompanyProfilePatch } from "@/domains/organization/company-profile";
import { isValidBusinessRegistrationNumber } from "@/lib/business-number";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const isAdmin = scope.role === "admin";
  const canEditLocked = isAdmin || scope.customerSession?.workspaceRole === "owner";
  const record = await getCompanyProfile(scope.companyId, { includeLockedFiles: canEditLocked });
  return NextResponse.json({
    ...record,
    canEdit: isAdmin || scopeHasCapability(scope, "manage_company"),
    canEditLocked,
    isAdmin,
    suggestedMainPhone: !record.values.main_phone && scope.customerSession?.userId ? await getAppUserMobilePhone(scope.customerSession.userId) : "",
    values: redactCompanyProfile(record.values, isAdmin)
  });
}

export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; businessRegistrationNumber?: string; values?: Record<string, unknown> } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const isAdmin = scope.role === "admin";
  if (!isAdmin && !scopeHasCapability(scope, "manage_company")) return NextResponse.json({ message: "회사 정보를 바꿀 권한이 없습니다." }, { status: 403 });
  const canEditLocked = isAdmin || scope.customerSession?.workspaceRole === "owner";
  if (body?.businessRegistrationNumber !== undefined && !canEditLocked) return NextResponse.json({ message: "사업자등록번호는 대표만 바꿀 수 있습니다." }, { status: 403 });
  if (body?.businessRegistrationNumber !== undefined && typeof body.businessRegistrationNumber !== "string") return NextResponse.json({ message: "사업자등록번호를 확인해 주세요." }, { status: 400 });
  if (body?.businessRegistrationNumber !== undefined && !isValidBusinessRegistrationNumber(body.businessRegistrationNumber)) return NextResponse.json({ message: "사업자등록번호 10자리와 검증번호를 확인해 주세요." }, { status: 400 });
  const { patch, error } = sanitizeCompanyProfilePatch(body?.values || {}, isAdmin, canEditLocked);
  if (error) return NextResponse.json({ message: error }, { status: 400 });
  const actor = scope.customerSession?.name || scope.adminSession?.name || "관리자";
  try {
    await saveCompanyProfile(scope.companyId, patch, actor);
  } catch {
    return NextResponse.json({ message: "회사 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  }
  if (body?.businessRegistrationNumber !== undefined) {
    try { await saveCompanyBusinessNumber(scope.companyId, body.businessRegistrationNumber); }
    catch (error) { return NextResponse.json({ message: `다른 회사 정보는 저장됐지만 사업자등록번호는 저장되지 않았습니다. ${error instanceof Error ? error.message : "다시 시도해 주세요."}` }, { status: 400 }); }
  }
  const regionSync = Array.isArray(patch.delivery_regions)
    ? await syncDeliveryRegionsToSalesAreas(scope.companyId, patch.delivery_regions as string[]).catch(() => ({ added: [], skipped: [] }))
    : { added: [], skipped: [] };
  const record = await getCompanyProfile(scope.companyId, { includeLockedFiles: canEditLocked });
  return NextResponse.json({ ...record, canEdit: true, canEditLocked, isAdmin, regionSync, values: redactCompanyProfile(record.values, isAdmin) });
}

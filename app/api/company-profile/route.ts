import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { getCompanyProfile, saveCompanyProfile } from "@/lib/company-profile-store";
import { redactCompanyProfile, sanitizeCompanyProfilePatch } from "@/domains/organization/company-profile";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const isAdmin = scope.role === "admin";
  const record = await getCompanyProfile(scope.companyId);
  return NextResponse.json({
    ...record,
    canEdit: isAdmin || scopeHasCapability(scope, "manage_company"),
    isAdmin,
    values: redactCompanyProfile(record.values, isAdmin)
  });
}

export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; values?: Record<string, unknown> } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const isAdmin = scope.role === "admin";
  if (!isAdmin && !scopeHasCapability(scope, "manage_company")) return NextResponse.json({ message: "회사 정보를 바꿀 권한이 없습니다." }, { status: 403 });
  const { patch, error } = sanitizeCompanyProfilePatch(body?.values || {}, isAdmin);
  if (error) return NextResponse.json({ message: error }, { status: 400 });
  const actor = scope.customerSession?.name || scope.adminSession?.name || "관리자";
  try {
    await saveCompanyProfile(scope.companyId, patch, actor);
  } catch {
    return NextResponse.json({ message: "회사 정보 저장 준비 중입니다(DB 적용 대기)." }, { status: 503 });
  }
  const record = await getCompanyProfile(scope.companyId);
  return NextResponse.json({ ...record, values: redactCompanyProfile(record.values, isAdmin) });
}

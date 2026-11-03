import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { uploadCompanyDocument } from "@/lib/company-profile-store";
import { COMPANY_DOCUMENT_MAX_BYTES, COMPANY_DOCUMENT_TYPES, COMPANY_PROFILE_FIELDS } from "@/domains/organization/company-profile";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const companyId = typeof form?.get("companyId") === "string" ? (form?.get("companyId") as string) : undefined;
  const scope = await getRequestAuthScope(request, companyId);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (scope.role !== "admin" && !scopeHasCapability(scope, "manage_company")) return NextResponse.json({ message: "서류를 올릴 권한이 없습니다." }, { status: 403 });
  const file = form?.get("file");
  const fieldKey = String(form?.get("fieldKey") || "");
  if (scope.role !== "admin" && COMPANY_PROFILE_FIELDS.find((field) => field.key === fieldKey)?.locked) {
    return NextResponse.json({ message: "서류는 관리자에게 제출해 주세요." }, { status: 403 });
  }
  if (!(file instanceof File)) return NextResponse.json({ message: "파일을 선택해 주세요." }, { status: 400 });
  if (file.size > COMPANY_DOCUMENT_MAX_BYTES) return NextResponse.json({ message: "10MB 이하 파일만 올릴 수 있습니다." }, { status: 400 });
  if (!(COMPANY_DOCUMENT_TYPES as readonly string[]).includes(file.type)) return NextResponse.json({ message: "PDF·JPG·PNG만 올릴 수 있습니다." }, { status: 400 });
  try {
    const result = await uploadCompanyDocument({
      actorName: scope.customerSession?.name || scope.adminSession?.name || "관리자",
      bytes: await file.arrayBuffer(),
      companyId: scope.companyId,
      contentType: file.type,
      fieldKey,
      filename: file.name
    });
    return NextResponse.json({ ok: true, url: result.url });
  } catch (error) {
    const message = error instanceof Error && error.message === "올릴 수 없는 항목입니다." ? error.message : "업로드하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    return NextResponse.json({ message }, { status: 400 });
  }
}

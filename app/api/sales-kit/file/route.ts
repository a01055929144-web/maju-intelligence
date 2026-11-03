import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { COMPANY_DOCUMENT_MAX_BYTES, COMPANY_DOCUMENT_TYPES } from "@/domains/organization/company-profile";
import { SALES_MATERIAL_KINDS, type SalesMaterialKind } from "@/domains/lead/sales-kit";
import { addSalesMaterial, removeSalesMaterial } from "@/lib/sales-kit-store";

export const dynamic = "force-dynamic";

async function authorize(request: NextRequest, companyId?: string) {
  const scope = await getRequestAuthScope(request, companyId);
  if (!scope.ok || !scope.companyId) return { error: NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 }) };
  if (scope.role !== "admin" && !scopeHasCapability(scope, "manage_company")) return { error: NextResponse.json({ message: "영업 자료를 바꿀 권한이 없습니다." }, { status: 403 }) };
  return { companyId: scope.companyId };
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const auth = await authorize(request, typeof form?.get("companyId") === "string" ? (form?.get("companyId") as string) : undefined);
  if ("error" in auth) return auth.error;
  const file = form?.get("file");
  const kind = String(form?.get("kind") || "") as SalesMaterialKind;
  if (!(SALES_MATERIAL_KINDS as readonly string[]).includes(kind)) return NextResponse.json({ message: "자료 종류를 골라 주세요." }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ message: "파일을 선택해 주세요." }, { status: 400 });
  if (file.size > COMPANY_DOCUMENT_MAX_BYTES) return NextResponse.json({ message: "10MB 이하 파일만 올릴 수 있습니다." }, { status: 400 });
  if (!(COMPANY_DOCUMENT_TYPES as readonly string[]).includes(file.type)) return NextResponse.json({ message: "PDF·JPG·PNG만 올릴 수 있습니다." }, { status: 400 });
  try {
    const kit = await addSalesMaterial({ bytes: await file.arrayBuffer(), companyId: auth.companyId, contentType: file.type, filename: file.name, kind });
    return NextResponse.json({ ok: true, kit });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("까지") ? error.message : "업로드하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    return NextResponse.json({ message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authorize(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if ("error" in auth) return auth.error;
  try {
    const kit = await removeSalesMaterial(auth.companyId, request.nextUrl.searchParams.get("code") || "");
    return NextResponse.json({ ok: true, kit });
  } catch {
    return NextResponse.json({ message: "삭제하지 못했습니다." }, { status: 400 });
  }
}

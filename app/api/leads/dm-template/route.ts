import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { getLeadDmSettings, saveLeadDmSettings } from "@/lib/store";
import { DEFAULT_LEAD_DM_TEMPLATE, validateLeadDmTemplate } from "@/domains/lead/dm-template";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const settings = await getLeadDmSettings(scope.companyId).catch(() => ({ excluded: "", template: "" }));
  return NextResponse.json({
    canEdit: scopeHasCapability(scope, "manage_customers"),
    excluded: settings.excluded,
    template: settings.template || DEFAULT_LEAD_DM_TEMPLATE
  });
}

export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; excluded?: string; template?: string } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_customers")) return NextResponse.json({ message: "기본 문구를 바꿀 권한이 없습니다." }, { status: 403 });
  const template = body?.template || "";
  const error = validateLeadDmTemplate(template);
  if (error) return NextResponse.json({ message: error }, { status: 400 });
  const excluded = (body?.excluded || "").slice(0, 300);
  try {
    await saveLeadDmSettings(scope.companyId, { excluded, template });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  }
}

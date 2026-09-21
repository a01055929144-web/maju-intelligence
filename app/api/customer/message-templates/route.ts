import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { getCompanyMessageTemplates, getDriverMessageTemplates, replaceCompanyMessageTemplates, replaceDriverMessageTemplates, type DeliveryMessageTemplate } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const mode = request.nextUrl.searchParams.get("mode") === "company" ? "company" : "driver";
  try {
    if (mode === "company") {
      if (!scopeHasCapability(scope, "manage_company")) return NextResponse.json({ message: "공통 템플릿 관리 권한이 없습니다." }, { status: 403 });
      return NextResponse.json({ templates: await getCompanyMessageTemplates(scope.companyId) });
    }
    const driverId = scope.customerSession?.userId;
    if (!driverId) return NextResponse.json({ message: "기사 계정 정보가 없습니다." }, { status: 400 });
    return NextResponse.json({ templates: await getDriverMessageTemplates(scope.companyId, driverId, request.nextUrl.searchParams.get("import") === "1") });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "템플릿을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null) as { mode?: "company" | "driver"; templates?: DeliveryMessageTemplate[] } | null;
  const scope = await getRequestAuthScope(request);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const templates = (body?.templates || []).slice(0, 30).filter((item) => item.label?.trim() && item.body?.trim()).map((item, index) => ({ ...item, sortOrder: index * 10 + 10, templateKey: item.templateKey || `custom_${Date.now()}_${index}` }));
  try {
    if (body?.mode === "company") {
      if (!scopeHasCapability(scope, "manage_company")) return NextResponse.json({ message: "공통 템플릿 관리 권한이 없습니다." }, { status: 403 });
      return NextResponse.json(await replaceCompanyMessageTemplates(scope.companyId, templates));
    }
    const driverId = scope.customerSession?.userId;
    if (!driverId) return NextResponse.json({ message: "기사 계정 정보가 없습니다." }, { status: 400 });
    return NextResponse.json(await replaceDriverMessageTemplates(scope.companyId, driverId, templates));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "템플릿을 저장하지 못했습니다." }, { status: 500 });
  }
}

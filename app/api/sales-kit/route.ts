import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { buildSalesKitLines, parseSalesKit, SALES_KIT_FIELDS, validateOrderUrl, type SalesKitSettings } from "@/domains/lead/sales-kit";
import { getSalesKit, getSalesKitContactFallback, saveSalesKit } from "@/lib/sales-kit-store";

export const dynamic = "force-dynamic";

/** 11/4: 영업 자료 키트 — 설정과, DM 문구 아래 붙일 줄(짧은 링크 포함)을 돌려줍니다. */
export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  const [kit, fallback] = await Promise.all([getSalesKit(scope.companyId), getSalesKitContactFallback(scope.companyId)]);
  return NextResponse.json({
    canEdit: scope.role === "admin" || scopeHasCapability(scope, "manage_company"),
    fallbackPhone: fallback.phone,
    kit,
    lines: buildSalesKitLines(kit, { companyName: fallback.companyName, fallbackPhone: fallback.phone, origin: request.nextUrl.origin })
  });
}

export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as (Partial<SalesKitSettings> & { companyId?: string }) | null;
  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (scope.role !== "admin" && !scopeHasCapability(scope, "manage_company")) return NextResponse.json({ message: "영업 자료를 바꿀 권한이 없습니다." }, { status: 403 });
  const urlError = validateOrderUrl(body?.orderUrl || "");
  if (urlError) return NextResponse.json({ message: urlError }, { status: 400 });
  const current = await getSalesKit(scope.companyId);
  const known = new Set(current.materials.map((item) => item.code));
  const incoming = parseSalesKit(JSON.stringify({ ...current, ...body }));
  const defaults = Object.fromEntries(Object.entries(incoming.defaults).filter(([, code]) => typeof code === "string" && known.has(code)));
  try {
    const saved = await saveSalesKit(scope.companyId, {
      ...current,
      contactLabel: incoming.contactLabel.trim(),
      contactPhone: incoming.contactPhone.replace(/[^0-9-]/g, ""),
      defaults,
      fields: incoming.fields.filter((field) => (SALES_KIT_FIELDS as readonly string[]).includes(field)),
      orderUrl: incoming.orderUrl.trim()
    });
    return NextResponse.json({ ok: true, kit: saved });
  } catch {
    return NextResponse.json({ message: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  }
}

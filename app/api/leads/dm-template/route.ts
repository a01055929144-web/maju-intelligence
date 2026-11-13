import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { countRecentNewRestaurantLeads, extractCustomerAdministrativeArea, getCompanySalesAdministrativeAreas, getLeadDmSettings, saveLeadDmSettings, supabaseRequest } from "@/lib/store";
import { getCompanyProfile } from "@/lib/company-profile-store";
import { DEFAULT_LEAD_DM_TEMPLATE, validateLeadDmTemplate } from "@/domains/lead/dm-template";

export const dynamic = "force-dynamic";

// CC-31: GET은 회사 문구(매장용·유통사용)와 변수 값(회사명·{지역}·주력 품목·{신규수})을 준다. address를 주면 그 리드 주소의 시·군·구 기준.
export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const settings = await getLeadDmSettings(scope.companyId).catch(() => ({ excluded: "", template: "", distributorTemplate: "" }));
  const distributorEnabled = isFeatureEnabled("DISTRIBUTOR_SALES", scope.companyId);
  const address = (request.nextUrl.searchParams.get("address") || "").slice(0, 200);
  const [profile, areas] = await Promise.all([
    getCompanyProfile(scope.companyId).catch(() => null),
    getCompanySalesAdministrativeAreas(scope.companyId).catch(() => [] as string[]),
  ]);
  // {지역}: 리드 주소의 시·군·구, 없으면 회사 영업 지역 첫 번째. 표시는 마지막 단어(예: 강남구).
  const area = extractCustomerAdministrativeArea(address) || areas[0] || "";
  const newCount = await countRecentNewRestaurantLeads(scope.companyId, area).catch(() => 0);
  const mainItems = String(profile?.values?.signature_items ?? "").split(/[\n,]/).map((item) => item.trim()).filter(Boolean).slice(0, 3).join(", ");
  return NextResponse.json({
    canEdit: scopeHasCapability(scope, "manage_customers"),
    excluded: settings.excluded,
    template: settings.template || DEFAULT_LEAD_DM_TEMPLATE,
    distributorTemplate: settings.distributorTemplate,
    distributorEnabled,
    context: { companyName: profile?.company?.name || "", region: area.split(" ").pop() || "", mainItems, newCount },
  });
}

export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; excluded?: string; template?: string; distributorTemplate?: string } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_customers")) return NextResponse.json({ message: "기본 문구를 바꿀 권한이 없습니다." }, { status: 403 });
  const template = body?.template || "";
  const error = validateLeadDmTemplate(template);
  if (error) return NextResponse.json({ message: error }, { status: 400 });
  // 유통사용 문구는 유통사 영업을 켠 회사만. 안 보내면(undefined) 저장된 값은 그대로, 빈 문자열이면 지운다.
  let distributorTemplate: string | undefined;
  if (typeof body?.distributorTemplate === "string") {
    if (!isFeatureEnabled("DISTRIBUTOR_SALES", scope.companyId)) return NextResponse.json({ message: "유통사 영업을 쓰는 회사만 유통사용 문구를 저장할 수 있습니다." }, { status: 403 });
    const distributorError = body.distributorTemplate.trim() ? validateLeadDmTemplate(body.distributorTemplate) : "";
    if (distributorError) return NextResponse.json({ message: distributorError }, { status: 400 });
    distributorTemplate = body.distributorTemplate;
  }
  const excluded = (body?.excluded || "").slice(0, 300);
  try {
    await saveLeadDmSettings(scope.companyId, { excluded, template, distributorTemplate });
    // MAJU 관리자가 고객사 대신 저장한 경우(설정 도우미 대행)만 감사 기록. 기록 실패가 저장을 되돌리지는 않는다.
    if (scope.role === "admin") {
      await supabaseRequest("admin_audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify([{
        company_id: scope.companyId, action: "lead_dm_template_saved", target_type: "company_message_template",
        metadata: { actorName: scope.adminSession?.name || "관리자", proxy: true, storeLength: template.trim().length, distributorLength: distributorTemplate?.trim().length ?? null },
      }]) }).catch((e) => console.error("lead_dm_template_saved audit failed", e));
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  }
}

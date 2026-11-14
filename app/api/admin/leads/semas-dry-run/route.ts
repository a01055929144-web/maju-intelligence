import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { fetchSemasStoresInRadius, getSemasServiceKey } from "@/lib/semas";
import { runSemasDryRun, type SemasDryRunLead } from "@/lib/semas-dry-run";
import { supabaseRequest } from "@/lib/store";

// CC-46-5 S1 소상공인 상가정보 dry-run(관리자 전용, 읽기만). 스위치 FEATURE_LEAD_SEMAS_ENRICH(_COMPANY_IDS) 기본 OFF.
// 응답은 숫자만(상호·주소 원문 없음). 키 값은 응답에 넣지 않는다.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ message: "Not found" }, { status: 404 });
  const params = new URL(request.url).searchParams;
  const companyId = params.get("companyId")?.trim() || "";
  if (!UUID.test(companyId)) return NextResponse.json({ message: "companyId가 필요합니다." }, { status: 400 });
  const limit = Math.max(1, Math.min(100, Number(params.get("limit")) || 30));
  const enabled = isFeatureEnabled("LEAD_SEMAS_ENRICH", companyId);
  const configured = Boolean(getSemasServiceKey());
  if (!enabled) return NextResponse.json({ enabled, configured });

  const leads = await supabaseRequest<SemasDryRunLead[]>(
    `business_permit_leads?select=id,business_name,address,latitude,longitude,industry_primary,status,permit_status&company_id=eq.${encodeURIComponent(companyId)}&merged_into_lead_id=is.null&latitude=not.is.null&or=(industry_primary.is.null,industry_primary.eq.,industry_primary.eq.${encodeURIComponent("기타")})&order=id.asc&limit=${limit * 2}`
  );
  const report = await runSemasDryRun(leads, limit, (lat, lng) => fetchSemasStoresInRadius(lat, lng, 100));
  return NextResponse.json({ enabled, configured, ...report });
}

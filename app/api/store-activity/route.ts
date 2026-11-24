import { NextRequest, NextResponse } from "next/server";
import { customerHasCapability, getRequestAuthScope } from "@/lib/auth";
import { supabaseRequest } from "@/lib/store";
import { isId } from "@/domains/pricing/document";
import { relationHomeEnabled } from "@/lib/store/07-store-activity";

// CX-141 C: 매장 최근 활동(고객사 본인 매장 상세·마주 관리자 공용). 회사 경계는 인증 범위의 companyId로만 정한다.
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const reply = (status: number, message: string) => NextResponse.json({ message }, { status, headers });

export async function GET(request: NextRequest) {
  const storeAccountId = request.nextUrl.searchParams.get("storeAccountId") ?? "";
  if (!isId(storeAccountId)) return reply(400, "매장을 확인해 주세요.");
  const auth = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!auth.ok || !auth.companyId) return reply(401, "로그인이 필요합니다.");
  const company = auth.companyId;
  if (auth.customerSession && !customerHasCapability(auth.customerSession, "manage_sales")) return reply(403, "권한이 없습니다.");
  if (!relationHomeEnabled(company)) return reply(404, "사용할 수 없는 기능입니다.");
  try {
    const base = `store_activity_events?company_id=eq.${encodeURIComponent(company)}&store_account_id=eq.${encodeURIComponent(storeAccountId)}`;
    const [events, home] = await Promise.all([
      supabaseRequest<Array<{ kind: string; occurred_at: string }>>(`${base}&select=kind,occurred_at&order=occurred_at.desc&limit=20`),
      supabaseRequest<Array<{ occurred_at: string }>>(`${base}&kind=eq.home&select=occurred_at&order=occurred_at.desc&limit=1`),
    ]);
    return NextResponse.json({ lastSeenAt: home[0]?.occurred_at ?? null, events: events.map(e => ({ kind: e.kind, occurredAt: e.occurred_at })) }, { headers });
  } catch { return reply(503, "최근 활동을 불러오지 못했습니다."); }
}

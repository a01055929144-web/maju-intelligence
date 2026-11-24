import { NextRequest, NextResponse } from "next/server";
import { customerHasCapability, getRequestAuthScope } from "@/lib/auth";
import { readStoreSignupStatus } from "@/lib/store/07-store-signup-status";
import { signupLinkEnabled } from "@/lib/store/07-store-signup-link";

// CX-142 2차: 새로 가입한 매장(최근 7일·첫 주문 전)과 리드별 "가입 · 첫 주문 전/주문 시작" 상태. 회사 경계는 인증 범위로만 정한다.
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const auth = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!auth.ok || !auth.companyId) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401, headers });
  if (auth.customerSession && !customerHasCapability(auth.customerSession, "manage_sales")) return NextResponse.json({ message: "권한이 없습니다." }, { status: 403, headers });
  if (!signupLinkEnabled(auth.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404, headers });
  try { return NextResponse.json(await readStoreSignupStatus(auth.companyId), { headers }); }
  catch { return NextResponse.json({ message: "가입 현황을 불러오지 못했습니다." }, { status: 503, headers }); }
}

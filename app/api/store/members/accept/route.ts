import { NextRequest, NextResponse } from "next/server";
import { setStoreMemberInvitationProof, storeMemberSessionEnabled } from "@/lib/auth";
import { isStoreMemberCompanyAllowlisted } from "@/lib/store/07-store-member-feature";
import { getPreparedStoreMemberInvitation } from "@/lib/store/07-store-member-management";

export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host.toLowerCase() === (request.headers.get("host") || request.nextUrl.host).toLowerCase(); }
  catch { return false; }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json({ message: "같은 화면에서 다시 시도해 주세요." }, { status: 403 });
  if (!storeMemberSessionEnabled())
    return NextResponse.json({ message: "사용할 수 없는 초대입니다." }, { status: 404 });
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const invitation = await getPreparedStoreMemberInvitation(token);
  if (!invitation || !isStoreMemberCompanyAllowlisted(invitation.companyId) ||
    !(await setStoreMemberInvitationProof(token)))
    return NextResponse.json({ message: "사용할 수 없는 초대입니다." }, { status: 404 });
  const start = new URL("/api/auth/kakao/start", request.url);
  start.searchParams.set("store", "1");
  start.searchParams.set("memberInvite", "1");
  start.searchParams.set("companyId", invitation.companyId);
  start.searchParams.set("storeAccountId", invitation.storeAccountId);
  return NextResponse.json({ loginUrl: start.pathname + start.search }, { headers: { "Cache-Control": "no-store" } });
}

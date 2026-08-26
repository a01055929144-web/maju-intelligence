import { NextRequest, NextResponse } from "next/server";
import { createOAuthState } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 네이버 로그인 버튼이 바로 이 라우트로 이동해서 네이버 인증 화면으로 리다이렉트합니다.
// /api/auth/kakao/start와 동일한 패턴입니다.
export async function GET(request: NextRequest) {
  const inviteCode = request.nextUrl.searchParams.get("invite") || "";
  const clientId = process.env.NAVER_CLIENT_ID;
  const redirectUri = process.env.NAVER_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    const params = new URLSearchParams({ error: "missing_naver_env" });
    if (inviteCode) params.set("invite", inviteCode);
    return NextResponse.redirect(new URL(`/mobile/join?${params.toString()}`, request.url));
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state: await createOAuthState(inviteCode || "personal")
  });

  return NextResponse.redirect(`https://nid.naver.com/oauth2.0/authorize?${params.toString()}`);
}

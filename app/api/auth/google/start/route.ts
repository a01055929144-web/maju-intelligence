import { NextRequest, NextResponse } from "next/server";
import { createOAuthState, getCustomerSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 구글 로그인 버튼이 바로 이 라우트로 이동해서 구글 인증 화면으로 리다이렉트합니다.
// /api/auth/kakao/start와 동일한 패턴입니다.
export async function GET(request: NextRequest) {
  const inviteCode = request.nextUrl.searchParams.get("invite") || "";
  const mode = request.nextUrl.searchParams.get("mode") || "";
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    const params = new URLSearchParams({ error: "missing_google_env" });
    if (inviteCode) params.set("invite", inviteCode);
    return NextResponse.redirect(new URL(`/mobile/join?${params.toString()}`, request.url));
  }

  const params = new URLSearchParams({
    access_type: "online",
    client_id: clientId,
    prompt: "select_account",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: await createOAuthState(await resolveOAuthPayload(inviteCode, mode))
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

async function resolveOAuthPayload(inviteCode: string, mode: string) {
  if (mode === "connect") {
    const session = await getCustomerSession();
    if (session?.userId) return `connect:${session.userId}`;
  }
  return inviteCode || "personal";
}

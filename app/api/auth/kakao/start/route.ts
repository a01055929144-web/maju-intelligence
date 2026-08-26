import { NextRequest, NextResponse } from "next/server";
import { createOAuthState } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 카카오 로그인 버튼이 바로 이 라우트로 이동해서 곧장 카카오 인증 화면으로 리다이렉트합니다.
// 예전에는 버튼 -> /mobile/join 랜딩 화면 -> 그 화면의 버튼을 다시 눌러야 카카오로 이동했는데,
// 화면 두 개가 사실상 같은 카카오 로그인 진입점이라 중복으로 느껴졌습니다.
// 이제 /dashboard/login과 /mobile/join(초대 코드 있는 경우) 모두 이 라우트 하나로 모입니다.
export async function GET(request: NextRequest) {
  const inviteCode = request.nextUrl.searchParams.get("invite") || "";
  const clientId = process.env.KAKAO_CLIENT_ID;
  const redirectUri = process.env.KAKAO_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    const params = new URLSearchParams({ error: "missing_kakao_env" });
    if (inviteCode) params.set("invite", inviteCode);
    return NextResponse.redirect(new URL(`/mobile/join?${params.toString()}`, request.url));
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state: await createOAuthState(inviteCode || "personal")
  });

  return NextResponse.redirect(`https://kauth.kakao.com/oauth/authorize?${params.toString()}`);
}

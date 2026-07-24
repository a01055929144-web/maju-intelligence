import { NextRequest, NextResponse } from "next/server";
import { setCustomerSession } from "@/lib/auth";
import { acceptStaffKakaoInvitation } from "@/lib/store";

export const dynamic = "force-dynamic";

type KakaoTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type KakaoUserResponse = {
  id?: number;
  kakao_account?: {
    email?: string;
    profile?: {
      nickname?: string;
      profile_image_url?: string;
    };
  };
  properties?: {
    nickname?: string;
    profile_image?: string;
  };
};

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") || "";
  const inviteCode = request.nextUrl.searchParams.get("state") || "";

  if (!code || !inviteCode) {
    return redirectJoin(request.url, inviteCode, "missing_kakao_code");
  }

  try {
    const token = await exchangeKakaoCode(code);
    if (!token.access_token) {
      return redirectJoin(request.url, inviteCode, token.error || "kakao_token_failed");
    }

    const kakaoUser = await getKakaoUser(token.access_token);
    if (!kakaoUser.id) {
      return redirectJoin(request.url, inviteCode, "kakao_user_failed");
    }

    const result = await acceptStaffKakaoInvitation({
      avatarUrl: kakaoUser.kakao_account?.profile?.profile_image_url || kakaoUser.properties?.profile_image,
      email: kakaoUser.kakao_account?.email,
      inviteCode,
      kakaoUserId: String(kakaoUser.id),
      name: kakaoUser.kakao_account?.profile?.nickname || kakaoUser.properties?.nickname
    });

    setCustomerSession({
      companyId: result.companyId,
      companyName: result.companyName,
      email: result.email,
      name: result.name,
      role: "member"
    });

    return NextResponse.redirect(new URL("/mobile/today", request.url));
  } catch (error) {
    console.error("Kakao staff callback failed:", error);
    return redirectJoin(request.url, inviteCode, error instanceof Error ? error.message : "kakao_callback_failed");
  }
}

async function exchangeKakaoCode(code: string): Promise<KakaoTokenResponse> {
  const clientId = process.env.KAKAO_CLIENT_ID;
  const redirectUri = process.env.KAKAO_REDIRECT_URI;
  if (!clientId || !redirectUri) return { error: "missing_kakao_env" };

  const params = new URLSearchParams({
    client_id: clientId,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri
  });

  if (process.env.KAKAO_CLIENT_SECRET) {
    params.set("client_secret", process.env.KAKAO_CLIENT_SECRET);
  }

  const response = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"
    },
    body: params.toString()
  });

  return response.json();
}

async function getKakaoUser(accessToken: string): Promise<KakaoUserResponse> {
  const response = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"
    }
  });

  if (!response.ok) return {};
  return response.json();
}

function redirectJoin(baseUrl: string, inviteCode: string, error: string) {
  const params = new URLSearchParams();
  if (inviteCode) params.set("invite", inviteCode);
  params.set("error", error);
  return NextResponse.redirect(new URL(`/mobile/join?${params.toString()}`, baseUrl));
}

import { NextRequest, NextResponse } from "next/server";
import { consumeOAuthState, setCustomerSession } from "@/lib/auth";
import { acceptStaffKakaoInvitation, createPersonalKakaoWorkspace } from "@/lib/store";
import { normalizeWorkspaceRole } from "@/lib/workspace";

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
  const rawState = request.nextUrl.searchParams.get("state") || "";
  const { ok: stateOk, payload: statePayload } = await consumeOAuthState(rawState);
  const inviteCode = stateOk && statePayload !== "personal" ? statePayload : "";

  if (!stateOk) {
    return redirectJoin(request.url, "", "invalid_oauth_state");
  }
  if (!code) {
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

    const kakaoProfile = {
      avatarUrl: kakaoUser.kakao_account?.profile?.profile_image_url || kakaoUser.properties?.profile_image,
      email: kakaoUser.kakao_account?.email,
      kakaoUserId: String(kakaoUser.id),
      name: kakaoUser.kakao_account?.profile?.nickname || kakaoUser.properties?.nickname
    };

    const result = inviteCode
      ? await acceptStaffKakaoInvitation({
          ...kakaoProfile,
          inviteCode
        })
      : await createPersonalKakaoWorkspace(kakaoProfile);

    // 2026-09-07 버그 수정: inviteCode 유무만으로 role/workspaceType/이동 경로를 정했었는데,
    // 개인 워크스페이스 자동생성 제거(2026-09-07 이전 변경) 이후로는 inviteCode 없는 로그인도
    // 대부분 "이미 회사에 소속된 직원/오너가 다시 로그인"하는 경우입니다. 그런데 이 값들을
    // inviteCode 기준으로 고정해버려서, 초대 코드 없이 카카오 버튼으로 재로그인하는 직원이
    // 오너처럼 취급되어 대시보드(PC용)로 보내지는 문제가 있었습니다. 실제 역할(result.workspaceRole)
    // 기준으로 판단해야 재로그인 직원도 모바일 코스 화면으로 정확히 이동합니다.
    const normalizedRole = normalizeWorkspaceRole(result.workspaceRole);
    const isOwner = normalizedRole === "owner";

    await setCustomerSession({
      appRole: "customer_user",
      companyId: result.companyId,
      companyName: result.companyName,
      email: result.email,
      name: result.name,
      role: isOwner ? "owner" : "member",
      userId: result.userId,
      workspaceRole: normalizedRole,
      workspaceType: result.workspaceType,
      assignedManagerName: result.assignedManagerName,
      assignedVehicle: result.assignedVehicle
    }, { remember: true });

    return NextResponse.redirect(new URL(isOwner ? "/dashboard" : "/mobile/today", request.url));
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

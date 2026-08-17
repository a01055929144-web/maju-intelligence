import { NextRequest, NextResponse } from "next/server";
import { setCustomerSession } from "@/lib/auth";
import { acceptStaffOAuthInvitation, createPersonalOAuthWorkspace } from "@/lib/store";
import { normalizeWorkspaceRole } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type NaverTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type NaverUserResponse = {
  resultcode?: string;
  message?: string;
  response?: {
    id?: string;
    email?: string;
    name?: string;
    profile_image?: string;
  };
};

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") || "";
  const state = request.nextUrl.searchParams.get("state") || "";
  const inviteCode = state === "personal" ? "" : state;

  if (!code) {
    return redirectJoin(request.url, inviteCode, "missing_naver_code");
  }

  try {
    const token = await exchangeNaverCode(code, state);
    if (!token.access_token) {
      return redirectJoin(request.url, inviteCode, token.error || "naver_token_failed");
    }

    const naverUser = await getNaverUser(token.access_token);
    if (!naverUser.response?.id) {
      return redirectJoin(request.url, inviteCode, "naver_user_failed");
    }

    const profile = {
      avatarUrl: naverUser.response.profile_image,
      email: naverUser.response.email,
      name: naverUser.response.name,
      provider: "naver" as const,
      providerUserId: naverUser.response.id
    };

    const result = inviteCode
      ? await acceptStaffOAuthInvitation({ ...profile, inviteCode })
      : await createPersonalOAuthWorkspace(profile);

    await setCustomerSession({
      appRole: "customer_user",
      companyId: result.companyId,
      companyName: result.companyName,
      email: result.email,
      name: result.name,
      role: inviteCode ? "member" : "owner",
      workspaceRole: normalizeWorkspaceRole(result.workspaceRole),
      workspaceType: inviteCode ? "company" : "personal"
    });

    return NextResponse.redirect(new URL(inviteCode ? "/mobile/today" : "/dashboard", request.url));
  } catch (error) {
    console.error("Naver staff callback failed:", error);
    return redirectJoin(request.url, inviteCode, error instanceof Error ? error.message : "naver_callback_failed");
  }
}

async function exchangeNaverCode(code: string, state: string): Promise<NaverTokenResponse> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { error: "missing_naver_env" };

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    state
  });

  const response = await fetch(`https://nid.naver.com/oauth2.0/token?${params.toString()}`, {
    method: "GET"
  });

  return response.json();
}

async function getNaverUser(accessToken: string): Promise<NaverUserResponse> {
  const response = await fetch("https://openapi.naver.com/v1/nid/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`
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

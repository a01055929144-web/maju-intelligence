import { NextRequest, NextResponse } from "next/server";
import { consumeOAuthState, getCustomerSession, setCustomerSession } from "@/lib/auth";
import { acceptStaffOAuthInvitation, createPersonalOAuthWorkspace, linkOAuthIdentityToUser } from "@/lib/store";
import { normalizeWorkspaceRole } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserResponse = {
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
};

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") || "";
  const rawState = request.nextUrl.searchParams.get("state") || "";
  const { ok: stateOk, payload: statePayload } = await consumeOAuthState(rawState);
  const isConnect = stateOk && statePayload.startsWith("connect:");
  const inviteCode = stateOk && statePayload !== "personal" && !isConnect ? statePayload : "";

  if (!stateOk) {
    return redirectJoin(request.url, "", "invalid_oauth_state");
  }
  if (!code) {
    return redirectJoin(request.url, inviteCode, "missing_google_code");
  }

  try {
    const token = await exchangeGoogleCode(code);
    if (!token.access_token) {
      return redirectJoin(request.url, inviteCode, token.error || "google_token_failed");
    }

    const googleUser = await getGoogleUser(token.access_token);
    if (!googleUser.sub) {
      return redirectJoin(request.url, inviteCode, "google_user_failed");
    }

    const profile = {
      avatarUrl: googleUser.picture,
      email: googleUser.email,
      name: googleUser.name,
      provider: "google" as const,
      providerUserId: googleUser.sub
    };

    if (isConnect) {
      const session = await getCustomerSession();
      const userId = statePayload.replace("connect:", "");
      if (!session?.userId || session.userId !== userId) {
        return NextResponse.redirect(new URL("/dashboard/settings?auth=invalid_session", request.url));
      }
      await linkOAuthIdentityToUser({
        ...profile,
        userId
      });
      return NextResponse.redirect(new URL("/dashboard/settings?auth=connected", request.url));
    }

    const result = inviteCode
      ? await acceptStaffOAuthInvitation({ ...profile, inviteCode })
      : await createPersonalOAuthWorkspace(profile);

    await setCustomerSession({
      appRole: "customer_user",
      assignmentKeys: result.assignmentKeys,
      companyId: result.companyId,
      companyName: result.companyName,
      email: result.email,
      name: result.name,
      role: inviteCode ? "member" : "owner",
      userId: result.userId,
      workspaceRole: normalizeWorkspaceRole(result.workspaceRole),
      workspaceType: inviteCode ? "company" : "personal"
    });

    return NextResponse.redirect(new URL(inviteCode ? "/mobile/today" : "/dashboard", request.url));
  } catch (error) {
    console.error("Google staff callback failed:", error);
    return redirectJoin(request.url, inviteCode, error instanceof Error ? error.message : "google_callback_failed");
  }
}

async function exchangeGoogleCode(code: string): Promise<GoogleTokenResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return { error: "missing_google_env" };

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"
    },
    body: params.toString()
  });

  return response.json();
}

async function getGoogleUser(accessToken: string): Promise<GoogleUserResponse> {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
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

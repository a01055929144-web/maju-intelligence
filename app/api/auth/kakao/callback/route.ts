import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { consumeInvitePhoneProof, consumeOAuthState, getCustomerSession, getStoreMemberInvitationProof, getStoreOwnerActivationProof,
  setCustomerSession, setPublicStoreOwnerProfileProof, setStoreSession, storeMemberSessionEnabled } from "@/lib/auth";
import { isStoreMemberCompanyAllowlisted } from "@/lib/store/07-store-member-feature";
import { checkBusinessRegistrationStatusesWithHealth } from "@/lib/business-status";
import { acceptStaffKakaoInvitation, createPersonalKakaoWorkspace, linkKakaoToAppUser } from "@/lib/store";
import { getStoreCostMemberAccess, hasActiveStoreMembership, resolveStoreAuthUserId } from "@/lib/store/08-store-cost-access";
import { activateStoreOwner, getPreparedStoreOwnerActivation, publicStoreOwnerOnboardingEnabled,
  resolveOrCreateStoreKakaoUser } from "@/lib/store/07-store-owner-provisioning";
import { acceptStoreMemberInvitation, getPreparedStoreMemberInvitation } from "@/lib/store/07-store-member-management";
import { findSingleActiveStoreAccount } from "@/lib/store/07-store-member-context";
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
    phone_number?: string;
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
  const linkMode = stateOk && statePayload === "link";
  const storeOwnerMatch = stateOk ? statePayload.match(/^store-owner:([0-9a-f-]{36}):([0-9a-f-]{36})$/i) : null;
  const storeOwnerMode = Boolean(storeOwnerMatch);
  const storeInviteMatch = stateOk ? statePayload.match(/^store-invite:([0-9a-f-]{36}):([0-9a-f-]{36})$/i) : null;
  const storeInviteMode = Boolean(storeInviteMatch);
  const storeMatch = stateOk ? statePayload.match(/^store:([0-9a-f-]{36}):([0-9a-f-]{36})$/i) : null;
  const storeMode = Boolean(storeMatch);
  const storePortalMode = stateOk && statePayload === "store-portal";
  const storeFlow = storeMode || storeOwnerMode || storeInviteMode || storePortalMode;
  const storeCompanyId = storeOwnerMatch?.[1] || storeInviteMatch?.[1] || storeMatch?.[1] || "";
  const inviteCode = stateOk && statePayload !== "personal" && !linkMode && !storeFlow ? statePayload : "";

  if (!stateOk) {
    return redirectJoin(request.url, "", "invalid_oauth_state");
  }
  if (storeFlow && !storeMemberSessionEnabled()) return redirectStore(request.url, "store_login_unavailable");
  if (storeFlow && !storePortalMode && !isStoreMemberCompanyAllowlisted(storeCompanyId)) return redirectStore(request.url, "store_login_unavailable");
  if (!code) {
    return storeFlow ? redirectStore(request.url, "missing_kakao_code") : redirectJoin(request.url, inviteCode, "missing_kakao_code");
  }

  try {
    const token = await exchangeKakaoCode(code);
    if (!token.access_token) {
      return storeFlow ? redirectStore(request.url, "kakao_token_failed") : redirectJoin(request.url, inviteCode, token.error || "kakao_token_failed");
    }

    const kakaoUser = await getKakaoUser(token.access_token);
    if (!kakaoUser.id) {
      return storeFlow ? redirectStore(request.url, "kakao_user_failed") : redirectJoin(request.url, inviteCode, "kakao_user_failed");
    }

    if (storeOwnerMode) {
      const proof = await getStoreOwnerActivationProof({ consume: true });
      const activation = proof ? await getPreparedStoreOwnerActivation(proof.token) : null;
      if (!proof || !activation || !storeOwnerMatch || activation.companyId !== storeOwnerMatch[1] || activation.storeAccountId !== storeOwnerMatch[2])
        return redirectStore(request.url, "store_activation_required");
      const authUserId = await resolveOrCreateStoreKakaoUser({
        avatarUrl: kakaoUser.kakao_account?.profile?.profile_image_url || kakaoUser.properties?.profile_image,
        email: kakaoUser.kakao_account?.email, kakaoUserId: String(kakaoUser.id),
        name: kakaoUser.kakao_account?.profile?.nickname || kakaoUser.properties?.nickname,
        phoneNumber: kakaoUser.kakao_account?.phone_number
      });
      if (!authUserId) return redirectStore(request.url, "store_activation_required");
      if (proof.stage === "kakao" && proof.returnTo && activation.publicOnboarding && publicStoreOwnerOnboardingEnabled(activation.companyId)) {
        if (await findSingleActiveStoreAccount(activation.companyId, authUserId)) {
          if (!(await setStoreSession(authUserId))) return redirectStore(request.url, "store_login_unavailable");
          return NextResponse.redirect(new URL(proof.returnTo.replace("/pricing-document#", "/pricing-document?continueOrder=1#"), request.url));
        }
        if (!(await setPublicStoreOwnerProfileProof({ authUserId, returnTo: proof.returnTo, token: proof.token,
          storePhone: kakaoUser.kakao_account?.phone_number })))
          return redirectStore(request.url, "store_activation_required");
        return NextResponse.redirect(new URL("/store/activate?profile=1", request.url));
      }
      if (!proof.termsAcceptedAt || activation.profileRequired) return redirectStore(request.url, "store_activation_required");
      const { failedNumbers, results } = await checkBusinessRegistrationStatusesWithHealth([activation.businessRegistrationNumber]);
      const status = results.get(activation.businessRegistrationNumber);
      if (failedNumbers.has(activation.businessRegistrationNumber) || status?.label !== "정상")
        return redirectStore(request.url, "business_status_verification_required");
      const activated = await activateStoreOwner({ authUserId, businessRegistrationNumber: activation.businessRegistrationNumber,
        termsAcceptedAt: proof.termsAcceptedAt, token: proof.token, verificationRequestId: randomUUID(), verifiedAt: new Date().toISOString() });
      if (!(await setStoreSession(authUserId))) return redirectStore(request.url, "store_login_unavailable");
      if (proof.returnTo) return NextResponse.redirect(new URL(proof.returnTo, request.url));
      return redirectStoreScope(request.url, activated.companyId, activated.storeAccountId);
    }

    if (storeInviteMode && storeInviteMatch) {
      const proof = await getStoreMemberInvitationProof({ consume: true });
      const invitation = proof ? await getPreparedStoreMemberInvitation(proof.token) : null;
      if (!proof || !invitation || invitation.companyId !== storeInviteMatch[1] || invitation.storeAccountId !== storeInviteMatch[2])
        return redirectStore(request.url, "store_invitation_required");
      const authUserId = await resolveOrCreateStoreKakaoUser({
        avatarUrl: kakaoUser.kakao_account?.profile?.profile_image_url || kakaoUser.properties?.profile_image,
        email: kakaoUser.kakao_account?.email, kakaoUserId: String(kakaoUser.id),
        name: kakaoUser.kakao_account?.profile?.nickname || kakaoUser.properties?.nickname,
        phoneNumber: kakaoUser.kakao_account?.phone_number
      });
      if (!authUserId) return redirectStore(request.url, "store_invitation_required");
      await acceptStoreMemberInvitation({ authUserId, companyId: invitation.companyId,
        storeAccountId: invitation.storeAccountId, token: proof.token });
      if (!(await setStoreSession(authUserId))) return redirectStore(request.url, "store_login_unavailable");
      return redirectStoreScope(request.url, invitation.companyId, invitation.storeAccountId);
    }

    if (storePortalMode) {
      const authUserId = await resolveStoreAuthUserId(String(kakaoUser.id));
      if (!authUserId || !(await hasActiveStoreMembership(authUserId)) || !(await setStoreSession(authUserId)))
        return redirectStore(request.url, "store_membership_required");
      return NextResponse.redirect(new URL("/store", request.url));
    }

    if (storeMode && storeMatch) {
      const authUserId = await resolveStoreAuthUserId(String(kakaoUser.id));
      const companyId = storeMatch[1], storeAccountId = storeMatch[2];
      if (!authUserId || !(await getStoreCostMemberAccess({ authUserId, companyId, storeAccountId })) || !(await setStoreSession(authUserId)))
        return redirectStore(request.url, "store_membership_required");
      return redirectStoreScope(request.url, companyId, storeAccountId);
    }

    if (linkMode) {
      const session = await getCustomerSession();
      if (!session?.userId) return NextResponse.redirect(new URL("/dashboard/login", request.url));
      const linked = await linkKakaoToAppUser(session.userId, String(kakaoUser.id));
      return NextResponse.redirect(new URL(`/dashboard/settings/company?kakao=${linked}#my-account`, request.url));
    }

    const kakaoProfile = {
      avatarUrl: kakaoUser.kakao_account?.profile?.profile_image_url || kakaoUser.properties?.profile_image,
      email: kakaoUser.kakao_account?.email,
      kakaoUserId: String(kakaoUser.id),
      name: kakaoUser.kakao_account?.profile?.nickname || kakaoUser.properties?.nickname,
      phoneNumber: kakaoUser.kakao_account?.phone_number
    };

    const result = inviteCode
      ? await acceptStaffKakaoInvitation({
          ...kakaoProfile,
          inviteCode,
          phoneLastFourVerified: await consumeInvitePhoneProof(inviteCode)
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
      assignedVehicle: result.assignedVehicle,
      invitedEmployeeName: result.invitedEmployeeName
    }, { remember: true });

    return NextResponse.redirect(new URL(isOwner ? "/dashboard" : "/mobile/today", request.url));
  } catch (error) {
    console.error("Kakao staff callback failed:", error);
    const message = error instanceof Error ? error.message : "kakao_callback_failed";
    return storeFlow ? redirectStore(request.url, "kakao_callback_failed") : redirectJoin(request.url, inviteCode, message);
  }
}

function redirectStore(baseUrl: string, error: string) {
  return NextResponse.redirect(new URL(`/store?error=${encodeURIComponent(error)}`, baseUrl));
}

function redirectStoreScope(baseUrl: string, companyId: string, storeAccountId: string) {
  const url = new URL("/store", baseUrl);
  url.searchParams.set("companyId", companyId);
  url.searchParams.set("storeAccountId", storeAccountId);
  return NextResponse.redirect(url);
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

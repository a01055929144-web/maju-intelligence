import { NextRequest, NextResponse } from "next/server";
import { createOAuthState, getCustomerSession, getStoreMemberInvitationProof, getStoreOwnerActivationProof, storeMemberSessionEnabled } from "@/lib/auth";
import { isStoreMemberCompanyAllowlisted } from "@/lib/store/07-store-member-feature";

export const dynamic = "force-dynamic";

// 카카오 로그인 버튼이 바로 이 라우트로 이동해서 곧장 카카오 인증 화면으로 리다이렉트합니다.
// 예전에는 버튼 -> /mobile/join 랜딩 화면 -> 그 화면의 버튼을 다시 눌러야 카카오로 이동했는데,
// 화면 두 개가 사실상 같은 카카오 로그인 진입점이라 중복으로 느껴졌습니다.
// 이제 /dashboard/login과 /mobile/join(초대 코드 있는 경우) 모두 이 라우트 하나로 모입니다.
export async function GET(request: NextRequest) {
  const inviteCode = request.nextUrl.searchParams.get("invite") || "";
  // 11/3: 로그인한 계정에 카카오를 연결(아이디 로그인 + 카카오 간편 로그인을 한 계정으로).
  const linkMode = request.nextUrl.searchParams.get("link") === "1";
  const storeMode = request.nextUrl.searchParams.get("store") === "1";
  const storePortalMode = request.nextUrl.searchParams.get("storePortal") === "1";
  const storeOwnerMode = storeMode && request.nextUrl.searchParams.get("activation") === "1";
  const storeInviteMode = storeMode && request.nextUrl.searchParams.get("memberInvite") === "1";
  const companyId = request.nextUrl.searchParams.get("companyId") || "";
  const storeAccountId = request.nextUrl.searchParams.get("storeAccountId") || "";
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if ((storeMode || storePortalMode) && !storeMemberSessionEnabled()) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  if (storePortalMode && (storeMode || linkMode || inviteCode)) return NextResponse.json({ message: "로그인 요청을 확인해 주세요." }, { status: 400 });
  if (storeMode && !isStoreMemberCompanyAllowlisted(companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  if (storeOwnerMode && storeInviteMode) return NextResponse.json({ message: "로그인 요청을 확인해 주세요." }, { status: 400 });
  if (storeMode && (linkMode || inviteCode)) return NextResponse.json({ message: "로그인 요청을 확인해 주세요." }, { status: 400 });
  if (storeMode && (!uuid.test(companyId) || !uuid.test(storeAccountId))) return NextResponse.json({ message: "매장 주소를 확인해 주세요." }, { status: 400 });
  if (storeOwnerMode && !(await getStoreOwnerActivationProof())) return NextResponse.json({ message: "점주 개통 링크를 다시 확인해 주세요." }, { status: 400 });
  if (storeInviteMode && !(await getStoreMemberInvitationProof())) return NextResponse.json({ message: "구성원 초대 링크를 다시 확인해 주세요." }, { status: 400 });
  if (linkMode && !(await getCustomerSession())?.userId) {
    return NextResponse.redirect(new URL("/dashboard/login", request.url));
  }
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
    state: await createOAuthState(storeOwnerMode ? `store-owner:${companyId}:${storeAccountId}` : storeInviteMode ? `store-invite:${companyId}:${storeAccountId}` : storeMode ? `store:${companyId}:${storeAccountId}` : storePortalMode ? "store-portal" : linkMode ? "link" : inviteCode || "personal")
  });

  return NextResponse.redirect(`https://kauth.kakao.com/oauth/authorize?${params.toString()}`);
}

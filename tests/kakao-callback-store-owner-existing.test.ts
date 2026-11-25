import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ state: vi.fn(), proof: vi.fn(), prepared: vi.fn(), session: vi.fn(), existing: vi.fn(), member: vi.fn(), createUser: vi.fn(), candidates: vi.fn(),
  phoneMatch: vi.fn(), phoneCompanies: vi.fn(), refresh: vi.fn(), activate: vi.fn(), business: vi.fn() }));
vi.mock("@/lib/auth", () => ({ consumeOAuthState: m.state, getStoreOwnerActivationProof: m.proof, setStoreSession: m.session, storeMemberSessionEnabled: () => true,
  consumeInvitePhoneProof: vi.fn(), getCustomerSession: vi.fn(), getStoreMemberInvitationProof: vi.fn(), setPublicStoreOwnerKakaoProof: vi.fn(), setPublicStoreOwnerProfileProof: vi.fn(),
  setStoreOwnerActivationProof: vi.fn(), setCustomerSession: vi.fn(), setAdminSession: vi.fn() }));
vi.mock("@/lib/store/07-store-owner-provisioning", () => ({ getPreparedStoreOwnerActivation: m.prepared, resolveOrCreateStoreKakaoUser: m.createUser, activateStoreOwner: m.activate,
  publicStoreOwnerOnboardingEnabled: () => false, activatePreopeningStoreOwner: vi.fn(), completePublicStoreOwnerProfile: vi.fn(), publicPreopeningStoreEnabled: () => false,
  STORE_TERMS_VERSION: "x", verifyPublicStoreOwnerOnboardingIntent: vi.fn(), preparePublicStoreOwnerActivation: vi.fn() }));
vi.mock("@/lib/store/07-store-member-feature", () => ({ isStoreMemberCompanyAllowlisted: () => true }));
vi.mock("@/lib/store/08-store-cost-access", () => ({ resolveStoreAuthUserId: m.existing, getStoreCostMemberAccess: vi.fn() }));
vi.mock("@/lib/store/07-store-portal", () => ({ hasAllowedStorePortalMembership: m.member }));
vi.mock("@/lib/store/07-store-phone-link", () => ({ listPhoneLinkCandidates: m.candidates, phoneHasCustomerMatch: m.phoneMatch, phoneLinkCompanyIds: m.phoneCompanies, refreshAppUserPhone: m.refresh }));
vi.mock("@/lib/business-status", () => ({ checkBusinessRegistrationStatusesWithHealth: m.business }));
vi.mock("@/lib/store/07-store-signup-link", () => ({ finalizeStoreSignup: vi.fn() }));
vi.mock("@/lib/store/11-store-direct-signup", () => ({ storeDirectSignupEnabled: () => false }));
vi.mock("@/lib/store/07-store-member-management", () => ({ acceptStoreMemberInvitation: vi.fn(), getPreparedStoreMemberInvitation: vi.fn() }));
vi.mock("@/lib/store/07-store-member-context", () => ({ findSingleActiveStoreAccount: vi.fn() }));
vi.mock("@/lib/store", () => ({ acceptStaffKakaoInvitation: vi.fn(), createPersonalKakaoWorkspace: vi.fn(), linkKakaoToAppUser: vi.fn() }));
import { GET } from "../app/api/auth/kakao/callback/route";

const company = "00000000-0000-4000-8000-000000000001", storeAccount = "20000000-0000-4000-8000-000000000001", owner = "10000000-0000-4000-8000-000000000001";
const call = () => GET(new NextRequest("https://store.example.test/api/auth/kakao/callback?code=c&state=s"));
const location = (response: Response) => response.headers.get("location") ?? "";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("KAKAO_CLIENT_ID", "k"); vi.stubEnv("KAKAO_REDIRECT_URI", "https://store.example.test/api/auth/kakao/callback");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("/oauth/token")
    ? new Response(JSON.stringify({ access_token: "t" }), { status: 200 })
    : new Response(JSON.stringify({ id: 77, kakao_account: { phone_number: "+82 10-1111-2222", profile: { nickname: "점주" } } }), { status: 200 })));
  m.state.mockResolvedValue({ ok: true, payload: `store-owner:${company}:${storeAccount}` });
  m.session.mockResolvedValue(true); m.member.mockResolvedValue(false); m.existing.mockResolvedValue(null); m.candidates.mockResolvedValue([]);
  m.phoneCompanies.mockReturnValue([]); m.phoneMatch.mockResolvedValue(false); m.proof.mockResolvedValue(null); m.prepared.mockResolvedValue(null);
});

describe("CX-145 P1-2 단가표 '이 단가로 주문 시작' 카카오 로그인", () => {
  it("이미 가입한 점주는 개통 증명이 없어도(오류 없이) 자기 매장으로 간다", async () => {
    m.existing.mockResolvedValue(owner); m.member.mockResolvedValue(true);
    const response = await call();
    expect(location(response)).toBe("https://store.example.test/store");
    expect(m.session).toHaveBeenCalledWith(owner);
    expect(m.createUser).not.toHaveBeenCalled(); expect(m.activate).not.toHaveBeenCalled();
  });

  it("이미 가입한 점주 + 단가표 공개 신규 가입 증명 → 단가표의 주문 계속 화면(자기 매장)", async () => {
    m.existing.mockResolvedValue(owner); m.member.mockResolvedValue(true);
    m.proof.mockResolvedValue({ token: "t".repeat(43), stage: "kakao", returnTo: "/pricing-document#doc-token" });
    m.prepared.mockResolvedValue({ companyId: company, storeAccountId: storeAccount, publicOnboarding: true });
    expect(location(await call())).toBe("https://store.example.test/pricing-document?continueOrder=1#doc-token");
  });

  it("[회귀 방지] 기존 점주 + 다른 매장 거래처 초대(증명이 맞고 publicOnboarding 아님) → 건너뛰지 않고 새 매장 개통까지 진행", async () => {
    m.existing.mockResolvedValue(owner); m.member.mockResolvedValue(true); m.createUser.mockResolvedValue(owner);
    m.proof.mockResolvedValue({ token: "t".repeat(43), stage: "kakao", termsAcceptedAt: "2026-11-26T00:00:00Z" });
    m.prepared.mockResolvedValue({ companyId: company, storeAccountId: storeAccount, publicOnboarding: false, businessRegistrationNumber: "1234567890", profileRequired: false });
    m.business.mockResolvedValue({ failedNumbers: new Set(), results: new Map([["1234567890", { label: "정상" }]]) });
    m.activate.mockResolvedValue({ companyId: company, storeAccountId: storeAccount });
    const response = await call();
    expect(m.activate).toHaveBeenCalledOnce();
    expect(m.activate).toHaveBeenCalledWith(expect.objectContaining({ authUserId: owner, token: "t".repeat(43) }));
    expect(location(response)).toContain(`companyId=${company}`);
    expect(location(response)).not.toBe("https://store.example.test/store");
  });

  it("가입 전이지만 점주 휴대폰 후보가 있으면 확인 화면으로 간다(번호 원문은 넘기지 않는다)", async () => {
    m.existing.mockResolvedValue(owner); m.phoneCompanies.mockReturnValue([company]); m.candidates.mockResolvedValue([{ state: "linkable" }]);
    const response = await call();
    expect(location(response)).toBe("https://store.example.test/store/phone-link");
    expect(m.refresh).toHaveBeenCalledWith(owner, "01011112222");
    expect(m.session).toHaveBeenCalledWith(owner);
  });

  it("연결된 매장도 후보도 없고 개통 증명도 없으면 오류 대신 /store(카카오로 로그인 안내)", async () => {
    const response = await call();
    expect(location(response)).toBe("https://store.example.test/store");
    expect(location(response)).not.toContain("error=");
    expect(m.session).not.toHaveBeenCalled();
  });

  it("개통 증명이 다른 매장 것이면 신규 개통을 하지 않는다", async () => {
    m.proof.mockResolvedValue({ token: "t".repeat(43), stage: "kakao" });
    m.prepared.mockResolvedValue({ companyId: company, storeAccountId: "20000000-0000-4000-8000-0000000000ff" });
    expect(location(await call())).toBe("https://store.example.test/store");
    expect(m.createUser).not.toHaveBeenCalled(); expect(m.activate).not.toHaveBeenCalled();
  });

  it("연결된 매장이 없고 개통 증명이 맞는 신규 점주는 기존 개통 흐름을 그대로 탄다", async () => {
    m.proof.mockResolvedValue({ token: "t".repeat(43), stage: "kakao" });
    m.prepared.mockResolvedValue({ companyId: company, storeAccountId: storeAccount });
    m.createUser.mockResolvedValue(owner);
    await call();
    expect(m.createUser).toHaveBeenCalledOnce();
  });
});

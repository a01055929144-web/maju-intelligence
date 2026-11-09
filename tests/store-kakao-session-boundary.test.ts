import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({ activate: vi.fn(), business: vi.fn(), complete: vi.fn(), consume: vi.fn(),
  getProof: vi.fn(), prepared: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getStoreOwnerActivationProof: routeMocks.getProof, setPublicStoreOwnerKakaoProof: vi.fn(),
  setStoreOwnerActivationProof: vi.fn(), setStoreSession: routeMocks.session, storeMemberSessionEnabled: () => true }));
vi.mock("@/lib/store/07-store-owner-provisioning", () => ({ activateStoreOwner: routeMocks.activate,
  completePublicStoreOwnerProfile: routeMocks.complete, getPreparedStoreOwnerActivation: routeMocks.prepared,
  preparePublicStoreOwnerActivation: vi.fn(), publicStoreOwnerOnboardingEnabled: () => true, STORE_TERMS_VERSION: "2026-11-07",
  verifyPublicStoreOwnerOnboardingIntent: vi.fn() }));
vi.mock("@/lib/store/07-store-member-feature", () => ({ isStoreMemberCompanyAllowlisted: () => true }));
vi.mock("@/lib/business-status", () => ({ checkBusinessRegistrationStatusesWithHealth: routeMocks.business }));

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("store Kakao session route boundary", () => {
  it("reuses the existing Kakao OAuth state and stays default-off", () => {
    const start = source("app/api/auth/kakao/start/route.ts");
    const callback = source("app/api/auth/kakao/callback/route.ts");
    expect(start).toContain("storeMemberSessionEnabled()");
    expect(start).toContain("isStoreMemberCompanyAllowlisted(companyId)");
    expect(callback).toContain("isStoreMemberCompanyAllowlisted(storeCompanyId)");
    expect(start).toContain('`store:${companyId}:${storeAccountId}`');
    expect(start).toContain('`store-owner:${companyId}:${storeAccountId}`');
    expect(callback).toContain("activation.companyId !== storeOwnerMatch[1]");
    expect(callback).toContain("resolveStoreAuthUserId(String(kakaoUser.id))");
    expect(callback).toContain("getStoreCostMemberAccess({ authUserId, companyId, storeAccountId })");
    expect(callback).toContain("setStoreSession(authUserId)");
    expect(callback).toContain('storeFlow ? redirectStore(request.url, "kakao_callback_failed")');
    expect(callback).not.toContain("createStore");
  });

  it("keeps representative preparation separate from owner consent and Kakao identity", () => {
    const provision = source("app/api/store/accounts/provision/route.ts");
    const activate = source("app/api/store/accounts/activate/route.ts");
    expect(provision).toContain("getCustomerSession()");
    expect(provision).toContain("isStoreMemberCompanyAllowlisted(session.companyId)");
    expect(provision).toContain("getStorePublicBaseUrl()");
    expect(provision).not.toContain("new URL(request.url).origin");
    expect(provision.indexOf("getStorePublicBaseUrl()")).toBeLessThan(provision.indexOf("const prepared = await prepareStoreOwnerActivationForCustomer("));
    expect(provision).not.toContain("authUserId");
    expect(provision).not.toContain("termsAccepted");
    expect(activate).toContain("body.termsAccepted !== true");
    expect(activate).toContain("isStoreMemberCompanyAllowlisted(activation.companyId)");
    expect(activate).toContain("setStoreOwnerActivationProof(body.token)");
    expect(activate).not.toContain("ownerAuthUserId");
  });

  it("keeps Kakao-first public owners incomplete until profile, terms and business verification finish", () => {
    const activate = source("app/api/store/accounts/activate/route.ts");
    const callback = source("app/api/auth/kakao/callback/route.ts");
    expect(callback).toContain("setPublicStoreOwnerProfileProof");
    expect(callback).toContain('new URL("/store/activate?profile=1", request.url)');
    expect(activate).toContain('proof.stage !== "profile"');
    expect(activate).toContain("completePublicStoreOwnerProfile");
    expect(activate.indexOf("checkBusinessRegistrationStatusesWithHealth")).toBeLessThan(activate.indexOf("activateStoreOwner({"));
    expect(activate.indexOf("activateStoreOwner({")).toBeLessThan(activate.indexOf("setStoreSession(proof.authUserId)"));
    expect(activate.indexOf("const proof = await getStoreOwnerActivationProof();")).toBeLessThan(activate.indexOf("await completePublicStoreOwnerProfile"));
    expect(activate.indexOf("setStoreSession(proof.authUserId)")).toBeLessThan(activate.indexOf("getStoreOwnerActivationProof({ consume: true })"));
    expect(callback.indexOf("setPublicStoreOwnerProfileProof")).toBeLessThan(callback.indexOf("setStoreSession(authUserId)"));
  });

  it("clears the store cookie through the existing logout and never elevates a public order token", () => {
    const logout = source("app/api/customer/logout/route.ts");
    const storefront = source("app/api/storefront/route.ts");
    expect(logout).toContain("clearStoreSession");
    expect(storefront).not.toContain("getStoreSession");
    expect(storefront).not.toContain("getStoreMemberContext");
    expect(storefront).not.toContain("body.authUserId");
    expect(storefront).toContain("getStoreOrderActor({ companyId: store.companyId, customerId: store.customerId })");
  });
});

describe("Kakao-first profile retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const proof = { authUserId: "30000000-0000-4000-8000-000000000001", expiresAt: 9999999999,
      returnTo: "/pricing-document#opaque", stage: "profile", token: "a".repeat(43) };
    routeMocks.getProof.mockImplementation(async (options?: { consume?: boolean }) => {
      if (options?.consume) routeMocks.consume();
      return proof;
    });
    routeMocks.prepared.mockResolvedValue({ businessRegistrationNumber: "1234567890", companyId: "10000000-0000-4000-8000-000000000001",
      customerId: null, profileRequired: false, publicOnboarding: true, storeAccountId: "20000000-0000-4000-8000-000000000001" });
    routeMocks.complete.mockResolvedValue({}); routeMocks.activate.mockResolvedValue({}); routeMocks.session.mockResolvedValue(true);
  });

  it("keeps the profile proof after a temporary business check failure and consumes it only after retry success", async () => {
    routeMocks.business.mockResolvedValueOnce({ failedNumbers: new Set(["1234567890"]), results: new Map() })
      .mockResolvedValueOnce({ failedNumbers: new Set(), results: new Map([["1234567890", { label: "정상" }]]) });
    const { POST } = await import("../app/api/store/accounts/activate/route");
    const body = { store: { address: "서울", businessRegistrationNumber: "1234567890", phone: "01012345678",
      representativeName: "대표", storeName: "매장" }, termsAccepted: true };
    const first = await POST(new Request("http://localhost/api/store/accounts/activate", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as never);
    expect(first.status).toBe(422); expect(routeMocks.consume).not.toHaveBeenCalled(); expect(routeMocks.session).not.toHaveBeenCalled();
    const retry = await POST(new Request("http://localhost/api/store/accounts/activate", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as never);
    expect(retry.status).toBe(200); expect(routeMocks.complete).toHaveBeenCalledTimes(2);
    expect(routeMocks.activate).toHaveBeenCalledOnce(); expect(routeMocks.session).toHaveBeenCalledOnce();
    expect(routeMocks.consume).toHaveBeenCalledOnce();
  });
});

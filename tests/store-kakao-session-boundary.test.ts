import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("store Kakao session route boundary", () => {
  it("reuses the existing Kakao OAuth state and stays default-off", () => {
    const start = source("app/api/auth/kakao/start/route.ts");
    const callback = source("app/api/auth/kakao/callback/route.ts");
    expect(start).toContain("storeMemberSessionEnabled()");
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
    expect(provision).toContain("getStorePublicBaseUrl()");
    expect(provision).not.toContain("new URL(request.url).origin");
    expect(provision.indexOf("getStorePublicBaseUrl()")).toBeLessThan(provision.indexOf("const prepared = await prepareStoreOwnerActivationForCustomer("));
    expect(provision).not.toContain("authUserId");
    expect(provision).not.toContain("termsAccepted");
    expect(activate).toContain("body.termsAccepted !== true");
    expect(activate).toContain("setStoreOwnerActivationProof(body.token)");
    expect(activate).not.toContain("ownerAuthUserId");
  });

  it("clears the store cookie through the existing logout and never elevates a public order token", () => {
    const logout = source("app/api/customer/logout/route.ts");
    const storefront = source("app/api/storefront/route.ts");
    expect(logout).toContain("clearStoreSession");
    expect(storefront).not.toContain("getStoreSession");
    expect(storefront).not.toContain("getStoreMemberContext");
    expect(storefront).not.toContain("authUserId");
  });
});

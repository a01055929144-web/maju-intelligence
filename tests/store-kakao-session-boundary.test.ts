import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("store Kakao session route boundary", () => {
  it("reuses the existing Kakao OAuth state and stays default-off", () => {
    const start = source("app/api/auth/kakao/start/route.ts");
    const callback = source("app/api/auth/kakao/callback/route.ts");
    expect(start).toContain("storeMemberSessionEnabled()");
    expect(start).toContain('createOAuthState(storeMode ? "store"');
    expect(callback).toContain('statePayload === "store"');
    expect(callback).toContain("resolveStoreAuthUserId(String(kakaoUser.id))");
    expect(callback).toContain("hasActiveStoreMembership(authUserId)");
    expect(callback).toContain("setStoreSession(authUserId)");
    expect(callback).not.toContain("createStore");
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

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isValidLoginId, normalizeLoginId, validateAccountPassword } from "../domains/organization/account-login";

describe("WO-21 account login rules", () => {
  it("normalizes and validates the documented login id format", () => {
    expect(normalizeLoginId("  Owner_01 ")).toBe("owner_01");
    expect(isValidLoginId("owner_01")).toBe(true);
    expect(isValidLoginId("Owner-01")).toBe(false);
    expect(isValidLoginId("abc")).toBe(false);
  });

  it("requires at least ten password characters", () => {
    expect(validateAccountPassword("123456789")).toBe(false);
    expect(validateAccountPassword("1234567890")).toBe(true);
  });

  it("keeps login-id auth behind the default-off flag and revalidates session versions", () => {
    const auth = readFileSync(resolve(process.cwd(), "lib/auth.ts"), "utf8");
    const env = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
    expect(env).toContain("ACCOUNT_LOGIN_V2_ENABLED=false");
    expect(env).toContain("NEXT_PUBLIC_ACCOUNT_LOGIN_V2_ENABLED=false");
    expect(auth).toContain("if (accountLoginV2Enabled())");
    expect(auth).toContain("state.sessionVersion !== session.sessionVersion");
    expect(auth).toContain("state.mustChangePassword && !options.allowPasswordChange");
  });

  it("enforces invite expiry and phone last-four verification only in WO-21 mode", () => {
    const store = readFileSync(resolve(process.cwd(), "lib/store.ts"), "utf8");
    expect(store).toContain("if (accountLoginV2Enabled())");
    expect(store).toContain("new Date(invitation.expires_at).getTime() <= Date.now()");
    expect(store).toContain("expectedLastFour !== actualLastFour");
  });

  it("keeps Kakao primary for every linked company member and login id secondary", () => {
    const login = readFileSync(resolve(process.cwd(), "app/dashboard/login/page.tsx"), "utf8");
    expect(login).toContain("대표 · 직원 모두");
    expect(login).toContain("대표·관리자·영업·배송 모두 연결된 카카오 계정");
    expect(login).toContain('accountLoginEnabled ? "order-1"');
    expect(login).toContain("보조 로그인");
  });

  it("does not ship a default administrator id or password", () => {
    const auth = readFileSync(resolve(process.cwd(), "lib/auth.ts"), "utf8");
    const store = readFileSync(resolve(process.cwd(), "lib/store.ts"), "utf8");
    const env = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");
    expect(`${auth}\n${store}`).not.toContain("maju-admin-2026");
    expect(`${auth}\n${store}`).not.toContain("admin@maju.local");
    expect(env).toMatch(/^ADMIN_EMAIL=\r?$/m);
    expect(env).toMatch(/^ADMIN_PASSWORD=\r?$/m);
  });

  it("uses permission-group language without the deprecated casual-worker label", () => {
    const staffAccess = readFileSync(resolve(process.cwd(), "domains/organization/staff-access.ts"), "utf8");
    const workspace = readFileSync(resolve(process.cwd(), "lib/workspace.ts"), "utf8");
    expect(`${staffAccess}\n${workspace}`).not.toContain("알바");
    expect(staffAccess).toContain('temporary: "임시 직원"');
  });
});

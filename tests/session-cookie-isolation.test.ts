import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// CC-39: 로그인·가입·로그아웃은 자기 사이트 쿠키만 다루고, logout-all만 셋을 모두 지운다.
const src = (path: string) => readFileSync(path, "utf8");
const clears = (text: string) => ["clearAdminSession", "clearCustomerSession", "clearStoreSession"].filter((name) => text.includes(`await ${name}(`) || text.includes(`${name}(), `) || text.includes(`, ${name}()`) || text.includes(`[${name}()`));

describe("session cookie isolation", () => {
  it.each([
    ["app/api/customer/login/route.ts", []],
    ["app/api/admin/login/route.ts", []],
    ["app/api/company-signup/route.ts", []],
    ["app/api/customer/logout/route.ts", ["clearCustomerSession"]],
    ["app/api/admin/logout/route.ts", ["clearAdminSession"]],
    ["app/api/auth/logout-all/route.ts", ["clearAdminSession", "clearCustomerSession", "clearStoreSession"]],
  ])("%s clears only %j", (path, expected) => {
    expect(clears(src(path))).toEqual(expected);
  });
  it("keeps clearing both sessions on password change (security)", () => {
    expect(clears(src("app/api/auth/change-password/route.ts"))).toEqual(["clearAdminSession", "clearCustomerSession"]);
  });
});

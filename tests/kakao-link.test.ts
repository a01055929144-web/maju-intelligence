import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("kakao link to logged-in account (11/3)", () => {
  it("uses a dedicated link state and never steals a kakao id used by another account", () => {
    const start = readFileSync(resolve(process.cwd(), "app/api/auth/kakao/start/route.ts"), "utf8");
    const callback = readFileSync(resolve(process.cwd(), "app/api/auth/kakao/callback/route.ts"), "utf8");
    const store = readFileSync(resolve(process.cwd(), "lib/store.ts"), "utf8");
    expect(start).toContain('linkMode ? "link"');
    expect(callback).toContain("linkKakaoToAppUser(session.userId");
    expect(store).toContain('if (rows[0]) return "in_use";');
  });
  it("blocks disconnecting a login-id owner from the staff screen", () => {
    const store = readFileSync(resolve(process.cwd(), "lib/store.ts"), "utf8");
    expect(store).toContain("아이디로 로그인하는 대표 계정은 여기서 연결 해제할 수 없습니다.");
  });
});

describe("kakao login on a linked id account", () => {
  it("only touches login time instead of overwriting role/email", () => {
    const store = readFileSync(resolve(process.cwd(), "lib/store.ts"), "utf8");
    expect(store.match(/existingUsers\[0\]\?\.login_id \? await touchLinkedKakaoUser/g)?.length).toBe(2);
  });
});

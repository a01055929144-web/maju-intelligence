import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("11/3 member disconnect and account rename", () => {
  const store = readFileSync(resolve(process.cwd(), "lib/store.ts"), "utf8");
  it("disconnects membership-only accounts with self and last-owner guards", () => {
    expect(store).toContain('input.invitationId.startsWith("member:")');
    expect(store).toContain("지금 로그인한 본인 계정은 연결 해제할 수 없습니다.");
    expect(store).toContain("마지막 대표 계정은 연결 해제할 수 없습니다.");
  });
  it("lets admins rename managed accounts", () => {
    expect(store).toContain('input.action === "change_name"');
    const panel = readFileSync(resolve(process.cwd(), "app/admin/accounts/managed-accounts-panel.tsx"), "utf8");
    expect(panel).toContain("이름 변경");
  });
});

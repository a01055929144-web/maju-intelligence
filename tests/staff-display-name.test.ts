import { describe, expect, it } from "vitest";
import { preserveSocialProfileName, resolveCompanyStaffDisplayName } from "../domains/organization/staff-display-name";

describe("resolveCompanyStaffDisplayName", () => {
  it("관리자가 입력한 초대 이름을 소셜 닉네임보다 우선한다", () => {
    expect(resolveCompanyStaffDisplayName({ appUserName: "길동이", invitationEmployeeName: "홍길동" })).toBe("홍길동");
  });

  it("관리자가 이름을 수정하면 같은 계정도 새 이름으로 표시한다", () => {
    expect(resolveCompanyStaffDisplayName({ appUserName: "길동이", invitationEmployeeName: "홍길순" })).toBe("홍길순");
  });

  it("관리자 이름이 없을 때만 소셜 닉네임을 사용한다", () => {
    expect(resolveCompanyStaffDisplayName({ appUserName: "길동이", invitationEmployeeName: null })).toBe("길동이");
  });

  it("소셜 재로그인은 app_users 이름을 덮어쓰지 않는다", () => {
    expect(preserveSocialProfileName("최초 닉네임", "바뀐 닉네임")).toBe("최초 닉네임");
  });
});

import { describe, expect, it } from "vitest";
import { displayLeadNextAction, isLeadUncontacted, recommendLeadNextAction } from "../domains/lead/next-action";
import { compareLeadListDefault, formatLeadOpenDateAge, leadPriorityBadge } from "../domains/lead/lead-list";

describe("lead next action", () => {
  it("prefers mobile text, social DM, email, fax, then visit", () => {
    expect(recommendLeadNextAction({ phone: "010-1234-5678" })).toEqual({ action: "sms", label: "오늘 문자" });
    expect(recommendLeadNextAction({ instagramUrl: "@maju" })).toEqual({ action: "dm", label: "오늘 DM" });
    expect(recommendLeadNextAction({ email: "owner@example.com" })).toEqual({ action: "email", label: "오늘 이메일" });
    expect(recommendLeadNextAction({ fax: "02-123-4567" })).toEqual({ action: "fax", label: "오늘 팩스" });
    expect(recommendLeadNextAction({})).toEqual({ action: "visit", label: "방문 검토" });
  });

  it("maps legacy next actions without rewriting saved data", () => {
    expect(displayLeadNextAction({ nextAction: "전화 대상" })).toBe("오늘 바로 전화");
    expect(displayLeadNextAction({ nextAction: "직접 확인" })).toBe("직접 확인");
  });

  it("treats only the common new stage as uncontacted fallback", () => {
    expect(isLeadUncontacted({ status: "전화 대상" })).toBe(true);
    expect(isLeadUncontacted({ status: "연락 완료" })).toBe(false);
  });
});

describe("lead list presentation", () => {
  it("sorts by contact priority then newest open date", () => {
    const leads = [
      { businessName: "방문", openDate: "2026-10-25" },
      { businessName: "문자 과거", openDate: "2026-10-20", phone: "01011112222" },
      { businessName: "문자 최신", openDate: "2026-10-24", phone: "01033334444" },
      { businessName: "메일", openDate: "2026-10-25", email: "a@example.com" }
    ];
    expect([...leads].sort(compareLeadListDefault).map((lead) => lead.businessName)).toEqual(["문자 최신", "문자 과거", "메일", "방문"]);
  });

  it("builds rank labels and KST age", () => {
    expect(leadPriorityBadge({ naverTalktalkUrl: "https://talk.naver.com/ct/test" }).label).toBe("2순위 · DM·톡톡");
    expect(formatLeadOpenDateAge("2026-10-20", new Date("2026-10-25T00:30:00+09:00"))).toBe("5일 전");
  });
});

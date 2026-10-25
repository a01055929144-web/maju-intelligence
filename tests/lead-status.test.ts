import { describe, expect, it } from "vitest";
import { isSelectableLeadStatus, leadStageLabel, toLeadStageValue } from "../domains/lead/lead-status";

describe("lead status stages", () => {
  it("maps legacy statuses to common stages", () => {
    expect(leadStageLabel("DM 발송")).toBe("연락함");
    expect(leadStageLabel("견적 요청")).toBe("견적 전달");
    expect(leadStageLabel("미팅 예정")).toBe("협의·재연락");
    expect(leadStageLabel("전환 진행")).toBe("계약");
    expect(leadStageLabel("방문 대상")).toBe("신규");
    expect(toLeadStageValue("주인 변경")).toBe("주인 변경");
  });
  it("only allows known stage values to be chosen", () => {
    expect(isSelectableLeadStatus("재연락 예정")).toBe(true);
    expect(isSelectableLeadStatus("DM 발송")).toBe(false);
    expect(isSelectableLeadStatus("")).toBe(false);
  });
});

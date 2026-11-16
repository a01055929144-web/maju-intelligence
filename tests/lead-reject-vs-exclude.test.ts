import { describe, expect, it } from "vitest";
import { LEAD_STAGE_OPTIONS, LEAD_STAGE_REASONS, leadStageLabel, toLeadStageValue } from "../domains/lead/lead-status";
import { isHiddenLeadStatus, scopeLeadsByStatus } from "../domains/lead/map-filters";
import { isContactedLead } from "../domains/lead/mobile-sales";

// CC-50: 거절(고객이 거절한 결과)과 제외(우리가 뺀 것)를 나눈다. 기존 "제외" 값은 그대로.
describe("lead stage 거절 / 제외", () => {
  it("lists the 8 stages in order with 거절 and 제외 separate", () => {
    expect(LEAD_STAGE_OPTIONS.map((option) => option.label)).toEqual(["신규", "연락함", "견적 전달", "협의·재연락", "계약", "보류", "거절", "제외"]);
    expect(LEAD_STAGE_OPTIONS.map((option) => option.value).slice(-2)).toEqual(["거절", "제외"]);
  });
  it("keeps stored values (including the old 제외) as they are", () => {
    expect(toLeadStageValue("제외")).toBe("제외");
    expect(toLeadStageValue("거절")).toBe("거절");
    expect(leadStageLabel("제외")).toBe("제외");
    expect(leadStageLabel("거절")).toBe("거절");
  });
  it("offers a reason list for each", () => {
    expect(LEAD_STAGE_REASONS["거절"]).toEqual(["단가", "기존 거래처 유지", "품목 안 맞음", "기타"]);
    expect(LEAD_STAGE_REASONS["제외"]).toEqual(["업종 다름", "중복", "폐업", "연락 거부", "기타"]);
  });
  it("counts 거절 as a handled lead", () => {
    expect(isContactedLead("거절")).toBe(true);
    expect(isContactedLead("제외")).toBe(true);
  });
});

describe("map view: 활성 / 거절함 / 숨김", () => {
  const leads = [
    { id: "a", status: "신규 수집" },
    { id: "b", status: "거절" },
    { id: "c", status: "제외" },
    { id: "d", status: "연락 완료" }
  ];
  const ids = (options: { showDismissed: boolean; showRejected?: boolean }) => scopeLeadsByStatus(leads, { ...options, showClosed: true }).map((lead) => lead.id);
  it("active view hides both 거절 and 제외", () => {
    expect(ids({ showDismissed: false })).toEqual(["a", "d"]);
    expect(isHiddenLeadStatus("거절")).toBe(true);
    expect(isHiddenLeadStatus("제외")).toBe(true);
    expect(isHiddenLeadStatus("신규 수집")).toBe(false);
  });
  it("거절함 shows only 거절, 숨김 shows only 제외", () => {
    expect(ids({ showDismissed: false, showRejected: true })).toEqual(["b"]);
    expect(ids({ showDismissed: true })).toEqual(["c"]);
  });
});

import { describe, expect, it } from "vitest";
import {
  getDefaultVisitFollowUpDate,
  getVisitResultDisplayLabel,
  needsVisitFollowUp,
  STANDARD_VISIT_RESULTS,
  VISIT_RESULT_ACTION_TYPE
} from "../domains/lead/visit-results";

describe("standard visit results", () => {
  it("keeps the six shared PC/mobile choices and action mapping", () => {
    expect(STANDARD_VISIT_RESULTS).toEqual(["부재", "관심", "단가표 전달", "재방문 예정", "거래 시작", "거절"]);
    expect(VISIT_RESULT_ACTION_TYPE["거래 시작"]).toBe("visit");
    expect(VISIT_RESULT_ACTION_TYPE.거절).toBe("exclude");
  });

  it("maps legacy values only for display", () => {
    expect(getVisitResultDisplayLabel("관심 있음")).toBe("관심");
    expect(getVisitResultDisplayLabel("통화 성공")).toBe("연락 완료");
    expect(getVisitResultDisplayLabel("직접 입력")).toBe("직접 입력");
  });

  it("requires and proposes a three-day follow-up for relevant results", () => {
    expect(needsVisitFollowUp("관심")).toBe(true);
    expect(needsVisitFollowUp("부재")).toBe(false);
    expect(getDefaultVisitFollowUpDate(new Date("2026-10-18T00:00:00.000Z"))).toBe("2026-10-21");
    // 2026-10-18 08:00 KST: UTC 날짜가 전날이어도 KST 기준 +3일이어야 합니다.
    expect(getDefaultVisitFollowUpDate(new Date("2026-10-17T23:00:00.000Z"))).toBe("2026-10-21");
  });
});

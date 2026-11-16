import { describe, expect, it } from "vitest";
import { computePermitLeadPeriod, resolvePermitLeadStatus } from "./permit-lead-state";

describe("computePermitLeadPeriod", () => {
  const referenceDate = new Date(2026, 10, 18, 15);

  it("classifies dates from today through older dates", () => {
    expect(computePermitLeadPeriod("2026-11-18", referenceDate)).toBe("today");
    expect(computePermitLeadPeriod("2026-11-16", referenceDate)).toBe("week");
    expect(computePermitLeadPeriod("2026-11-01", referenceDate)).toBe("month");
    expect(computePermitLeadPeriod("2026-10-31", referenceDate)).toBe("recent");
  });

  it("uses the existing recent fallback for missing or invalid dates", () => {
    expect(computePermitLeadPeriod(null, referenceDate)).toBe("recent");
    expect(computePermitLeadPeriod("invalid", referenceDate)).toBe("recent");
  });
});

describe("resolvePermitLeadStatus", () => {
  it("keeps direct status changes within selectable values", () => {
    expect(resolvePermitLeadStatus("status", "재연락 예정")).toBe("재연락 예정");
    expect(resolvePermitLeadStatus("status", "임의 상태")).toBe("검토 필요");
  });

  it("maps visit results and action defaults without changing current behavior", () => {
    expect(resolvePermitLeadStatus("visit", "거래 시작")).toBe("전환 진행");
    expect(resolvePermitLeadStatus("exclude", "거절")).toBe("거절");
    expect(resolvePermitLeadStatus("sms")).toBe("문자 발송");
  });
});

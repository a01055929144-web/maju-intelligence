import { describe, expect, it } from "vitest";
import { isLeadAddressInSalesAreas, resolveVisitResultStatus } from "../domains/lead/lead-policy";

describe("lead sales area and conversion state", () => {
  it("keeps out-of-area leads out of automatic ingestion", () => {
    const areas = ["서울특별시 강남구", "서울특별시 송파구"];
    expect(isLeadAddressInSalesAreas("서울 강남구 테헤란로 1", areas)).toBe(true);
    expect(isLeadAddressInSalesAreas("서울특별시 마포구 월드컵로 1", areas)).toBe(false);
    expect(isLeadAddressInSalesAreas("", areas)).toBe(false);
  });

  it("does not mark a visit result as converted before customer linkage succeeds", () => {
    expect(resolveVisitResultStatus("visit", "거래 시작")).toBe("전환 진행");
    expect(resolveVisitResultStatus("exclude", "거절")).toBe("제외");
  });
});

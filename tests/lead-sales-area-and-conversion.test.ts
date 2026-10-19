import { describe, expect, it } from "vitest";
import {
  extractLeadAdministrativeArea,
  getAdministrativeAreaForEnrichedAddress,
  isLeadAddressInSalesAreas,
  isUserSalesLeadAction,
  resolveMatchedCustomerLeadStatus,
  resolveVisitResultStatus,
  shouldApplySalesAreaFilter
} from "../domains/lead/lead-policy";

describe("lead sales area and conversion state", () => {
  it("keeps out-of-area leads out of automatic ingestion", () => {
    const areas = ["서울특별시 강남구", "서울특별시 송파구"];
    expect(isLeadAddressInSalesAreas("서울 강남구 테헤란로 1", areas)).toBe(true);
    expect(isLeadAddressInSalesAreas("서울특별시 마포구 월드컵로 1", areas)).toBe(false);
    expect(isLeadAddressInSalesAreas("", areas)).toBe(false);
  });

  it("keeps existing leads visible until a sales area is configured", () => {
    expect(shouldApplySalesAreaFilter([], false)).toBe(false);
    expect(shouldApplySalesAreaFilter(["서울특별시 강남구"], false)).toBe(true);
    expect(shouldApplySalesAreaFilter(["서울특별시 강남구"], true)).toBe(false);
  });

  it("normalizes the same administrative area used by ingestion and database filters", () => {
    expect(extractLeadAdministrativeArea("서울 강남구 테헤란로 1")).toBe("서울특별시 강남구");
    expect(extractLeadAdministrativeArea("경기도 성남시 분당구 판교로 1")).toBe("경기도 성남시");
    expect(extractLeadAdministrativeArea("서울특별시 송파구 올림픽로 300")).toBe("서울특별시 송파구");
  });

  it("fills the administrative area when enrichment discovers the first address", () => {
    expect(getAdministrativeAreaForEnrichedAddress(null, "서울특별시 송파구 올림픽로 300")).toBe("서울특별시 송파구");
    expect(getAdministrativeAreaForEnrichedAddress("서울특별시 강남구", "서울특별시 송파구")).toBeUndefined();
  });

  it("classifies matched customers by real sales activity, excluding technical records", () => {
    expect(isUserSalesLeadAction("hold", "외부 정보 보강")).toBe(false);
    expect(isUserSalesLeadAction("hold", "인스타 정보 수정")).toBe(false);
    expect(isUserSalesLeadAction("visit", "관심")).toBe(true);
    expect(resolveMatchedCustomerLeadStatus(false)).toBe("기존 거래처");
    expect(resolveMatchedCustomerLeadStatus(true)).toBe("거래처 전환");
  });

  it("does not mark a visit result as converted before customer linkage succeeds", () => {
    expect(resolveVisitResultStatus("visit", "거래 시작")).toBe("전환 진행");
    expect(resolveVisitResultStatus("exclude", "거절")).toBe("제외");
  });
});

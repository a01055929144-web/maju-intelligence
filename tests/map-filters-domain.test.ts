import { describe, expect, it } from "vitest";
import { filterMapLeads, getPermitLeadType, parseLeadRegion, scopeLeadsByStatus, type MapFilterLead } from "../domains/lead/map-filters";
import { isClosedLead } from "../lib/leads";
import { splitMultiFilter } from "../lib/map-filter-multi";
import { matchesMapLeadType } from "../lib/map-layer-selection";

// M3a: 지도 리드 필터 순수 계산(가짜 데이터). 옛 경로(lib)에서도 같은 이름이 그대로 나온다.
const today = new Date().toISOString().slice(0, 10);
const lead = (over: Partial<MapFilterLead> & { id: string }): MapFilterLead & { id: string } => ({ status: "신규", industryPrimary: "한식", address: "서울특별시 중구 가짜로 1 (가짜동)", openDate: "2020-01-01", ...over });
const none = { areaRange: "" as const, distributorTarget: false, hasReminder: () => false, industry: "", openDateEnd: "", openDateStart: "", regionDong: "", regionSigungu: "", reminderOnly: false, stage: "", typeFilter: "all" as const };

describe("상태 범위", () => {
  const leads = [lead({ id: "a" }), lead({ id: "b", status: "제외" }), lead({ id: "c", status: "폐업 확인 필요" }), lead({ id: "d", permitStatus: "폐업" })];
  it("기본은 제외·폐업 리드를 뺀다", () => expect(scopeLeadsByStatus(leads, { showClosed: false, showDismissed: false }).map((l) => l.id)).toEqual(["a"]));
  it("폐업 포함을 켜면 폐업만 들어오고 제외는 그대로 뺀다", () => expect(scopeLeadsByStatus(leads, { showClosed: true, showDismissed: false }).map((l) => l.id)).toEqual(["a", "c", "d"]));
  it("숨김 보기는 제외만", () => expect(scopeLeadsByStatus(leads, { showClosed: false, showDismissed: true }).map((l) => l.id)).toEqual(["b"]));
});

describe("필터 계산", () => {
  const leads = [lead({ id: "new", openDate: today }), lead({ id: "sales" }), lead({ id: "cafe", industryPrimary: "카페", address: "서울특별시 강남구 가짜로 2 (역삼동)" })];
  it("조건이 없으면 그대로", () => expect(filterMapLeads(leads, none)).toBe(leads));
  it("신규/영업 유형", () => {
    expect(filterMapLeads(leads, { ...none, typeFilter: "new" }).map((l) => l.id)).toEqual(["new"]);
    expect(filterMapLeads(leads, { ...none, typeFilter: "new", distributorTarget: true })).toHaveLength(3); // 유통사는 유형 필터 안 씀
  });
  it("업종·지역(시군구·동)·개업일", () => {
    expect(filterMapLeads(leads, { ...none, industry: "카페" }).map((l) => l.id)).toEqual(["cafe"]);
    expect(filterMapLeads(leads, { ...none, regionSigungu: "강남구" }).map((l) => l.id)).toEqual(["cafe"]);
    expect(filterMapLeads(leads, { ...none, regionSigungu: "강남구", regionDong: "논현동" })).toEqual([]);
    expect(filterMapLeads(leads, { ...none, openDateStart: today }).map((l) => l.id)).toEqual(["new"]);
  });
  it("리마인드만은 주입한 판정을 쓴다", () => expect(filterMapLeads(leads, { ...none, reminderOnly: true, hasReminder: (l) => l.industryPrimary === "카페" }).map((l) => l.id)).toEqual(["cafe"]));
});

describe("옛 경로 다시 내보내기·작은 규칙", () => {
  it("lib에서 같은 함수가 나온다", () => {
    expect(isClosedLead({ status: "폐업 확인 필요" })).toBe(true);
    expect(splitMultiFilter("한식| 카페")).toEqual(["한식", "카페"]);
    expect(matchesMapLeadType("sales", "new", true)).toBe(true);
  });
  it("개업일 없으면 영업, 지역 파싱", () => {
    expect(getPermitLeadType({})).toBe("sales");
    expect(parseLeadRegion("세종특별자치시 한솔동 1")).toEqual({ dong: "", sigungu: "세종특별자치시" });
    expect(parseLeadRegion("경기 성남시 가짜로 3 (가짜동)")).toEqual({ dong: "가짜동", sigungu: "성남시" });
  });
});

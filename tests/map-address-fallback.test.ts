import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { approximateRoadAddress, isSameDistrict, placeKeywordForAddress } from "../components/map/address-variants";
import { MapSearchResultsPanel } from "../components/map/map-search-results-panel";

// 가짜 주소·상호만 사용한다.
describe("좌표 못 찾은 거래처 근사 주소 (11/14 '…길 50-4'가 주소 검색에서 안 나옴)", () => {
  it("건물 부번·층·괄호를 떼고 도로명+본번만", () => {
    expect(approximateRoadAddress("서울 가짜구 가짜길 50-4")).toBe("서울 가짜구 가짜길 50");
    expect(approximateRoadAddress("서울 가짜구 가짜로 12 2층 (가짜동)")).toBe("서울 가짜구 가짜로 12");
    expect(approximateRoadAddress("서울 가짜구 가짜로7번길 3-1")).toBe("서울 가짜구 가짜로7번길 3");
  });
  it("이미 도로명+본번이거나 도로명이 없으면 빈 값", () => {
    expect(approximateRoadAddress("서울 가짜구 가짜로 12")).toBe("");
    expect(approximateRoadAddress("서울 가짜구 가짜동 123-4")).toBe("");
  });
  it("장소 검색어 = 상호 + 시군구, 같은 시군구만 인정", () => {
    expect(placeKeywordForAddress("가짜곱창 신촌점", "서울 가짜구 가짜길 50-4")).toBe("가짜곱창 신촌점 가짜구");
    expect(isSameDistrict("서울 가짜구 가짜길 50-4", "서울 가짜구 다른길 1")).toBe(true);
    expect(isSameDistrict("서울 가짜구 가짜길 50-4", "서울 딴동네구 다른길 1")).toBe(false);
    expect(isSameDistrict("주소없음", "서울 딴동네구 다른길 1")).toBe(true);
  });
});

describe("검색 결과 상호명 = 지도 위치 보기 버튼", () => {
  const noop = () => undefined;
  const base = { bulkBusy: false, bulkMessage: "", customers: [], loading: false, message: "", newLeads: [], onClose: noop, onOpenCustomer: noop, onOpenLead: noop, onRegister: noop, onRegisterSelected: noop, onToggle: noop, onToggleAll: noop, query: "가짜", salesLeads: [], selectedIds: new Set<string>(), unregistered: [] };
  it("onFocusRow가 있으면 상호명이 버튼이 된다", () => {
    const html = renderToStaticMarkup(createElement(MapSearchResultsPanel, { ...base, onFocusRow: noop, unregistered: [{ id: "u1", name: "가짜식당", address: "가짜 주소", chip: "카카오 미등록", pin: 1 }] }));
    expect(html).toMatch(/<button[^>]*title="지도에서 위치 보기"[^>]*>가짜식당<\/button>/);
  });
  it("없으면 그냥 글자", () => {
    const html = renderToStaticMarkup(createElement(MapSearchResultsPanel, { ...base, unregistered: [{ id: "u1", name: "가짜식당", address: "가짜 주소", chip: "카카오 미등록" }] }));
    expect(html).not.toContain("지도에서 위치 보기");
  });
});

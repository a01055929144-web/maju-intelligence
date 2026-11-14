import { describe, expect, it } from "vitest";
import { markerZIndex } from "../components/map/marker-z-index";
import { isStoreVisibleByStatus } from "../domains/customer/relationship-filter";

describe("지도 마커 겹침 순서 (11/14 거래처 마커가 리드에 덮여 안 보임)", () => {
  it("거래처는 리드·미등록보다 위, 출발지·차량은 그보다 위", () => {
    expect(markerZIndex("customer")).toBeGreaterThan(markerZIndex("lead"));
    expect(markerZIndex("customer")).toBeGreaterThan(markerZIndex("unregistered"));
    expect(markerZIndex("origin")).toBeGreaterThan(markerZIndex("customer"));
    expect(markerZIndex("vehicle")).toBeGreaterThan(markerZIndex("lead"));
  });
});

describe("거래처 목록·지도 표시 (11/14 거래 종료 눌렀는데 목록에 남음)", () => {
  const off = { excludeClosed: false, showTerminated: false };
  it("거래 종료는 기본으로 숨긴다", () => {
    expect(isStoreVisibleByStatus({ relationshipStatus: "거래종료" }, off)).toBe(false);
    expect(isStoreVisibleByStatus({ relationshipStatus: "거래중" }, off)).toBe(true);
    expect(isStoreVisibleByStatus({}, off)).toBe(true);
  });
  it("'거래 종료 거래처 보기'를 켜면 보인다(이탈 제외가 켜져 있으면 그쪽이 우선)", () => {
    expect(isStoreVisibleByStatus({ relationshipStatus: "거래종료" }, { excludeClosed: false, showTerminated: true })).toBe(true);
    expect(isStoreVisibleByStatus({ relationshipStatus: "거래종료" }, { excludeClosed: true, showTerminated: true })).toBe(false);
  });
  it("사업자 폐업은 '이탈 거래처 제외'를 켰을 때만 뺀다(기존 동작 유지)", () => {
    expect(isStoreVisibleByStatus({ businessStatus: "closed" }, off)).toBe(true);
    expect(isStoreVisibleByStatus({ businessStatus: "closed" }, { excludeClosed: true, showTerminated: false })).toBe(false);
  });
});

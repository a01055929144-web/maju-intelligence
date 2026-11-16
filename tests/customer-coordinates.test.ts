import { describe, expect, it } from "vitest";
import { isValidKoreanCoordinate, usableStoredPoint } from "../domains/customer/coordinates";

describe("거래처 좌표", () => {
  it("한국 밖·숫자 아님은 받지 않는다", () => {
    expect(isValidKoreanCoordinate(37.5, 127)).toBe(true);
    expect(isValidKoreanCoordinate(40, 127)).toBe(false);
    expect(isValidKoreanCoordinate(37.5, 140)).toBe(false);
    expect(isValidKoreanCoordinate(Number.NaN, 127)).toBe(false);
    expect(isValidKoreanCoordinate("37", 127)).toBe(false);
  });

  it("주소가 같을 때만 저장된 좌표를 쓰고 근사 좌표는 쓰지 않는다", () => {
    const base = { address: "서울 가짜구 가짜로 1", lat: 37.5, lng: 127 };
    expect(usableStoredPoint({ ...base, accuracy: "exact" }, " 서울 가짜구 가짜로 1 ")).toEqual({ lat: 37.5, lng: 127 });
    expect(usableStoredPoint({ ...base, accuracy: "lead" }, "서울 가짜구 가짜로 1")).toEqual({ lat: 37.5, lng: 127 });
    expect(usableStoredPoint({ ...base, accuracy: "exact" }, "서울 가짜구 가짜로 2")).toBeNull();
    expect(usableStoredPoint({ ...base, accuracy: "approx" }, "서울 가짜구 가짜로 1")).toBeNull();
    expect(usableStoredPoint({ ...base, accuracy: "manual" }, "서울 가짜구 가짜로 2")).toEqual({ lat: 37.5, lng: 127 });
    expect(usableStoredPoint({ ...base, accuracy: "bogus" }, "서울 가짜구 가짜로 1")).toBeNull();
    expect(usableStoredPoint(undefined, "x")).toBeNull();
  });
});

describe("거래처 원장 마커에 저장 좌표 싣기", () => {
  it("주소가 같은 저장 좌표만 마커 lat/lng로 싣고, 저장 대상 id는 항상 붙인다", async () => {
    const { createCustomerLedgerMapMarkers } = await import("../lib/route-map-markers");
    const customer = (id: string, address: string, storedAddress: string) => ({ address, customerName: id, grade: "A" as const, id, monthlyRevenue: 100, region: "서울", storedCoordinate: { accuracy: "exact", address: storedAddress, lat: 37.5, lng: 127 } });
    const markers = createCustomerLedgerMapMarkers("출발지", [customer("c1", "서울 가짜로 1", "서울 가짜로 1"), customer("c2", "서울 가짜로 2", "서울 가짜로 9"), { address: "서울 가짜로 3", customerName: "c3", grade: "B" as const, id: "c3", monthlyRevenue: 1, region: "서울" }]);
    const byId = new Map(markers.map((marker) => [marker.id, marker]));
    expect(byId.get("c1")).toMatchObject({ coordinateSaveId: "c1", lat: 37.5, lng: 127 });
    expect(byId.get("c2")?.lat).toBeUndefined();
    expect(byId.get("c2")?.coordinateSaveId).toBe("c2");
    expect(byId.get("c3")?.lat).toBeUndefined();
  });
});

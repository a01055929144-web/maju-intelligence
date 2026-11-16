import { describe, expect, it } from "vitest";
import { buildKakaoMapDestinationUrl, buildKakaoNaviStartOptions } from "../lib/navigation-links";

describe("카카오내비 길 안내 (CC-54)", () => {
  it("좌표가 있으면 wgs84 x=경도 y=위도", () => {
    expect(buildKakaoNaviStartOptions({ name: "가짜식당", point: { lat: 37.5, lng: 127.1 } })).toEqual({ name: "가짜식당", x: 127.1, y: 37.5, coordType: "wgs84" });
  });
  it("좌표가 없으면 내비 호출값 없음 → 카카오맵 링크", () => {
    expect(buildKakaoNaviStartOptions({ name: "가짜식당", point: null })).toBeNull();
    expect(buildKakaoMapDestinationUrl({ name: "가짜식당", point: null, address: "서울 중구 가짜로 1" })).toBe(`https://map.kakao.com/link/search/${encodeURIComponent("서울 중구 가짜로 1")}`);
  });
  it("카카오맵 링크: 좌표가 있으면 목적지 좌표, 아무것도 없으면 기본 검색어", () => {
    expect(buildKakaoMapDestinationUrl({ name: "가짜식당", point: { lat: 37.5, lng: 127.1 } })).toBe(`https://map.kakao.com/link/to/${encodeURIComponent("가짜식당")},37.5,127.1`);
    expect(buildKakaoMapDestinationUrl({ name: "", point: null })).toContain(encodeURIComponent("매장"));
  });
});

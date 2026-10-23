import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isSalesAreaCovered } from "../lib/korean-administrative-areas";

const selectorSource = readFileSync("components/sales-area-selector.tsx", "utf8");
const mapSource = readFileSync("components/kakao-address-map.tsx", "utf8");

describe("sales area selector UI", () => {
  it("supports province, city and general-gu inheritance without expanding stored keys", () => {
    expect(isSalesAreaCovered("서울특별시 강남구", ["서울특별시"])).toBe(true);
    expect(isSalesAreaCovered("경기도 성남시 분당구", ["경기도 성남시"])).toBe(true);
    expect(isSalesAreaCovered("경기도 성남시 분당구", ["경기도 성남시 분당구"])).toBe(true);
    expect(isSalesAreaCovered("경기도 성남시 수정구", ["경기도 성남시 분당구"])).toBe(false);
  });

  it("uses an immediately saved, scrollable checkbox list and disables inherited children", () => {
    expect(selectorSource).toContain('type="checkbox"');
    expect(selectorSource).toContain("max-h-[min(48dvh,440px)]");
    expect(selectorSource).toContain("provinceSelected || parentExplicit");
    expect(selectorSource).toContain("region.label.startsWith(`${administrativeArea} `)");
    expect(selectorSource).toContain("window.confirm");
    expect(selectorSource).toContain("하루 최대 약 54회");
  });

  it("prevents Kakao map gestures from swallowing overlay controls", () => {
    expect(mapSource).toContain('content.addEventListener("mousedown", preventOverlayMapEvent)');
    expect(mapSource).toContain('content.addEventListener("touchstart", preventOverlayMapEvent');
    expect(mapSource).toContain("kakao.maps.event.preventMap()");
    expect(mapSource).toContain("if (!salesAreaInfoPinnedRef.current)");
    expect(mapSource).toContain('"이 지역"');
  });
});

import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// CC-69: 지도 부팅 effect(bootMap)는 시·도(salesAreaBoundary.province)가 바뀐다고 지도를 통째로 다시 만들면 안 된다.
const source = readFileSync("components/kakao-address-map.tsx", "utf8");
const boot = source.slice(source.indexOf("async function bootMap()"), source.indexOf("bootMap();"));

it("부팅 effect는 경계(province)를 직접 쓰지 않고 deps에도 없다", () => {
  expect(boot).not.toContain("salesAreaBoundary?.province");
  expect(boot).not.toMatch(/salesAreaBoundary\.province/);
  expect(source).toContain("}, [appKey, canUseKakao]);");
  expect(source).not.toContain("[appKey, canUseKakao, salesAreaBoundary?.province]");
});
it("경계 effect는 자체 deps로 province 변화를 따라간다", () => {
  expect(source.slice(source.indexOf("SALES_AREA_BOUNDARY_FILES[boundary.province]"))).toContain("salesAreaBoundary?.province,");
});

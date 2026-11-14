import { expect, it } from "vitest";
import { APPROXIMATE_LOCATION_TITLE, customerLocationChip, customerLocationNote, customerLocationState, mapCustomerNotices } from "../domains/route/map-customer-notice";

it("거래처 0~1곳이면 올리기 안내, 2곳 이상이면 없음", () => {
  expect(mapCustomerNotices(0, 0)).toEqual([{ text: "거래처가 0곳입니다", upload: true, unplaced: false, approximate: false }]);
  expect(mapCustomerNotices(1, 0)).toEqual([{ text: "거래처가 1곳입니다", upload: true, unplaced: false, approximate: false }]);
  expect(mapCustomerNotices(2, 0)).toEqual([]);
});

it("좌표 못 찾은 거래처가 있으면 따로 알려 주고, 둘 다 해당하면 둘 다", () => {
  expect(mapCustomerNotices(30, 3)).toEqual([{ text: "좌표 못 찾은 거래처 3", upload: false, unplaced: true, approximate: false }]);
  expect(mapCustomerNotices(1, 1)).toHaveLength(2);
});

it("위치 추정 거래처가 있으면 따로 알려 준다", () => {
  expect(mapCustomerNotices(30, 0, 2)).toEqual([{ text: "위치 추정 거래처 2", upload: false, unplaced: false, approximate: true }]);
  expect(mapCustomerNotices(30, 1, 2).map((n) => n.text)).toEqual(["좌표 못 찾은 거래처 1", "위치 추정 거래처 2"]);
});

it("거래처 위치 상태: 좌표 없음 > 위치 추정 > 정확, id가 없으면 정확으로 본다", () => {
  expect(customerLocationState("a", ["a"], ["a"])).toBe("unplaced");
  expect(customerLocationState("b", ["a"], ["b"])).toBe("approximate");
  expect(customerLocationState("c", ["a"], ["b"])).toBe("exact");
  expect(customerLocationState(undefined, ["a"], ["b"])).toBe("exact");
});

it("검색 결과 칩·상세 문구는 상태별로, 정확하면 원래 칩과 빈 문구", () => {
  expect(customerLocationChip("unplaced", "거래중")).toBe("좌표 없음 · 주소 확인");
  expect(customerLocationChip("approximate", "거래중")).toBe("위치 추정 · 주소 확인");
  expect(customerLocationChip("exact", "거래중")).toBe("거래중");
  expect(customerLocationNote("approximate")).toContain(APPROXIMATE_LOCATION_TITLE);
  expect(customerLocationNote("unplaced")).toContain("좌표를 찾지 못했습니다");
  expect(customerLocationNote("exact")).toBe("");
});

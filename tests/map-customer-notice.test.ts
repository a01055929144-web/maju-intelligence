import { expect, it } from "vitest";
import { mapCustomerNotices } from "../domains/route/map-customer-notice";

it("거래처 0~1곳이면 올리기 안내, 2곳 이상이면 없음", () => {
  expect(mapCustomerNotices(0, 0)).toEqual([{ text: "거래처가 0곳입니다", upload: true, unplaced: false }]);
  expect(mapCustomerNotices(1, 0)).toEqual([{ text: "거래처가 1곳입니다", upload: true, unplaced: false }]);
  expect(mapCustomerNotices(2, 0)).toEqual([]);
});

it("좌표 못 찾은 거래처가 있으면 따로 알려 주고, 둘 다 해당하면 둘 다", () => {
  expect(mapCustomerNotices(30, 3)).toEqual([{ text: "좌표 못 찾은 거래처 3", upload: false, unplaced: true }]);
  expect(mapCustomerNotices(1, 1)).toHaveLength(2);
});

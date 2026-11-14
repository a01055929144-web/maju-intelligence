import { expect, it } from "vitest";
import { assignSearchPins } from "../components/map/search-pins";

it("묶음 순서(거래처 → 영업 → 신규 → 미등록)대로 1부터 번호를 붙인다", () => {
  const result = assignSearchPins({
    customers: [{ id: "c1" }],
    salesLeads: [{ id: "s1" }, { id: "s2" }],
    newLeads: [{ id: "n1" }],
    unregistered: [{ id: "u1" }],
  });
  expect(result.customers.map((row) => row.pin)).toEqual([1]);
  expect(result.salesLeads.map((row) => row.pin)).toEqual([2, 3]);
  expect(result.newLeads.map((row) => row.pin)).toEqual([4]);
  expect(result.unregistered.map((row) => row.pin)).toEqual([5]);
  expect([...result.pins.entries()]).toEqual([["c1", 1], ["s1", 2], ["s2", 3], ["n1", 4], ["u1", 5]]);
});

it("같은 id가 두 묶음에 나오면 처음 번호를 그대로 쓴다(마커는 하나)", () => {
  const result = assignSearchPins({ customers: [{ id: "x" }], salesLeads: [{ id: "x" }], newLeads: [], unregistered: [{ id: "y" }] });
  expect(result.salesLeads[0].pin).toBe(1);
  expect(result.unregistered[0].pin).toBe(2);
  expect(result.pins.size).toBe(2);
});

it("결과가 없으면 빈 번호표", () => {
  const result = assignSearchPins({ customers: [], salesLeads: [], newLeads: [], unregistered: [] });
  expect(result.pins.size).toBe(0);
});

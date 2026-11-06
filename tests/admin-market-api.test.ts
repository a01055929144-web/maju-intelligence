import { describe, expect, it } from "vitest";
import { kstDateKey, parseKamisPrices, parseTourEvents } from "../app/admin/market-data/market-api";

describe("관리자 공공 자료 응답", () => {
  it("KAMIS 품목과 조사 단위를 보존하고 가격 없음은 숨긴다", () => {
    expect(parseKamisPrices({ data: { item: [
      { item_name: "배추", kind_name: "봄", unit: "10kg", rank: "상품", dpr1: "20,000", day1: "2026-11-06" },
      { item_name: "무", dpr1: "-" }
    ] } })).toEqual([{ name: "배추", variety: "봄", unit: "10kg", grade: "상품", price: "20,000", date: "2026-11-06" }]);
  });

  it("관광공사 빈 응답과 단일 행사 응답을 안전하게 처리한다", () => {
    expect(parseTourEvents({ response: { header: { resultCode: "0000" }, body: { items: "" } } })).toEqual([]);
    expect(parseTourEvents({ response: { header: { resultCode: "0000" }, body: { items: { item: {
      contentid: "123", title: "지역 축제", addr1: "서울", eventstartdate: "20261107", eventenddate: "20261108"
    } } } } })).toEqual([{ id: "123", title: "지역 축제", address: "서울", from: "20261107", to: "20261108" }]);
  });

  it("UTC 저녁에도 KST 날짜로 행사 시작일을 만든다", () => {
    expect(kstDateKey(new Date("2026-11-05T16:00:00Z"))).toBe("20261106");
  });
});


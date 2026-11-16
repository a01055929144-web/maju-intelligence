import { describe, expect, it } from "vitest";
import { addressLines } from "./address-line";
describe("addressLines (CC-61)", () => {
  it("배송 주소가 없거나 사업장과 같으면(띄어쓰기만 달라도) 한 줄", () => {
    expect(addressLines("서울 가짜구 가짜로 1", "")).toEqual([{ text: "서울 가짜구 가짜로 1" }]);
    expect(addressLines("서울 가짜구 가짜로 1", "서울가짜구 가짜로1")).toEqual([{ text: "서울 가짜구 가짜로 1" }]);
  });
  it("다르면 배송·사업장 두 줄, 사업장이 비면 배송만", () => {
    expect(addressLines("서울 가짜구 가짜로 1", "서울 가짜구 가짜로 2 3층")).toEqual([{ label: "배송", text: "서울 가짜구 가짜로 2 3층" }, { label: "사업장", text: "서울 가짜구 가짜로 1" }]);
    expect(addressLines("", "서울 가짜구 가짜로 2")).toEqual([{ text: "서울 가짜구 가짜로 2" }]);
    expect(addressLines("", "")).toEqual([]);
  });
});

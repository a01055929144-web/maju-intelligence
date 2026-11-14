import { describe, expect, it } from "vitest";
import { customerMarkerLabel, isCompactCustomerLevel } from "../components/map/customer-marker-label";

describe("거래처 마커 알약 라벨 (47-2b)", () => {
  it("등급 보기: 배지는 등급, title은 C등급 · 상호(차량 보기와 같은 형식)", () => {
    expect(customerMarkerLabel({ label: "C", name: "가짜상회" })).toEqual({ badge: "C", title: "C등급 · 가짜상회" });
  });
  it("차량 보기: 배지는 차량 번호, title은 N호차 · 상호(name의 '배송차 ·'는 쓰지 않는다)", () => {
    expect(customerMarkerLabel({ label: "1", markerColor: "#2563eb", name: "1호차 · 가짜상회", displayName: "가짜상회" })).toEqual({ badge: "1", title: "1호차 · 가짜상회" });
  });
  it("미배정('?')은 배지 '미', title 미배정", () => {
    expect(customerMarkerLabel({ label: "?", name: "배송차 미지정 · 가짜상회", displayName: "가짜상회" })).toEqual({ badge: "미", title: "미배정 · 가짜상회" });
  });
  it("등급이 빈 거래처는 배지 '-', title은 상호만", () => {
    expect(customerMarkerLabel({ label: "", name: "가짜상회" })).toEqual({ badge: "-", title: "가짜상회" });
  });
  it("축소는 level 7 이상부터(거래처 개수와 무관)", () => {
    expect([5, 6].map(isCompactCustomerLevel)).toEqual([false, false]);
    expect([7, 12].map(isCompactCustomerLevel)).toEqual([true, true]);
  });
});

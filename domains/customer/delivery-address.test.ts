import { describe, expect, it } from "vitest";
import { resolveDeliveryAddress } from "./address-line";

describe("resolveDeliveryAddress (CC-54)", () => {
  it("배송 기본 주소가 있으면 그것(찾기용은 상세 제외, 보기용은 기본+상세)", () => {
    expect(resolveDeliveryAddress({ address: "서울 중구 가짜로 1 2층", deliveryBaseAddress: " 서울 중구 가짜로 9 ", deliveryAddressDetail: "3층" })).toEqual({ search: "서울 중구 가짜로 9", display: "서울 중구 가짜로 9 3층", detail: "3층" });
  });
  it("배송 주소가 없거나 공백이면 저장된 주소", () => {
    expect(resolveDeliveryAddress({ address: "서울 중구 가짜로 1" })).toEqual({ search: "서울 중구 가짜로 1", display: "서울 중구 가짜로 1", detail: "" });
    expect(resolveDeliveryAddress({ address: "서울 중구 가짜로 1", deliveryBaseAddress: "  ", deliveryAddressDetail: "3층" }).search).toBe("서울 중구 가짜로 1");
  });
  it("둘 다 없으면 빈 문자열", () => {
    expect(resolveDeliveryAddress({}).search).toBe("");
  });
});

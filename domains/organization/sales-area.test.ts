import { describe, expect, it } from "vitest";
import {
  extractCustomerAdministrativeArea,
  normalizeAdministrativeArea,
  normalizeSelectableSalesArea,
  resolveEffectiveSalesAreas
} from "./sales-area";

describe("organization sales area rules", () => {
  it("normalizes province aliases and removes detailed addresses", () => {
    expect(extractCustomerAdministrativeArea("서울 강남구 테헤란로 25길 34")).toBe("서울특별시 강남구");
    expect(extractCustomerAdministrativeArea("경기도 의정부시 시민로 122")).toBe("경기도 의정부시");
    expect(extractCustomerAdministrativeArea("주소 미확인")).toBe("");
  });

  it("keeps only selectable province, city, and general-gu areas", () => {
    expect(normalizeSelectableSalesArea("서울특별시")).toBe("서울특별시");
    expect(normalizeSelectableSalesArea("경기도 성남시 분당구")).toBe("경기도 성남시 분당구");
    expect(normalizeSelectableSalesArea("강남구")).toBe("");
  });

  it("prefers explicit areas and falls back to defaults after deduplication", () => {
    expect(resolveEffectiveSalesAreas(
      ["서울 강남구", "서울특별시 강남구"],
      ["경기도 성남시"]
    )).toEqual(["서울특별시 강남구"]);
    expect(resolveEffectiveSalesAreas(["강남구"], ["경기도 성남시"])).toEqual(["경기도 성남시"]);
  });

  it("normalizes a broader administrative label when no sigungu is present", () => {
    expect(normalizeAdministrativeArea("서울  강남구  테헤란로")).toBe("서울특별시 강남구");
    expect(normalizeAdministrativeArea("강원")).toBe("강원특별자치도");
  });
});

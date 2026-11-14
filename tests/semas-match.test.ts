import { describe, expect, it } from "vitest";
import { matchLeadToSemas, needsSemasIndustry, roadKey, type SemasStore } from "../domains/lead/semas-match";

// 가짜 상호·가짜 좌표만 사용한다.
const base = { lat: 37.5, lng: 127.0 };
const store = (over: Partial<SemasStore>): SemasStore => ({ id: "S1", name: "가짜국밥", industrySmall: "국밥", industrySmallCode: "I20101", roadAddress: "서울 가짜구 가짜로 10", lat: 37.5001, lng: 127.0001, ...over });

describe("소상공인 상가정보 매칭 (CC-46-5)", () => {
  it("업종이 '기타'이고 상호·거리가 맞으면 업종을 채운다", () => {
    const result = matchLeadToSemas({ name: "가짜국밥", industryPrimary: "기타", ...base }, [store({})]);
    expect(result.resultCode).toBe("filled");
    expect(result.fills).toEqual({ industry: true, coords: false });
    expect(result.store?.industrySmall).toBe("국밥");
  });

  it("인허가 업종이 이미 있으면 덮어쓰지 않는다", () => {
    expect(matchLeadToSemas({ name: "가짜국밥", industryPrimary: "한식", ...base }, [store({})]).resultCode).toBe("already_complete");
  });

  it("괄호·법인 표기·지점명이 달라도 같은 가게로 본다", () => {
    const result = matchLeadToSemas({ name: "(주)가짜국밥 역삼점", industryPrimary: "", ...base }, [store({ branch: "역삼점" })]);
    expect(result.resultCode).toBe("filled");
  });

  it("상호가 다르면 name_low로 버린다", () => {
    const result = matchLeadToSemas({ name: "전혀다른카페", industryPrimary: "기타", ...base }, [store({})]);
    expect(result).toMatchObject({ resultCode: "rejected", rejectReason: "name_low" });
  });

  it("비슷한 두 곳이면 ambiguous로 버린다", () => {
    const result = matchLeadToSemas({ name: "가짜국밥", industryPrimary: "기타", ...base }, [store({ id: "S1" }), store({ id: "S2" })]);
    expect(result).toMatchObject({ resultCode: "rejected", rejectReason: "ambiguous" });
  });

  it("50m보다 멀면 too_far", () => {
    const result = matchLeadToSemas({ name: "가짜국밥", industryPrimary: "기타", ...base }, [store({ lat: 37.5009, lng: 127.0 })]);
    expect(result).toMatchObject({ resultCode: "rejected", rejectReason: "too_far" });
  });

  it("좌표 없는 리드는 도로명+본번이 같을 때만 좌표를 채운다", () => {
    const lead = { name: "가짜국밥", industryPrimary: "한식", address: "서울 가짜구 가짜로 10 (가짜동)" };
    expect(matchLeadToSemas(lead, [store({})])).toMatchObject({ resultCode: "filled", fills: { industry: false, coords: true } });
    expect(matchLeadToSemas(lead, [store({ roadAddress: "서울 가짜구 가짜로 99" })])).toMatchObject({ resultCode: "rejected", rejectReason: "address_mismatch" });
  });

  it("후보가 없으면 not_found", () => {
    expect(matchLeadToSemas({ name: "가짜국밥", industryPrimary: "", ...base }, []).resultCode).toBe("not_found");
  });

  it("보조 함수", () => {
    expect(needsSemasIndustry("기타")).toBe(true);
    expect(needsSemasIndustry(" ")).toBe(true);
    expect(needsSemasIndustry("한식")).toBe(false);
    expect(roadKey("서울 가짜구 가짜로 10-3 (가짜동)")).toBe("가짜로 10");
    expect(roadKey("주소 없음")).toBe("");
  });
});

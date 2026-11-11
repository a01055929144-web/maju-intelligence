import { describe, expect, it } from "vitest";
import { findDuplicate, kakaoPlaceId, normalizeName } from "../domains/lead/distributor-dedupe";

const existing = [{ id: "a", name: "(주)가나 유통", address: "서울 강남구 테헤란로 1", phone: "02-123-4567", kakaoPlaceUrl: "https://place.map.kakao.com/12345" }];

describe("distributor dedupe", () => {
  it("extracts the kakao place id only from a place.map.kakao.com address", () => {
    expect(kakaoPlaceId("https://place.map.kakao.com/12345")).toBe("12345");
    expect(kakaoPlaceId("https://evil.example/https://place.map.kakao.com/12345")).toBeNull();
    expect(kakaoPlaceId("")).toBeNull();
  });
  it("normalizes company suffixes and spaces", () => { expect(normalizeName("㈜ 가나 유통")).toBe("가나유통"); });
  it("matches by place id first, then phone, then name+address", () => {
    expect(findDuplicate({ name: "다른 이름", kakaoPlaceUrl: "https://place.map.kakao.com/12345" }, existing)).toEqual({ id: "a", reason: "place" });
    expect(findDuplicate({ name: "다른 이름", phone: "021234567" }, existing)).toEqual({ id: "a", reason: "phone" });
    expect(findDuplicate({ name: "가나유통", address: "서울  강남구 테헤란로 1" }, existing)).toEqual({ id: "a", reason: "name_address" });
  });
  it("does not match on a name alone or a very short phone", () => {
    expect(findDuplicate({ name: "가나유통", address: "부산" }, existing)).toBeNull();
    expect(findDuplicate({ name: "새곳", phone: "1234" }, [{ name: "다른곳", phone: "1234" }])).toBeNull();
  });
});

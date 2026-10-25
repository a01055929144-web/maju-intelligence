import { describe, expect, it } from "vitest";
import { buildInstagramDiscoveryQueries, extractInstagramHandlesFromText, isPlausibleInstagramHandle, rankInstagramCandidates } from "../domains/lead/instagram-discovery";

describe("instagram discovery", () => {
  it("extracts handles from links and nearby mentions only", () => {
    expect(extractInstagramHandlesFromText("<b>화덕황소곱창</b> https://www.instagram.com/hwadeok_gc/ 방문")).toEqual(["hwadeok_gc"]);
    expect(extractInstagramHandlesFromText("인스타 @hwadeok.gc 팔로우")).toEqual(["hwadeok.gc"]);
    expect(extractInstagramHandlesFromText("문의 owner@example.com")).toEqual([]);
    expect(extractInstagramHandlesFromText("instagram.com/p/abc instagram.com/explore")).toEqual([]);
  });
  it("rejects implausible handles", () => {
    expect(isPlausibleInstagramHandle("12345")).toBe(false);
    expect(isPlausibleInstagramHandle("a..b")).toBe(false);
    expect(isPlausibleInstagramHandle("good_shop.seoul")).toBe(true);
  });
  it("builds region-aware queries", () => {
    expect(buildInstagramDiscoveryQueries({ businessName: "도야집(강남점)", address: "서울특별시 강남구 논현동 1-2" })[0]).toBe("도야집 강남구 논현동 인스타");
  });
  it("ranks candidates mentioned with the business name above unrelated ones", () => {
    const lead = { businessName: "화덕황소곱창", address: "서울 강남구 역삼동 1" };
    const ranked = rankInstagramCandidates(lead, [
      { title: "화덕황소곱창 역삼동 후기", description: "인스타 @hwadeok_gc", link: "https://blog.naver.com/a/1", source: "blog" },
      { title: "화덕황소곱창", description: "", link: "https://www.instagram.com/hwadeok_gc/", source: "web" },
      { title: "맛집 모음", description: "인스타 @random_food", link: "https://blog.naver.com/b/2", source: "blog" }
    ]);
    expect(ranked[0].handle).toBe("hwadeok_gc");
    expect(ranked[0].nameMatched).toBe(true);
    expect(ranked.find((item) => item.handle === "random_food")).toBeUndefined();
  });
});

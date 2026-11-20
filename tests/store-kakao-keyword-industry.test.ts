import { describe, expect, it } from "vitest";
import { classifyPermitLeadIndustry, resolveKakaoKeywordLeadIndustry } from "../lib/store";

describe("resolveKakaoKeywordLeadIndustry", () => {
  it.each([
    ["음식점 > 카페", "양식", "표본 매장", "카페/디저트"],
    ["음식점 > 제과,베이커리", "카페/디저트", "표본 매장", "베이커리"],
    ["음식점 > 브라질음식", "양식", "표본 매장", "브라질 음식"],
    ["음식점 > 멕시칸", "양식", "표본 매장", "멕시코 음식"]
  ])("prefers Kakao category %s over query %s", (category, query, name, expected) => {
    const industry = resolveKakaoKeywordLeadIndustry(category, query, name);

    expect(classifyPermitLeadIndustry(industry, name).primary).toBe(expected);
  });

  it.each(["", "음식점"])("falls back to the query when Kakao category %j is insufficient", (category) => {
    expect(resolveKakaoKeywordLeadIndustry(category, "양식", "표본 매장")).toBe("양식");
  });

  it("keeps a non-target Kakao category instead of the query", () => {
    expect(resolveKakaoKeywordLeadIndustry("교육 > 학원", "한식", "표본 매장")).toBe("교육 > 학원");
  });
});

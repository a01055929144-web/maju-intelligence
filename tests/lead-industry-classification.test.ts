import { describe, expect, it } from "vitest";
import { classifyPermitLeadIndustry } from "../domains/lead/industry-classification";

describe("permit lead industry classification", () => {
  it.each([
    ["말쑤기반찬 말쑤기식당", "한식"],
    ["봉래닭갈비", "한식"],
    ["어나더 도넛", "카페/디저트"],
    ["우형민 빠띠시에", "카페/디저트"],
    ["오혜린 출장부페", "뷔페/단체급식"],
    ["갤러리 타코8", "양식"]
  ])("uses the business name when the government raw category is 기타: %s", (name, expected) => {
    expect(classifyPermitLeadIndustry("기타", name).primary).toBe(expected);
  });

  it.each(["중국식", "외국음식전문점(인도,태국등)", "횟집", "패밀리레스토랑", "기타"])(
    "keeps general-restaurant category in the sales target pool: %s",
    (industry) => expect(classifyPermitLeadIndustry(industry, "표본 매장").isTarget).toBe(true)
  );

  it.each([
    ["패밀리레스트랑", "양식"],
    ["푸드트럭", "프랜차이즈/배달"],
    ["출장조리", "뷔페/단체급식"]
  ])("accepts the remaining food-service variants: %s", (industry, expected) => {
    expect(classifyPermitLeadIndustry(industry, "표본 매장")).toMatchObject({
      primary: expected,
      isTarget: true
    });
  });

  it("still excludes clearly non-food businesses", () => {
    expect(classifyPermitLeadIndustry("기타", "테스트 공인중개사").isTarget).toBe(false);
  });
});

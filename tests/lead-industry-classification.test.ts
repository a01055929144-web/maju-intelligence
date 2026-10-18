import { describe, expect, it } from "vitest";
import { classifyPermitLeadIndustry } from "../lib/store";

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
});

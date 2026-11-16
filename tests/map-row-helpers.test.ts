import { expect, it } from "vitest";
import { displayIndustry } from "../components/map/map-row-helpers";

it("shows the industry up to the first parenthesis", () => {
  expect(displayIndustry("외국음식전문점(인도,태국등)")).toBe("외국음식전문점");
  expect(displayIndustry("한식（일반）")).toBe("한식");
  expect(displayIndustry("분식")).toBe("분식");
  expect(displayIndustry(null)).toBe("");
  expect(displayIndustry(undefined)).toBe("");
});

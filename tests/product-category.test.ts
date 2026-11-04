import { describe, expect, it } from "vitest";
import { categoryOptions, suggestCategory } from "../domains/pricing/product-category";

describe("product category suggestion", () => {
  it.each([
    ["삼겹살(수입/냉동)구이용", "정육"],
    ["대구살(냉동)", "수산"],
    ["고구마치즈돈까스(한맥)", "냉동식품"],
    ["바지락(토바)", "수산"],
    ["카놀라유(오뚜기)", "양념·소스"],
    ["피양파", "농산"],
    ["콩나물(곱슬이)", "일배식품"],
    ["KS마일드체다", "유제품"],
    ["제로콜라(펩시)", "음료·주류"],
    ["고무장갑(태화/소)", "소모품"],
    ["토마토홀(롱고바디)", "공산품"],
    ["방울토마토(1번)", "농산"],
    ["냉동 애플망고(페루)", "농산"],
    ["운송비", ""],
  ])("%s → %s", (name, category) => {
    expect(suggestCategory(name)).toBe(category);
  });
  it("keeps user categories in options", () => {
    expect(categoryOptions(["농산", "베이커리"]).slice(-1)).toEqual(["베이커리"]);
  });
});

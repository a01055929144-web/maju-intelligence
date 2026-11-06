import { describe, expect, it } from "vitest";
import { categoryAncestors, categoryLevelOptions, categoryOptions, cleanCategory, isUnder, suggestCategory } from "../domains/pricing/product-category";

describe("product category suggestion (대 > 중 > 소)", () => {
  it.each([
    ["삼겹살(수입/냉동)구이용", "축산 > 돈육 > 삼겹·오겹"],
    ["우삼겹(수입/4mm)", "축산 > 우육 > 차돌·우삼겹"],
    ["닭가슴살블랙페퍼(한강식품)", "축산 > 계육 > 가슴살"],
    ["대구살(냉동)", "수산 > 어류"],
    ["고구마치즈돈까스(한맥)", "냉동식품 > 냉동가공식품"],
    ["바지락(토바)", "수산 > 패류"],
    ["새우(블랙타이거/10M)", "수산 > 갑각·연체류 > 새우"],
    ["김밥김(10매/비비고)", "수산 > 해조류 > 김"],
    ["카놀라유(오뚜기)", "양념·조미료 > 식용유지"],
    ["다시다(백설/소고기)", "양념·조미료 > 소금·조미료"],
    ["구수한집된장(해찬들)", "양념·조미료 > 장류"],
    ["피양파", "농산 > 채소류 > 조미채소"],
    ["팽이버섯", "농산 > 버섯류"],
    ["방울토마토(1번)", "농산 > 채소류 > 과채류"],
    ["감자(왕)", "농산 > 서류 > 감자"],
    ["로즈마리(kg)", "농산 > 허브"],
    ["블루베리(과일/수입)", "농산 > 과일류 > 베리류"],
    ["콩나물(곱슬이)", "일배식품 > 콩나물·숙주"],
    ["부침두부", "일배식품 > 두부·묵"],
    ["KS마일드체다", "유제품 > 치즈"],
    ["제로콜라(펩시)", "음료·주류 > 음료"],
    ["고무장갑(태화/소)", "비식품 > 위생·세제"],
    ["롤팩(깔끄미)", "비식품 > 포장·일회용품"],
    ["부탄(하이썬)", "비식품 > 가스·연료"],
    ["토마토홀(롱고바디)", "양념·조미료 > 소스·드레싱"],
    ["부가티니(디벨라/6번)500g", "가공식품 > 면·파스타"],
    ["슬라이스햄(오뗄)", "축산 > 육가공 > 햄"],
    ["햄버거빵 50개", "가공식품 > 빵·제과"],
    ["소갈비 냉장", "축산 > 우육 > 갈비"],
    ["운송비", ""],
  ])("%s → %s", (name, category) => {
    expect(suggestCategory(name)).toBe(category);
  });
  it("handles paths", () => {
    expect(categoryAncestors("농산 > 채소류 > 조미채소")).toEqual(["농산", "농산 > 채소류", "농산 > 채소류 > 조미채소"]);
    expect(isUnder("농산 > 채소류", "농산")).toBe(true);
    expect(isUnder("농산물", "농산")).toBe(false);
    expect(cleanCategory(" 축산>돈육 > 목살 ")).toBe("축산 > 돈육 > 목살");
    expect(cleanCategory("a>b>c>d")).toEqual({ error: "카테고리는 대·중·소 3단계까지입니다." });
    expect(categoryOptions(["베이커리 > 빵"])).toContain("베이커리 > 빵");
    expect(categoryOptions([])).toContain("축산 > 돈육 > 목살");
    expect(categoryOptions([])).toContain("공산품 > 조미·장류 > 소스·드레싱");
    expect(categoryOptions(["양념·조미료 > 장류"])).toContain("양념·조미료 > 장류");
    expect(categoryLevelOptions("회사분류 > 냉장 > 특선")).toMatchObject({
      large: expect.arrayContaining(["회사분류"]),
      medium: ["냉장"],
      small: ["특선"],
    });
  });
});


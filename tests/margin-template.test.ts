import { describe, expect, it } from "vitest";
import { templatePrice, type MarginTemplate } from "../domains/pricing/margin-template";

const template: MarginTemplate = {
  margin: 10, rounding: 10,
  categories: [{ category: "농산", margin: 12 }, { category: "농산 > 채소류", margin: 8 }],
  items: [{ productId: "direct", margin: null, directPrice: 777 }, { productId: "item", margin: 5, directPrice: null }],
};
const p = (id: string, category: string) => ({ id, category, cost: 1000 });

describe("margin template price (CC-19a)", () => {
  it("applies direct > item > deepest category > template default", () => {
    expect(templatePrice(template, p("direct", "농산"))).toEqual({ price: 777, margin: null, source: "direct" });
    expect(templatePrice(template, p("item", "농산 > 채소류"))).toMatchObject({ price: 1050, source: "item" });
    expect(templatePrice(template, p("a", "농산 > 채소류 > 잎채소"))).toMatchObject({ price: 1080, margin: 8, source: "category" });
    expect(templatePrice(template, p("b", "농산 > 과일류"))).toMatchObject({ price: 1120, margin: 12, source: "category" });
    expect(templatePrice(template, p("c", "수산"))).toMatchObject({ price: 1100, margin: 10, source: "default" });
  });
  it("does not match by string prefix", () => {
    expect(templatePrice(template, p("d", "농산물"))).toMatchObject({ source: "default" });
  });
});

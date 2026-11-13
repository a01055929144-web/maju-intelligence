import { describe, expect, it } from "vitest";
import { previewTemplate, suggestTemplateName } from "../domains/pricing/margin-template";
describe("previewTemplate / suggestTemplateName", () => {
  const template = { margin: 20, rounding: 1, categories: [{ category: "채소", margin: 30 }], items: [] };
  it("counts only products whose price changes", () => {
    const base = [{ id: "a", category: "채소", cost: 1000, price: 1100 }, { id: "b", category: "공산품", cost: 1000, price: 1200 }];
    expect(previewTemplate(template, base).changed).toBe(1);
  });
  it("suggests a name from the last category segment and margin", () => {
    expect(suggestTemplateName([{ category: "식품 > 공산품", margin: 18 }, { category: "채소", margin: 20 }])).toBe("공산품18 · 채소20");
    expect(suggestTemplateName([])).toBe("");
  });
});

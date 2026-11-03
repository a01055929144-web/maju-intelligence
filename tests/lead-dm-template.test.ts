import { describe, expect, it } from "vitest";
import { DEFAULT_LEAD_DM_TEMPLATE, filterDmItems, parseExcludedItems, renderLeadDm, validateLeadDmTemplate } from "../domains/lead/dm-template";

describe("lead DM template (11/3 A3)", () => {
  it("defaults payment terms to 협의", () => {
    expect(DEFAULT_LEAD_DM_TEMPLATE).toContain("결제 조건은 협의");
  });
  it("drops excluded items such as meat", () => {
    const excluded = parseExcludedItems("육류, 주류");
    expect(filterDmItems(["육류(스테이크용)", "파스타면", "음료·주류 부재료"], excluded)).toEqual(["파스타면"]);
  });
  it("fills placeholders", () => {
    const text = renderLeadDm("{상호}/{업종}/{품목}", { businessName: "가게", industry: "양식", items: ["파스타면", "치즈류"] });
    expect(text).toBe("가게/양식/파스타면, 치즈류");
  });
  it("rejects empty or too long text", () => {
    expect(validateLeadDmTemplate(" ")).not.toBe("");
    expect(validateLeadDmTemplate("a".repeat(1001))).not.toBe("");
    expect(validateLeadDmTemplate("안녕하세요")).toBe("");
  });
});

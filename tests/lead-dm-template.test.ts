import { describe, expect, it } from "vitest";
import { DEFAULT_LEAD_DM_TEMPLATE, LEAD_DM_TEMPLATES, filterDmItems, parseExcludedItems, renderLeadDm, validateLeadDmTemplate } from "../domains/lead/dm-template";

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

describe("lead DM template (CC-31)", () => {
  const base = { businessName: "가게", industry: "양식", items: ["파스타면"], companyName: "마주식자재", region: "강남구", mainItems: "채소", newCount: 12 };
  it("fills the new variables", () => {
    expect(renderLeadDm("{회사명}/{지역}/{주력품목}/{신규수}", base)).toBe("마주식자재/강남구/채소/12");
  });
  it("drops a whole line when its variable is empty and collapses the blank lines left behind", () => {
    const text = renderLeadDm("안녕하세요 {상호}\n\n{업종} 매장에서 많이 쓰시는 {품목}\n\n편하게 답장 주세요.", { ...base, industry: "" });
    expect(text).toBe("안녕하세요 가게\n\n편하게 답장 주세요.");
  });
  it("drops the {신규수} line when the count is 0 or missing", () => {
    expect(renderLeadDm("a\n{지역} {신규수}곳\nb", { ...base, newCount: 0 })).toBe("a\nb");
    expect(renderLeadDm("a\n{신규수}곳\nb", { ...base, newCount: undefined })).toBe("a\nb");
  });
  it("ignores {업종} and {품목} for a distributor lead", () => {
    expect(renderLeadDm("x\n{업종} {품목}\n{상호}", { ...base, target: "distributor" })).toBe("x\n가게");
  });
  it("ships three templates per target and every restaurant one renders for a full lead", () => {
    expect(LEAD_DM_TEMPLATES.restaurant).toHaveLength(3);
    expect(LEAD_DM_TEMPLATES.distributor).toHaveLength(3);
    for (const tpl of LEAD_DM_TEMPLATES.restaurant) expect(renderLeadDm(tpl.body, base)).not.toMatch(/[{}]/);
    for (const tpl of LEAD_DM_TEMPLATES.distributor) expect(renderLeadDm(tpl.body, { ...base, target: "distributor" })).not.toMatch(/[{}]/);
  });
});

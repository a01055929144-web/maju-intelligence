import { describe, expect, it } from "vitest";
import { parseDocument, type DocumentContent } from "../domains/pricing/document";

const pid = "10000000-0000-4000-8000-000000000001";
const base: DocumentContent = {
  kind: "quote", title: "견적", companyName: "회사", contact: "", recipient: "", footer: "", validUntil: "2026-12-31", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true,
  lines: [{ productId: pid, displayName: "양파", brand: "", spec: "", unit: "kg", price: 1000, taxType: "exempt", visible: true, promotionId: null, startsOn: null, endsOn: null, remaining: null, badge: "" }],
};

describe("document price basis (margin template id)", () => {
  it("keeps a valid template id and drops anything else", () => {
    const tid = "20000000-0000-4000-8000-000000000002";
    expect(parseDocument({ ...base, marginTemplateId: tid }).marginTemplateId).toBe(tid);
    expect("marginTemplateId" in parseDocument({ ...base, marginTemplateId: "not-an-id" })).toBe(false);
    expect("marginTemplateId" in parseDocument(base)).toBe(false);
  });
});

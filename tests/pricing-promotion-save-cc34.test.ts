import { describe, expect, it, vi } from "vitest";
import { pricingDocuments, type DocumentScope } from "../application/pricing/documents";
import { PricingInputError } from "../domains/pricing/document";

const scope: DocumentScope = { companyId: "c", actor: "a", manager: true };
const body = (content: Record<string, unknown>) => ({
  action: "save-promotion", id: "40000000-0000-4000-8000-000000000001", expected: 0,
  content: { productId: "40000000-0000-4000-8000-000000000002", name: "양파", displayName: "", startsOn: "2026-11-13", endsOn: "2026-11-16",
    cost: 1000, margin: 10, stock: null, perStoreLimit: null, allowSheet: false, badge: "행사", taxType: "taxable", ...content },
});

describe("CC-34 promotion save", () => {
  it("accepts an empty 노출 이름 by falling back to the product name (was: unlabeled 필수 항목 error)", async () => {
    const request = vi.fn().mockResolvedValue({});
    await pricingDocuments({ request }).execute(scope, body({}));
    expect(request.mock.calls[0][2].content).toMatchObject({ name: "양파", displayName: "양파" });
  });
  it("rejects an empty product name with a labeled input error (400), not a generic one", () => {
    const docs = pricingDocuments({ request: vi.fn() });
    let error: unknown;
    try { docs.execute(scope, body({ name: "  " })); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(PricingInputError);
    expect((error as Error).message).toBe("'행사 상품 이름' 칸을 입력해 주세요.");
  });
  it("labels over-long names too", () => {
    const docs = pricingDocuments({ request: vi.fn() });
    expect(() => docs.execute(scope, body({ displayName: "가".repeat(121) }))).toThrow("'노출 이름' 칸은 120자까지");
  });
  it("the API maps input errors to 400 with the original message and keeps 409 for conflicts only", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/api/pricing-documents/route.ts", "utf8");
    expect(src).toContain("error instanceof PricingInputError) return NextResponse.json({ message: error.message }, { status: 400 })");
    expect(src).toContain("다른 화면에서 바뀌었을 수 있어요");
  });
});

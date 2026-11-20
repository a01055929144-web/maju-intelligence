import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ gate: vi.fn(), db: vi.fn() }));
vi.mock("@/lib/pricing/margin-template-gate", () => ({ marginTemplateGate: mocks.gate }));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.db }));
import { GET } from "../app/api/margin-templates/route";

describe("CX-125 기본 카탈로그 매장 수", () => {
  beforeEach(() => {
    mocks.gate.mockReset().mockResolvedValue({ companyId: "company-a", userId: "user-a" });
    mocks.db.mockReset()
      .mockResolvedValueOnce([{ id: "catalog-a", name: "외식업", margin_bp: 2000, rounding: 10, sort_order: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ margin_template_id: null }, { margin_template_id: null }, { margin_template_id: "catalog-a" }]);
  });

  it("별도 카탈로그 미지정 매장을 기본 카탈로그 수로 반환한다", async () => {
    const response = await GET(new NextRequest("http://localhost/api/margin-templates?companyId=company-a"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ defaultStoreCount: 2, templates: [{ id: "catalog-a", storeCount: 1 }] });
    expect(mocks.db).toHaveBeenNthCalledWith(3, "normalized_customers?select=margin_template_id&company_id=eq.company-a&limit=20000");
  });
});

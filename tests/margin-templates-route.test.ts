import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ gate: vi.fn(), db: vi.fn() }));
vi.mock("@/lib/pricing/margin-template-gate", () => ({ marginTemplateGate: mocks.gate }));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.db }));
import { GET, POST } from "../app/api/margin-templates/route";

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

it.each([1,10,50,100])("accepts supported rounding %i through the company-scoped template API", async rounding => {
 mocks.gate.mockResolvedValue({companyId:"company-a",userId:"user-a"}); mocks.db.mockReset().mockResolvedValue([]);
 const response=await POST(new NextRequest("http://localhost/api/margin-templates",{method:"POST",body:JSON.stringify({companyId:"company-a",action:"save",id:"10000000-0000-4000-8000-000000000001",name:"합성 카탈로그",margin:10,rounding,categories:[]})}));
 expect(response.status).toBe(200);
 expect(mocks.db.mock.calls[0][0]).toContain("company_id=eq.company-a");
 expect(JSON.parse(mocks.db.mock.calls[0][1].body)).toMatchObject({rounding});
});
it("rejects unsupported template rounding before any write", async()=>{
 mocks.gate.mockResolvedValue({companyId:"company-a",userId:"user-a"}); mocks.db.mockReset();
 const response=await POST(new NextRequest("http://localhost/api/margin-templates",{method:"POST",body:JSON.stringify({companyId:"company-a",action:"save",name:"합성",margin:10,rounding:25,categories:[]})}));
 expect(response.status).toBe(400); expect(mocks.db).not.toHaveBeenCalled();
});

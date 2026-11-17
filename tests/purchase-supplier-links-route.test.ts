import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), link: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getRequestAuthScope: mocks.auth }));
vi.mock("@/domains/pricing/access", () => ({ canManagePriceSheets: () => true }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: () => true }));
vi.mock("@/lib/pricing/feature", () => ({ priceSheetsEnabled: () => true }));
vi.mock("@/lib/pricing/supplier-link-repository", () => ({ linkSupplierProducts: mocks.link }));
import { maxDuration, POST } from "../app/api/price-sheets/links/route";

const companyId = "00000000-0000-4000-8000-000000000001";
const request = () => new NextRequest("http://localhost/api/price-sheets/links", { method: "POST", body: JSON.stringify({ companyId, links: [{
  productId: "10000000-0000-4000-8000-000000000001", rawName: "합성 양파", cost: 1000, supplierName: "합성 매입처"
}] }) });

describe("매입처 연결 API", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ ok: true, companyId, customerSession: { role: "owner" } }); });
  it("Hobby 상한 안에서 60초를 선언하고 호환 응답을 돌려준다", async () => {
    mocks.link.mockResolvedValue({ linked: 1, attempted: 1 });
    expect(maxDuration).toBe(60);
    expect(await (await POST(request())).json()).toEqual({ linked: 1, attempted: 1, retryable: false });
  });
  it("DB 원문 오류를 노출하지 않고 같은 요청 재시도가 안전함을 안내한다", async () => {
    mocks.link.mockRejectedValue(new Error('Supabase request failed: 409 {"details":"secret table detail"}'));
    const response = await POST(request());
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({ linked: 0, attempted: 1, retryable: true });
    expect(body.message).not.toContain("Supabase");
    expect(body.message).not.toContain("secret");
  });
});

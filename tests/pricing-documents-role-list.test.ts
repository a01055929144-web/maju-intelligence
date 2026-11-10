import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// CC-03 (노션 11/05 높음 1): 고객 계정에서는 기존 견적서·단가표가 안 보이고 관리자 미리보기에서만 보였다.
// 원인: #261 전 목록이 작성자 키(owner_key = 회사:customer|admin:세션 식별자 해시)로 걸러져,
// 관리자 미리보기·다른 직원이 만든 문서는 고객 계정 목록에 나오지 않았다. #261부터 회사 전체 목록이다.
// 이 테스트는 API 경로 전체에서 역할·작성자와 상관없이 같은 회사 목록을 돌려주는지 지킨다.
const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn() }));
vi.mock("../lib/auth", () => ({ getRequestAuthScope: mocks.auth, getCustomerOperationalName: () => "" }));
vi.mock("../lib/feature-flags", () => ({ isFeatureEnabled: () => true }));
vi.mock("../lib/pricing/feature", () => ({ priceSheetsEnabled: () => true }));
vi.mock("../lib/store", () => ({
  getSupabaseConfig: () => ({ url: "https://synthetic.supabase.test", serviceRoleKey: "synthetic-service-role" }),
  supabaseRequest: mocks.db,
}));
import { GET } from "../app/api/pricing-documents/route";

const company = "00000000-0000-4000-8000-000000000001";
const doc = "10000000-0000-4000-8000-000000000001";
const documentRow = { id: doc, revision: 3, content: { kind: "quote", title: "관리자 미리보기에서 만든 견적서", lines: [] }, updated_at: "2026-11-07T03:09:40Z" };
const customer = (workspaceRole: string, userId: string) => ({
  ok: true, companyId: company, adminSession: null,
  customerSession: { companyId: company, role: workspaceRole === "owner" ? "owner" : "member", workspaceRole, userId },
});
const admin = { ok: true, companyId: company, customerSession: null, adminSession: { email: "admin@example.test" } };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () =>
    new Response(JSON.stringify([documentRow]), { status: 200, headers: { "content-range": "0-0/1" } })));
  mocks.db.mockReset().mockImplementation(async (path: string) => {
    if (path.startsWith("pricing_documents?")) return [{ id: doc, versions: [] }];
    throw new Error(`Unexpected request ${path}`);
  });
});
afterEach(() => vi.unstubAllGlobals());

async function list(session: unknown) {
  mocks.auth.mockResolvedValue(session);
  const response = await GET(new NextRequest(`http://localhost/api/pricing-documents?action=list&page=1&companyId=${company}`));
  return { status: response.status, body: await response.json(), url: String(vi.mocked(fetch).mock.calls.at(-1)?.[0] ?? "") };
}

describe("pricing document list by role (CC-03)", () => {
  it("shows the same company documents to owner, manager, sales and admin preview regardless of author", async () => {
    const results = [
      await list(customer("owner", "user-owner")),
      await list(customer("manager", "user-manager")),
      await list(customer("sales", "user-sales")),
      await list(admin),
    ];
    for (const result of results) {
      expect(result.status).toBe(200);
      expect(result.body.result.items.map((item: { id: string }) => item.id)).toEqual([doc]);
      expect(new URL(result.url).searchParams.get("company_id")).toBe(`eq.${company}`);
      expect(new URL(result.url).searchParams.has("owner_key")).toBe(false);
    }
    // 작성자(세션)마다 목록 조회 조건이 달라지지 않는다.
    expect(new Set(results.map((result) => result.url)).size).toBe(1);
  });

  it("still refuses roles without document access", async () => {
    const result = await list(customer("driver", "user-driver"));
    expect(result.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
});

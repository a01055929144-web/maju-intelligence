import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ db: vi.fn(), feature: vi.fn(), scope: vi.fn(), capability: vi.fn(), access: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db, canAccessAssignedCustomer: mocks.access }));
vi.mock("../lib/feature-flags", () => ({ isFeatureEnabled: mocks.feature }));
vi.mock("../lib/auth", () => ({ getRequestAuthScope: mocks.scope, scopeHasCapability: mocks.capability, getCustomerAssignmentKeys: () => [] }));
import { readOwnerMobileState, saveOwnerMobile } from "../lib/store/07-store-phone-link-company";
import { GET, PUT } from "../app/api/customers/[id]/owner-mobile/route";

const company = "00000000-0000-4000-8000-000000000001", customer = "20000000-0000-4000-8000-000000000001", notice = "30000000-0000-4000-8000-000000000001";
const ctx = { params: Promise.resolve({ id: customer }) };
const put = (body: unknown) => PUT(new NextRequest("http://localhost/api/customers/x/owner-mobile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), ctx);
const patches = () => mocks.db.mock.calls.filter(call => call[1]?.method === "PATCH");

describe("CX-146 company side: owner mobile input and notices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.feature.mockReturnValue(true); mocks.scope.mockResolvedValue({ ok: true, companyId: company }); mocks.capability.mockReturnValue(true); mocks.access.mockResolvedValue(true);
    mocks.db.mockImplementation(async (path: string) => path.startsWith("normalized_customers?select") ? [{ owner_mobile: "01011112222" }]
      : path.startsWith("store_phone_link_notices?select") ? [{ id: notice, kind: "owner_conflict", phone_last4: "2222", created_at: "2026-11-25T00:00:00Z" }] : []);
  });

  it("읽기 응답에는 뒤 4자리만(번호 원문 없음)과 알림", async () => {
    const state = await readOwnerMobileState(company, customer);
    expect(state).toEqual({ registered: true, last4: "2222", notices: [{ id: notice, kind: "owner_conflict", phoneLast4: "2222", createdAt: "2026-11-25T00:00:00Z" }] });
    expect(JSON.stringify(state)).not.toContain("0101111");
  });

  it("저장은 010 형식만(표기 달라도 정규화), 빈 값은 삭제, 잘못된 값은 쓰지 않음", async () => {
    expect(await saveOwnerMobile(company, customer, "010-1111-2222")).toBe(true);
    expect(JSON.parse(patches()[0][1].body)).toEqual({ owner_mobile: "01011112222" });
    expect(await saveOwnerMobile(company, customer, "  ")).toBe(true);
    expect(JSON.parse(patches()[1][1].body)).toEqual({ owner_mobile: null });
    expect(patches()).toHaveLength(2);
    for (const bad of ["02-123-4567", "010-111-222", 1011112222, undefined]) expect(await saveOwnerMobile(company, customer, bad)).toBe(false);
    expect(patches()).toHaveLength(2);
  });

  it("라우트: 플래그 OFF 404 · 세션 없음 401 · 권한 없음 403 · 잘못된 번호 400", async () => {
    mocks.feature.mockReturnValueOnce(false);
    expect((await GET(new NextRequest("http://localhost/x"), ctx)).status).toBe(404);
    mocks.scope.mockResolvedValueOnce({ ok: false });
    expect((await GET(new NextRequest("http://localhost/x"), ctx)).status).toBe(401);
    mocks.capability.mockReturnValueOnce(false);
    expect((await put({ ownerMobile: "010-1111-2222" })).status).toBe(403);
    expect((await put({ ownerMobile: "123" })).status).toBe(400);
    expect((await put({})).status).toBe(400);
    expect(patches()).toHaveLength(0);
  });

  it("라우트: 저장·알림 확인 처리 후 상태(뒤 4자리)만 돌려준다", async () => {
    const saved = await put({ ownerMobile: "010 1111 2222" });
    expect(saved.status).toBe(200);
    expect(JSON.stringify(await saved.json())).not.toContain("01011112222");
    const resolved = await put({ resolveNoticeId: notice });
    expect(resolved.status).toBe(200);
    const resolve = patches().find(call => String(call[0]).startsWith("store_phone_link_notices"))!;
    expect(String(resolve[0])).toContain(`company_id=eq.${company}`);
    expect(String(resolve[0])).toContain(`customer_id=eq.${customer}`);
    expect(JSON.parse(resolve[1].body)).toHaveProperty("resolved_at");
  });
});

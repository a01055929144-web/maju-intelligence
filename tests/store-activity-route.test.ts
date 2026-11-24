import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn(), capability: vi.fn(), feature: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../lib/auth", () => ({ getRequestAuthScope: mocks.auth, customerHasCapability: mocks.capability }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
vi.mock("../lib/feature-flags", () => ({ isFeatureEnabled: mocks.feature }));
vi.mock("../lib/pricing/store-portal-source-documents", () => ({ readStorePortalSourceDocuments: async () => [] }));
vi.mock("../lib/pricing/company-links", () => ({ companyLinkOverview: async () => ({ links: [] }) }));
import { GET } from "../app/api/store-activity/route";

const c1 = "00000000-0000-4000-8000-000000000001", c2 = "00000000-0000-4000-8000-000000000002", a1 = "10000000-0000-4000-8000-000000000001";
const get = (qs: string) => new NextRequest(`https://app.test/api/store-activity?${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.feature.mockReturnValue(true); mocks.capability.mockReturnValue(true);
  mocks.auth.mockResolvedValue({ ok: true, companyId: c1, customerSession: { workspaceRole: "owner" }, adminSession: null });
  mocks.db.mockImplementation(async (path: string) => path.includes("kind=eq.home")
    ? [{ occurred_at: "2026-11-24T10:00:00Z" }] : [{ kind: "order", occurred_at: "2026-11-24T10:05:00Z" }, { kind: "home", occurred_at: "2026-11-24T10:00:00Z" }]);
});

describe("CX-141 store activity API", () => {
  it("returns the last 20 events and the last home open for the caller's company only", async () => {
    const response = await GET(get(`companyId=${c2}&storeAccountId=${a1}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ lastSeenAt: "2026-11-24T10:00:00Z", events: [{ kind: "order", occurredAt: "2026-11-24T10:05:00Z" }, { kind: "home", occurredAt: "2026-11-24T10:00:00Z" }] });
    // 요청 쿼리의 다른 회사 id가 아니라 인증 범위의 회사(c1)로만 읽는다
    for (const call of mocks.db.mock.calls) expect(String(call[0])).toContain(`company_id=eq.${c1}`);
    expect(mocks.db.mock.calls.some(call => String(call[0]).includes(c2))).toBe(false);
  });
  it("is hidden when the flag is off, and denies anonymous, non-sales customers and bad ids", async () => {
    mocks.feature.mockReturnValue(false); expect((await GET(get(`storeAccountId=${a1}`))).status).toBe(404);
    expect(mocks.db).not.toHaveBeenCalled();
    mocks.feature.mockReturnValue(true);
    mocks.auth.mockResolvedValue({ ok: false }); expect((await GET(get(`storeAccountId=${a1}`))).status).toBe(401);
    mocks.auth.mockResolvedValue({ ok: true, companyId: c1, customerSession: { workspaceRole: "staff" }, adminSession: null });
    mocks.capability.mockReturnValue(false); expect((await GET(get(`storeAccountId=${a1}`))).status).toBe(403);
    expect((await GET(get("storeAccountId=nope"))).status).toBe(400);
  });
});

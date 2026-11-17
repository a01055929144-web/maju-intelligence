import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRequestAuthScope, isFeatureEnabled, supabaseRequest } = vi.hoisted(() => ({
  getRequestAuthScope: vi.fn(),
  isFeatureEnabled: vi.fn(),
  supabaseRequest: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ getRequestAuthScope }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled }));
vi.mock("@/lib/store", () => ({ supabaseRequest }));

import { POST } from "../app/api/mobile/driver-visit-materials/route";

const companyId = "11111111-1111-1111-1111-111111111111";
const memberId = "22222222-2222-2222-2222-222222222222";
const stopId = "33333333-3333-3333-3333-333333333333";

describe("CX-85 기사 방문 자료 API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequestAuthScope.mockResolvedValue({ ok: true, companyId, customerSession: { companyMemberId: memberId, name: "테스트 기사" } });
    isFeatureEnabled.mockReturnValue(true);
  });

  it("기사 member가 없으면 DB를 읽지 않는다", async () => {
    getRequestAuthScope.mockResolvedValue({ ok: true, companyId, customerSession: {} });
    const response = await POST(request({ stopId, materials: ["명함"] }));
    expect(response.status).toBe(401);
    expect(supabaseRequest).not.toHaveBeenCalled();
  });

  it("기능이 꺼져 있으면 본문과 DB에 접근하지 않는다", async () => {
    isFeatureEnabled.mockReturnValue(false);
    const response = await POST({ json: vi.fn(() => { throw new Error("본문을 읽으면 안 됨"); }) } as unknown as NextRequest);
    expect(response.status).toBe(404);
    expect(supabaseRequest).not.toHaveBeenCalled();
  });

  it("세션 회사와 배정 기사 정류장으로 제한해 기존 lead_actions에 기록한다", async () => {
    supabaseRequest
      .mockResolvedValueOnce([{ id: stopId, lead_id: "44444444-4444-4444-4444-444444444444" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "55555555-5555-5555-5555-555555555555" }]);
    const response = await POST(request({ stopId, materials: ["단가표", "명함"], memo: "반응 좋음", photoStoragePath: `${`lead-visits/${companyId}`}/photo.jpg` }));
    expect(response.status).toBe(200);
    expect(String(supabaseRequest.mock.calls[0][0])).toContain(`company_id=eq.${companyId}`);
    expect(String(supabaseRequest.mock.calls[0][0])).toContain(`driver_member_id=eq.${memberId}`);
    const insert = JSON.parse(String(supabaseRequest.mock.calls[2][1].body));
    expect(insert).toMatchObject({ company_id: companyId, action_type: "visit", result: "방문 자료 전달", collateral_types: ["단가표", "명함"] });
    expect(insert.follow_up_at).toBeTruthy();
  });

  it("다른 기사 정류장은 찾지 못한 것으로 처리한다", async () => {
    supabaseRequest.mockResolvedValueOnce([]);
    const response = await POST(request({ stopId, materials: ["명함"] }));
    expect(response.status).toBe(404);
    expect(supabaseRequest).toHaveBeenCalledTimes(1);
  });
});

function request(body: unknown) {
  return new NextRequest("https://example.test/api/mobile/driver-visit-materials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

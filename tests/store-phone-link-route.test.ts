import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ session: vi.fn(), confirm: vi.fn(), decline: vi.fn() }));
vi.mock("../lib/auth", () => ({ getStoreSession: mocks.session }));
vi.mock("../lib/store/07-store-phone-link", () => ({ confirmPhoneLink: mocks.confirm, declinePhoneLink: mocks.decline }));
import { POST } from "../app/api/store/phone-link/route";

const k1 = "20000000-0000-4000-8000-000000000001";
const post = (payload: unknown, origin: string | null = "http://localhost") => POST(new NextRequest("http://localhost/api/store/phone-link", {
  method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(payload) }));

describe("CX-146 POST /api/store/phone-link", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ authUserId: "10000000-0000-4000-8000-000000000001" });
    mocks.confirm.mockResolvedValue({ linked: [{ companyId: "c", storeAccountId: "s" }], conflicts: 1, skipped: 0 }); mocks.decline.mockResolvedValue(1); });
  it("다른 출처·세션 없음·잘못된 요청은 서버 호출 없이 거부", async () => {
    expect((await post({ action: "confirm", customerIds: [k1] }, "http://evil.test")).status).toBe(403);
    mocks.session.mockResolvedValueOnce(null);
    expect((await post({ action: "confirm", customerIds: [k1] })).status).toBe(401);
    for (const bad of [{ action: "x", customerIds: [k1] }, { action: "confirm", customerIds: [] }, { action: "confirm", customerIds: ["not-a-uuid"] }, { action: "confirm" }])
      expect((await post(bad)).status).toBe(400);
    expect(mocks.confirm).not.toHaveBeenCalled(); expect(mocks.decline).not.toHaveBeenCalled();
  });
  it("확인은 세션의 사용자로만 연결하고 응답에 번호·ID를 싣지 않는다", async () => {
    const response = await post({ action: "confirm", customerIds: [k1] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ linked: 1, conflicts: 1 });
    expect(mocks.confirm).toHaveBeenCalledWith("10000000-0000-4000-8000-000000000001", [k1]);
  });
  it("거절과 서버 오류", async () => {
    expect(await (await post({ action: "decline", customerIds: [k1] })).json()).toEqual({ declined: 1 });
    mocks.confirm.mockRejectedValueOnce(new Error("db"));
    expect((await post({ action: "confirm", customerIds: [k1] })).status).toBe(503);
  });
});

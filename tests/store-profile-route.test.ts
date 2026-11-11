import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ session: vi.fn(), create: vi.fn(), list: vi.fn(), enabled: vi.fn(() => true) }));
vi.mock("@/lib/auth", () => ({ getStoreSession: mocks.session }));
vi.mock("@/lib/store/11-store-direct-signup", () => ({
  storeDirectSignupEnabled: mocks.enabled, createStoreProfile: mocks.create, listStoreProfiles: mocks.list,
}));
import { GET, POST } from "../app/api/store/profile/route";

const sessionUser = "11111111-1111-4111-8111-111111111111";
const body = { storeName: "합성 식당", openingSoon: true, businessNumber: "", baseAddress: "서울 합성구 합성로 1", addressDetail: "", termsAccepted: true };
const post = (payload: unknown = body, origin: string | null = "http://localhost") => POST(new NextRequest("http://localhost/api/store/profile", {
  method: "POST", headers: origin ? { origin, "content-type": "application/json" } : { "content-type": "application/json" }, body: JSON.stringify(payload),
}));

describe("store direct signup profile API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
    mocks.session.mockResolvedValue({ authUserId: sessionUser });
    mocks.list.mockResolvedValue([]);
    mocks.create.mockResolvedValue({ storeProfileId: "p1", memberId: "m1" });
  });

  it("does not exist while the global switch is off", async () => {
    mocks.enabled.mockReturnValue(false);
    expect((await post()).status).toBe(404);
    expect((await GET()).status).toBe(404);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("requires a Kakao store session and the same origin", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await post()).status).toBe(401);
    expect((await GET()).status).toBe(401);
    mocks.session.mockResolvedValue({ authUserId: sessionUser });
    expect((await post(body, "https://evil.example")).status).toBe(403);
    expect((await post(body, null)).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects invalid input with the failing field and creates nothing", async () => {
    const response = await post({ ...body, storeName: "  " });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ field: "storeName" });
    expect((await post({ ...body, termsAccepted: false })).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates the profile for the session user only, ignoring a user id in the body", async () => {
    const response = await post({ ...body, authUserId: "22222222-2222-4222-8222-222222222222", userId: "x" });
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0][0]).toBe(sessionUser);
    expect(mocks.create.mock.calls[0][1]).toEqual({ storeName: "합성 식당", businessRegistrationNumber: null, baseAddress: "서울 합성구 합성로 1", addressDetail: null });
  });

  it("does not create a second store for a user who already has one", async () => {
    mocks.list.mockResolvedValue([{ id: "p1", storeName: "합성 식당" }]);
    expect((await post()).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("hides server errors behind a generic message", async () => {
    mocks.create.mockRejectedValue(new Error("secret db detail"));
    const response = await post();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
});

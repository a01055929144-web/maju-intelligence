import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({ scope: vi.fn(), proof: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getRequestAuthScope: auth.scope, getStoreOwnerActivationProof: auth.proof }));

afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Kakao address search during store owner onboarding", () => {
  it("rejects anonymous traffic and allows only a signed post-Kakao profile proof", async () => {
    vi.stubEnv("KAKAO_REST_KEY", "test-key");
    const kakao = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ documents: [{ address_name: "서울특별시 강남구 테헤란로 1", x: "127.1", y: "37.5" }] }) });
    vi.stubGlobal("fetch", kakao);
    auth.scope.mockResolvedValue({ ok: false });
    const { GET } = await import("../app/api/address-search/route");
    const request = new NextRequest("http://localhost/api/address-search?query=테헤란로");
    auth.proof.mockResolvedValueOnce(null).mockResolvedValueOnce({ stage: "kakao" }).mockResolvedValueOnce({ stage: "profile" });
    expect((await GET(request)).status).toBe(401);
    expect((await GET(request)).status).toBe(401);
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect((await response.json()).results[0].address).toBe("서울특별시 강남구 테헤란로 1");
    expect(kakao).toHaveBeenCalledOnce();
  });
});

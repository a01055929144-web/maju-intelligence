import { afterEach, describe, expect, it, vi } from "vitest";
import { searchKakaoKeywordLeads } from "../lib/kakao-keyword-leads";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("searchKakaoKeywordLeads", () => {
  it("keeps the raw Kakao category path for lead persistence", async () => {
    vi.stubEnv("KAKAO_REST_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      documents: [{
        address_name: "서울 강남구 역삼동 1",
        category_name: "음식점 > 한식 > 국밥",
        phone: "02-123-4567",
        place_name: "테스트국밥",
        road_address_name: "서울 강남구 테헤란로 1",
        x: "127.01",
        y: "37.50"
      }]
    }), { status: 200 })));

    const [candidate] = await searchKakaoKeywordLeads({ lat: 37.5, lng: 127.01 }, "한식");

    expect(candidate.kakaoCategoryName).toBe("음식점 > 한식 > 국밥");
  });
});

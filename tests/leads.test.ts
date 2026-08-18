import { describe, expect, it, vi } from "vitest";
import { enrichLeadRecommendations } from "../lib/leads";
import type { LeadRecommendation } from "../lib/analysis";

const sampleLeads: LeadRecommendation[] = [
  { name: "성수동 한식 A", region: "성수동", score: 90, reasons: ["배송반경", "예상매출", "업종 적합"], industry: "한식" },
  { name: "성수동 신규오픈 B", region: "성수동", score: 85, reasons: ["신규오픈", "White Space", "경쟁사 미확인"], industry: "한식" }
];

describe("enrichLeadRecommendations", () => {
  it("returns leads unchanged when no Kakao REST key is configured", async () => {
    const originalKey = process.env.KAKAO_REST_KEY;
    delete process.env.KAKAO_REST_KEY;

    const result = await enrichLeadRecommendations(sampleLeads, []);
    expect(result).toEqual(sampleLeads);

    if (originalKey !== undefined) process.env.KAKAO_REST_KEY = originalKey;
  });

  it("returns leads unchanged when the key is still the placeholder value", async () => {
    const originalKey = process.env.KAKAO_REST_KEY;
    process.env.KAKAO_REST_KEY = "replace-with-kakao-rest-api-key";

    const result = await enrichLeadRecommendations(sampleLeads, []);
    expect(result).toEqual(sampleLeads);

    if (originalKey === undefined) delete process.env.KAKAO_REST_KEY;
    else process.env.KAKAO_REST_KEY = originalKey;
  });

  it("returns an empty array unchanged", async () => {
    const result = await enrichLeadRecommendations([], []);
    expect(result).toEqual([]);
  });

  it("replaces a lead's name with a real, not-already-a-customer business when the API returns one", async () => {
    const originalKey = process.env.KAKAO_REST_KEY;
    process.env.KAKAO_REST_KEY = "test-key";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        documents: [
          { place_name: "성수 진짜식당", road_address_name: "서울 성동구 성수동 1가", phone: "02-1234-5678", place_url: "https://place.map.kakao.com/1" }
        ]
      })
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await enrichLeadRecommendations(sampleLeads, []);

    expect(fetchMock).toHaveBeenCalled();
    expect(result[0].name).toBe("성수 진짜식당");
    expect(result[0].reasons.some((reason) => reason.includes("서울 성동구"))).toBe(true);

    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.KAKAO_REST_KEY;
    else process.env.KAKAO_REST_KEY = originalKey;
  });

  it("excludes businesses that are already customers", async () => {
    const originalKey = process.env.KAKAO_REST_KEY;
    process.env.KAKAO_REST_KEY = "test-key";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        documents: [{ place_name: "성수 온반", road_address_name: "서울 성동구 성수동", phone: "", place_url: "" }]
      })
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await enrichLeadRecommendations(sampleLeads, ["성수 온반"]);

    expect(result[0].name).toBe(sampleLeads[0].name);

    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.KAKAO_REST_KEY;
    else process.env.KAKAO_REST_KEY = originalKey;
  });
});

import { afterEach, vi } from "vitest";
import { describe, expect, it } from "vitest";
import {
  buildKakaoPlaceSearchQueries,
  classifyNaverLocalLink,
  isAllowedKakaoPlaceCandidate,
  isKakaoPlaceCandidate,
  isNaverLocalCandidateMatch,
  kakaoNameVariants,
  placeNameScore,
  planNaverLocalLinkEnrichment,
  resolveKakaoPlace,
  selectKakaoPlaceResult
} from "../lib/place-links";

describe("네이버 지역검색 링크 A3 드라이런", () => {
  const lead = { customerName: "도야집 강남점", address: "서울특별시 강남구 테헤란로6길 45, 1층" };
  const matched = {
    title: "<b>도야집 강남점</b>",
    roadAddress: "서울 강남구 테헤란로6길 45",
    address: "서울 강남구 역삼동 1",
  };

  it("공식 지역검색 link를 인스타·네이버 블로그·홈페이지·지도 링크로 분류한다", () => {
    expect(classifyNaverLocalLink("https://www.instagram.com/doyajip/").kind).toBe("instagram");
    expect(classifyNaverLocalLink("https://blog.naver.com/doyajip").kind).toBe("naver_blog");
    expect(classifyNaverLocalLink("https://doyajip.example/menu").kind).toBe("homepage");
    expect(classifyNaverLocalLink("https://map.naver.com/p/entry/place/123").kind).toBe("naver_map");
    expect(classifyNaverLocalLink("javascript:alert(1)")).toEqual({ kind: "unsupported", url: "" });
  });

  it("상호명과 주소가 모두 일치해야 후보로 인정한다", () => {
    expect(isNaverLocalCandidateMatch(lead, matched)).toBe(true);
    expect(isNaverLocalCandidateMatch(lead, { ...matched, title: "다른 식당" })).toBe(false);
    expect(isNaverLocalCandidateMatch(lead, { ...matched, roadAddress: "서울 송파구 올림픽로 1", address: "" })).toBe(false);
  });

  it("기존 인스타는 덮어쓰지 않고 모든 제안을 쓰기 0 상태로 만든다", () => {
    expect(planNaverLocalLinkEnrichment(
      lead,
      { ...matched, link: "https://instagram.com/doyajip_new" },
      { instagramUrl: "https://instagram.com/doyajip" }
    )).toMatchObject({
      matched: true,
      kind: "instagram",
      proposedUrl: "",
      preservesExistingInstagram: true,
      writeEnabled: false
    });
    expect(planNaverLocalLinkEnrichment(
      lead,
      { ...matched, link: "https://blog.naver.com/doyajip" }
    )).toMatchObject({
      matched: true,
      kind: "naver_blog",
      proposedUrl: "https://blog.naver.com/doyajip",
      writeEnabled: false
    });
  });
});

describe("buildKakaoPlaceSearchQueries", () => {
  it("tries broad region, local detail, then name only without the full address", () => {
    expect(
      buildKakaoPlaceSearchQueries({
        address: "서울특별시 중구 남대문로1길 33 (북창동, 지상2층)",
        customerName: "(주)김삼보 북창동점"
      }).slice(0, 3)
    ).toEqual([
      { query: "(주)김삼보 북창동점 서울특별시 중구", variant: "region" },
      { query: "(주)김삼보 북창동점 중구 북창동", variant: "region_detail" },
      { query: "(주)김삼보 북창동점", variant: "name_only" }
    ]);
  });

  it("uses a road name when the address has no dong", () => {
    expect(
      buildKakaoPlaceSearchQueries({ address: "경기 의정부시 경의로 132", customerName: "101번지남산돈까스 의정부역센트럴자이점" }).slice(0, 3)
    ).toEqual([
      { query: "101번지남산돈까스 의정부역센트럴자이점 경기 의정부시", variant: "region" },
      { query: "101번지남산돈까스 의정부역센트럴자이점 의정부시 경의로", variant: "region_detail" },
      { query: "101번지남산돈까스 의정부역센트럴자이점", variant: "name_only" }
    ]);
  });
});

describe("isKakaoPlaceCandidate", () => {
  const lead = { address: "경기 의정부시 오목로225번길 30", customerName: "가장맛있는족발 민락점" };

  it("accepts a normalized-name match in the same district", () => {
    expect(
      isKakaoPlaceCandidate(lead, {
        place_name: "가장맛있는족발민락점",
        road_address_name: "경기 의정부시 오목로225번길 30"
      })
    ).toBe(true);
  });

  it("rejects a same-name store in another district", () => {
    expect(
      isKakaoPlaceCandidate(lead, {
        place_name: "가장맛있는족발 민락점",
        road_address_name: "경기 남양주시 별내중앙로 10"
      })
    ).toBe(false);
  });

  it("rejects a candidate over one kilometer away when coordinates are available", () => {
    expect(
      isKakaoPlaceCandidate(
        { ...lead, latitude: 37.738, longitude: 127.033 },
        {
          place_name: "가장맛있는족발 민락점",
          road_address_name: "경기 의정부시 오목로225번길 30",
          x: "127.100",
          y: "37.800"
        }
      )
    ).toBe(false);
  });

  it("does not accept a place that the user previously rejected", () => {
    expect(
      isAllowedKakaoPlaceCandidate(
        { ...lead, rejectedKakaoPlaceIds: ["12345"] },
        {
          id: "12345",
          place_name: "가장맛있는족발 민락점",
          road_address_name: "경기 의정부시 오목로225번길 30"
        }
      )
    ).toBe(false);
  });
});

describe("selectKakaoPlaceResult", () => {
  const fresh = {
    address: "서울 강남구 역삼동 1",
    distanceM: 100,
    documentCount: 1,
    categoryName: "음식점 > 한식",
    industry: "한식",
    matched: true,
    matchedAddress: "서울 강남구 역삼동 1",
    matchedName: "새 장소",
    phone: "02-111-2222",
    placeId: "222",
    placeUrl: "https://place.map.kakao.com/222",
    queryVariant: "region" as const
  };

  it("keeps the stored place when a retry cannot match", () => {
    const selected = selectKakaoPlaceResult({ ...fresh, matched: false, placeId: "", placeUrl: "", queryVariant: "none" }, "https://place.map.kakao.com/111");
    expect(selected.placeId).toBe("111");
    expect(selected.queryVariant).toBe("existing");
  });

  it("does not mix a different fresh place with the stored link", () => {
    const selected = selectKakaoPlaceResult(fresh, "https://place.map.kakao.com/111");
    expect(selected.placeUrl).toBe("https://place.map.kakao.com/111");
    expect(selected.placeId).toBe("111");
    expect(selected.matchedName).toBe("");
  });
});

describe("46-2⓪ 상호 정리 검색어 (가짜 상호)", () => {
  it("괄호·법인 표기·지점명·띄어쓰기 변형을 순서대로 만들고 같은 이름은 뺀다", () => {
    expect(kakaoNameVariants("(주)가짜 식당(본점) 강남점")).toEqual([
      { name: "가짜 식당 강남점", variant: "paren_stripped" },
      { name: "가짜 식당(본점) 강남점", variant: "corp_stripped" },
      { name: "가짜 식당(본점)", variant: "branch_stripped" },
      { name: "(주)가짜식당(본점)강남점", variant: "no_space" }
    ].filter((item, _i, all) => all.findIndex((o) => o.name === item.name) === all.indexOf(item)));
    expect(kakaoNameVariants("가짜식당")).toEqual([]);
  });

  it("검색어 목록에 변형이 들어가고 중복은 없다", () => {
    const queries = buildKakaoPlaceSearchQueries({ customerName: "가짜 식당 강남점" });
    expect(queries.map((q) => q.variant)).toEqual(["name_only", "branch_stripped", "no_space"]);
    expect(queries.map((q) => q.query)).toEqual(["가짜 식당 강남점", "가짜 식당", "가짜식당강남점"]);
  });

  it("상호 점수는 같으면 1, 전혀 다르면 낮다", () => {
    expect(placeNameScore("가짜식당", "(주)가짜식당")).toBe(1);
    expect(placeNameScore("가짜식당", "엉뚱카페")).toBeLessThan(0.3);
  });
});

describe("46-2⓪ resolveKakaoPlace 결과 코드 (가짜 응답)", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  const respond = (documents: unknown[]) => vi.fn(async () => ({ ok: true, json: async () => ({ documents }) }));
  const input = { customerName: "가짜식당", address: "서울 강남구 테스트로 1", latitude: 37.5, longitude: 127.0 };

  it("0건이면 not_found", async () => {
    vi.stubEnv("KAKAO_REST_KEY", "k"); vi.stubGlobal("fetch", respond([]));
    expect((await resolveKakaoPlace(input)).resultCode).toBe("not_found");
  });

  it("후보가 멀면 rejected + 이유·거리·점수 기록", async () => {
    vi.stubEnv("KAKAO_REST_KEY", "k");
    vi.stubGlobal("fetch", respond([{ id: "1", place_name: "가짜식당", road_address_name: "서울 강남구 먼길 9", x: "127.1", y: "37.6" }]));
    const result = await resolveKakaoPlace(input);
    expect(result).toMatchObject({ resultCode: "rejected", rejectReason: "distance_exceeded", nameScore: 1 });
    expect(result.rejectedDistanceM).toBeGreaterThan(1000);
  });

  it("상호가 다르면 name_mismatch", async () => {
    vi.stubEnv("KAKAO_REST_KEY", "k");
    vi.stubGlobal("fetch", respond([{ id: "2", place_name: "엉뚱카페", road_address_name: "서울 강남구 가짜길 1" }]));
    expect(await resolveKakaoPlace(input)).toMatchObject({ resultCode: "rejected", rejectReason: "name_mismatch" });
  });

  it("맞는 후보는 linked, 호출이 모두 실패하면 error", async () => {
    vi.stubEnv("KAKAO_REST_KEY", "k");
    vi.stubGlobal("fetch", respond([{ id: "3", place_name: "가짜식당", road_address_name: "서울 강남구 가짜길 1", x: "127.0", y: "37.5" }]));
    expect(await resolveKakaoPlace(input)).toMatchObject({ resultCode: "linked", matched: true });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    expect((await resolveKakaoPlace(input)).resultCode).toBe("error");
  });
});

import { describe, expect, it } from "vitest";
import { buildKakaoPlaceSearchQueries, isAllowedKakaoPlaceCandidate, isKakaoPlaceCandidate, selectKakaoPlaceResult } from "../lib/place-links";

describe("buildKakaoPlaceSearchQueries", () => {
  it("tries broad region, local detail, then name only without the full address", () => {
    expect(
      buildKakaoPlaceSearchQueries({
        address: "서울특별시 중구 남대문로1길 33 (북창동, 지상2층)",
        customerName: "(주)김삼보 북창동점"
      })
    ).toEqual([
      { query: "(주)김삼보 북창동점 서울특별시 중구", variant: "region" },
      { query: "(주)김삼보 북창동점 중구 북창동", variant: "region_detail" },
      { query: "(주)김삼보 북창동점", variant: "name_only" }
    ]);
  });

  it("uses a road name when the address has no dong", () => {
    expect(
      buildKakaoPlaceSearchQueries({ address: "경기 의정부시 경의로 132", customerName: "101번지남산돈까스 의정부역센트럴자이점" })
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

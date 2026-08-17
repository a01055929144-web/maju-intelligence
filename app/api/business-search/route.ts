import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type KakaoKeywordDocument = {
  address_name?: string;
  category_name?: string;
  id?: string;
  phone?: string;
  place_name?: string;
  place_url?: string;
  road_address_name?: string;
};

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query")?.trim();
  const kakaoRestKey = process.env.KAKAO_REST_KEY;

  if (!query || query.length < 2) {
    return NextResponse.json({ message: "거래처명을 2글자 이상 입력하세요.", results: [] }, { status: 400 });
  }

  if (!kakaoRestKey || kakaoRestKey === "replace-with-kakao-rest-api-key") {
    return NextResponse.json({ message: "KAKAO_REST_KEY가 설정되지 않았습니다.", results: [] }, { status: 503 });
  }

  const response = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=10`, {
    headers: {
      Authorization: `KakaoAK ${kakaoRestKey}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text();
    return NextResponse.json({ message: `카카오 매장 검색 실패: ${message}`, results: [] }, { status: response.status });
  }

  const payload = (await response.json()) as { documents?: KakaoKeywordDocument[] };
  const results = (payload.documents || [])
    .map((item) => {
      const placeUrl = item.place_url || (item.id ? `https://place.map.kakao.com/${item.id}` : "");
      // category_name은 "음식점 > 곱창,막창 > 곱창전골" 형태라 가장 구체적인 마지막 구간만 업종으로 사용합니다.
      const industry = item.category_name?.split(">").map((part) => part.trim()).filter(Boolean).pop() || "";

      return {
        address: item.address_name || "",
        industry,
        kakaoPlaceUrl: placeUrl,
        name: item.place_name || "",
        phone: item.phone?.trim() || "",
        roadAddress: item.road_address_name || ""
      };
    })
    .filter((item) => item.name);

  return NextResponse.json({ results });
}

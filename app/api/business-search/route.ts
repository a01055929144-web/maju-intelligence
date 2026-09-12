import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { normalizeKakaoCategoryIndustry } from "@/lib/leads";

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
  // 로그인한 사용자만 카카오 검색 API 쿼터를 소모하도록 제한합니다(비로그인 직접 호출 방지).
  const scope = await getRequestAuthScope(request);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized", results: [] }, { status: 401 });

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
      // category_name은 "음식점 > 곱창,막창 > 곱창전골" 형태라 가장 구체적인 마지막 구간을 우선 쓰되,
      // 이건 카카오 자체의 업소 유형 분류라 우리 업종 taxonomy와 다를 수 있어(예: "맥주,호프")
      // normalizeKakaoCategoryIndustry로 기존 버킷에 맞춥니다(2026-09-12, "업종 필터에 한식이
      // 나와야 하는데 맥주,호프가 나온다" 피드백 — 헤즈업 강남점 사례). 담당자가 등록 화면에서
      // 이 값을 여전히 직접 수정할 수 있으니, 정규화는 어디까지나 더 나은 기본값을 주는 것입니다.
      const rawCategoryLeaf = item.category_name?.split(">").map((part) => part.trim()).filter(Boolean).pop() || "";
      const industry = normalizeKakaoCategoryIndustry(rawCategoryLeaf);

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

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type KakaoAddressDocument = {
  address?: {
    b_code?: string;
    main_address_no?: string;
    region_1depth_name?: string;
    region_2depth_name?: string;
    region_3depth_name?: string;
    sub_address_no?: string;
  } | null;
  address_name: string;
  road_address?: {
    address_name?: string;
    building_name?: string;
    main_building_no?: string;
    region_1depth_name?: string;
    region_2depth_name?: string;
    region_3depth_name?: string;
    road_name?: string;
    sub_building_no?: string;
    underground_yn?: string;
    zone_no?: string;
  } | null;
  x: string;
  y: string;
};

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query")?.trim();
  const kakaoRestKey = process.env.KAKAO_REST_KEY;

  if (!query || query.length < 2) {
    return NextResponse.json({ message: "주소 검색어를 2글자 이상 입력하세요.", results: [] }, { status: 400 });
  }

  if (!kakaoRestKey) {
    return NextResponse.json({ message: "KAKAO_REST_KEY가 설정되지 않았습니다.", results: [] }, { status: 503 });
  }

  const response = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}&size=10`, {
    headers: {
      Authorization: `KakaoAK ${kakaoRestKey}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text();
    return NextResponse.json({ message: `카카오 주소 검색 실패: ${message}`, results: [] }, { status: response.status });
  }

  const payload = (await response.json()) as { documents?: KakaoAddressDocument[] };
  const results = (payload.documents || []).map((item) => {
    const roadAddress = item.road_address?.address_name || "";
    const jibunAddress = item.address_name || "";
    const region2 = item.road_address?.region_2depth_name || item.address?.region_2depth_name || "";
    const region3 = item.road_address?.region_3depth_name || item.address?.region_3depth_name || "";

    return {
      address: roadAddress || jibunAddress,
      buildingName: item.road_address?.building_name || "",
      jibunAddress,
      latitude: Number(item.y),
      longitude: Number(item.x),
      postalCode: item.road_address?.zone_no || "",
      region: region3 || region2,
      roadAddress
    };
  });

  return NextResponse.json({ results });
}

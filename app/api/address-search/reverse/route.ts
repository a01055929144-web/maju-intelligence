import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const latitude = Number(request.nextUrl.searchParams.get("lat"));
  const longitude = Number(request.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ message: "지도 중심 좌표가 올바르지 않습니다." }, { status: 400 });
  }
  const key = process.env.KAKAO_REST_KEY?.trim();
  if (!key) return NextResponse.json({ message: "지도 지역 확인을 사용할 수 없습니다." }, { status: 503 });
  const url = new URL("https://dapi.kakao.com/v2/local/geo/coord2regioncode.json");
  url.searchParams.set("x", String(longitude));
  url.searchParams.set("y", String(latitude));
  const response = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` }, cache: "no-store" });
  if (!response.ok) return NextResponse.json({ message: "지도 중심의 행정구역을 확인하지 못했습니다." }, { status: response.status });
  const payload = await response.json() as { documents?: Array<{ region_1depth_name?: string; region_2depth_name?: string; region_type?: string }> };
  const region = payload.documents?.find((item) => item.region_type === "H") || payload.documents?.[0];
  const administrativeArea = [region?.region_1depth_name, region?.region_2depth_name].filter(Boolean).join(" ");
  if (!administrativeArea) return NextResponse.json({ message: "지도 중심의 시·군·구를 찾지 못했습니다." }, { status: 404 });
  return NextResponse.json({ administrativeArea });
}

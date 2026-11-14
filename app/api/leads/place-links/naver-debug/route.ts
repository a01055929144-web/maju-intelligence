import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { searchNaverLocal } from "@/lib/place-links";

// 네이버 API HUB 지역 검색 진단(관리자 전용). 키 값은 응답에 넣지 않고 설정 여부·상태코드·결과 코드만 돌려준다.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ message: "Not found" }, { status: 404 });
  const query = new URL(request.url).searchParams.get("query")?.trim().slice(0, 80) || "스타벅스 강남";
  const { configured, result, status, link } = await searchNaverLocal(query);
  return NextResponse.json({ configured, result, status, hasMapLink: Boolean(link) });
}

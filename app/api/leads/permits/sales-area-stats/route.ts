import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { KOREAN_ADMINISTRATIVE_AREAS } from "@/lib/korean-administrative-areas";
import { getCompanySalesAreaMapStats } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const province = request.nextUrl.searchParams.get("province") || "";
  if (!KOREAN_ADMINISTRATIVE_AREAS[province]) {
    return NextResponse.json({ message: "지원하지 않는 시·도입니다." }, { status: 400 });
  }
  const stats = await getCompanySalesAreaMapStats(scope.companyId!, province);
  return NextResponse.json(
    { province, stats },
    { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" } }
  );
}

import { NextRequest, NextResponse } from "next/server";
import { parseLeadFavoriteIds } from "@/domains/lead/lead-favorite";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { leadFavoriteRepository, leadFavoritesEnabled } from "@/lib/lead-favorites";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_customers")) return NextResponse.json({ message: "리드 즐겨찾기를 볼 권한이 없습니다." }, { status: 403 });
  if (!leadFavoritesEnabled(scope.companyId)) return NextResponse.json({ message: "Not found" }, { status: 404 });

  try {
    const leadIds = parseLeadFavoriteIds(request.nextUrl.searchParams.getAll("leadId"));
    const favorites = await leadFavoriteRepository.getMany(scope.companyId, leadIds);
    return NextResponse.json({ favorites });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "리드 ID를 확인해 주세요." }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { setLeadFavorite } from "@/application/lead/set-lead-favorite";
import { getCustomerOperationalName, getRequestAuthScope } from "@/lib/auth";
import { leadFavoriteRepository, leadFavoritesEnabled } from "@/lib/lead-favorites";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null) as { companyId?: string; starred?: unknown } | null;
  if (!body || typeof body.starred !== "boolean") {
    return NextResponse.json({ message: "starred 값이 필요합니다." }, { status: 400 });
  }
  const scope = await getRequestAuthScope(request, body.companyId);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!leadFavoritesEnabled(scope.companyId)) return NextResponse.json({ message: "Not found" }, { status: 404 });

  const { id: leadId } = await context.params;
  const actor = scope.customerSession || scope.adminSession;
  const actorName = scope.customerSession
    ? getCustomerOperationalName(scope.customerSession)
    : scope.adminSession?.name?.trim() || scope.adminSession?.email?.trim() || "MAJU 관리자";

  try {
    const favorite = await setLeadFavorite(leadFavoriteRepository, {
      actorName,
      actorUserId: actor?.userId || null,
      companyId: scope.companyId,
      leadId,
      starred: body.starred
    });
    return NextResponse.json({ favorite });
  } catch (error) {
    const message = error instanceof Error ? error.message : "즐겨찾기를 저장하지 못했습니다.";
    if (message.includes("lead_not_found")) return NextResponse.json({ message: "리드를 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ message }, { status: 500 });
  }
}

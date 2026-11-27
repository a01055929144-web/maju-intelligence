import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { isMapFilterPersistenceEnabled, isSalesAreaDeliverySyncEnabled } from "@/lib/feature-modules";
import {
  getSalesAreaDeliverySyncStatus,
  setSalesAreaDeliveryDisabled,
  syncSalesAreasToDefaultDeliveryTerritory
} from "@/lib/store/08-sales-area-delivery-sync";
import {
  addCompanyLeadSearchRegion,
  countCompanyLeadsInAdministrativeArea,
  getCompanyLeadSearchRegions,
  getCompanySalesAreaRecommendations,
  getCompanySalesAreaState,
  removeCompanyLeadSearchRegion
} from "@/lib/store";

export const dynamic = "force-dynamic";

// GET: 고객사가 등록한 "영업리드 확장 탐색 지역" 목록을 반환합니다.
export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const expansionCandidateEnabled = isMapFilterPersistenceEnabled();
  const deliverySyncEnabled = isSalesAreaDeliverySyncEnabled(scope.companyId);
  const [regions, expansionCandidateRegions, salesAreaState, recommendations, deliverySync] = await Promise.all([
    getCompanyLeadSearchRegions(scope.companyId!, "assigned").catch(() => []),
    expansionCandidateEnabled ? getCompanyLeadSearchRegions(scope.companyId!, "expansion_candidate").catch(() => []) : Promise.resolve([]),
    getCompanySalesAreaState(scope.companyId!).catch(() => ({ defaultAreas: [], effectiveAreas: [], explicitAreas: [], source: "none" as const, unrecognizedRegions: [] })),
    getCompanySalesAreaRecommendations(scope.companyId!).catch(() => []),
    deliverySyncEnabled ? getSalesAreaDeliverySyncStatus(scope.companyId!).catch(() => null) : Promise.resolve(null)
  ]);
  return NextResponse.json({ canManage: scopeHasCapability(scope, "manage_customers") || scopeHasCapability(scope, "manage_company"), deliverySync, deliverySyncEnabled, expansionCandidateEnabled, expansionCandidateRegions, recommendations, regions, salesAreaState });
}

// POST: 새 탐색 지역을 추가합니다(지역명을 카카오 키워드 검색으로 좌표화해 저장).
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { areaKind?: string; companyId?: string; label?: string } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_customers") && !scopeHasCapability(scope, "manage_company")) {
    return NextResponse.json({ message: "탐색 지역을 추가할 권한이 없습니다." }, { status: 403 });
  }
  if (!body?.label?.trim()) {
    return NextResponse.json({ message: "지역명을 입력해주세요." }, { status: 400 });
  }

  try {
    const areaKind = body.areaKind === "expansion_candidate" ? "expansion_candidate" : "assigned";
    if (areaKind === "expansion_candidate" && !isMapFilterPersistenceEnabled()) {
      return NextResponse.json({ message: "영업 필요 지역 기능은 서버 검증 전까지 비활성화되어 있습니다." }, { status: 404 });
    }
    const region = await addCompanyLeadSearchRegion(scope.companyId!, body.label, areaKind);
    const deliverySync = areaKind === "assigned" && isSalesAreaDeliverySyncEnabled(scope.companyId)
      ? await syncSalesAreasToDefaultDeliveryTerritory(scope.companyId!).catch(() => null)
      : null;
    const existingLeadCount = await countCompanyLeadsInAdministrativeArea(scope.companyId!, body.label);
    return NextResponse.json({ deliverySync, existingLeadCount, region });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "지역 추가에 실패했습니다." }, { status: 400 });
  }
}

// DELETE: 탐색 지역을 삭제합니다.
export async function DELETE(request: NextRequest) {
  const regionId = request.nextUrl.searchParams.get("id") || "";
  const scope = await getRequestAuthScope(request, request.nextUrl.searchParams.get("companyId") || undefined);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_customers") && !scopeHasCapability(scope, "manage_company")) {
    return NextResponse.json({ message: "탐색 지역을 삭제할 권한이 없습니다." }, { status: 403 });
  }
  if (!regionId) return NextResponse.json({ message: "삭제할 지역 ID가 필요합니다." }, { status: 400 });

  await removeCompanyLeadSearchRegion(scope.companyId!, regionId);
  const deliverySync = isSalesAreaDeliverySyncEnabled(scope.companyId)
    ? await syncSalesAreasToDefaultDeliveryTerritory(scope.companyId!).catch(() => null)
    : null;
  return NextResponse.json({ deliverySync, ok: true });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; deliveryDisabled?: boolean; id?: string } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!scopeHasCapability(scope, "manage_customers") && !scopeHasCapability(scope, "manage_company")) {
    return NextResponse.json({ message: "배송 여부를 변경할 권한이 없습니다." }, { status: 403 });
  }
  if (!isSalesAreaDeliverySyncEnabled(scope.companyId)) {
    return NextResponse.json({ message: "영업 지역 배송 연동 기능이 비활성화되어 있습니다." }, { status: 404 });
  }
  if (!body?.id || typeof body.deliveryDisabled !== "boolean") {
    return NextResponse.json({ message: "지역 ID와 배송 여부가 필요합니다." }, { status: 400 });
  }

  try {
    const deliverySync = await setSalesAreaDeliveryDisabled(scope.companyId!, body.id, body.deliveryDisabled);
    return NextResponse.json({ deliverySync, ok: true });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "배송 여부를 변경하지 못했습니다." }, { status: 400 });
  }
}

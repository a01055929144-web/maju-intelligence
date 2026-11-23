import { NextRequest, NextResponse } from "next/server";
import { isValidKoreanCoordinate } from "@/domains/customer/coordinates";
import { getCustomerAssignmentKeys, getCustomerOperationalName, getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { areManualCustomerCoordinatesEnabled } from "@/lib/feature-modules";
import { canAccessAssignedCustomer, supabaseRequest } from "@/lib/store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!areManualCustomerCoordinatesEnabled(scope.companyId)) {
    return NextResponse.json({ message: "거래처 위치 직접 지정 기능은 아직 활성화되지 않았습니다." }, { status: 404 });
  }
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "거래처 위치를 수정할 권한이 없습니다." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { customerId?: unknown; lat?: unknown; lng?: unknown; requestId?: unknown } | null;
  if (!body || typeof body.customerId !== "string" || !UUID.test(body.customerId)
    || typeof body.requestId !== "string" || !body.requestId.trim() || body.requestId.trim().length > 120
    || !isValidKoreanCoordinate(body.lat, body.lng)) {
    return NextResponse.json({ message: "거래처와 위치 값을 확인해 주세요." }, { status: 400 });
  }
  if (!await canAccessAssignedCustomer(scope.companyId, body.customerId, getCustomerAssignmentKeys(scope.customerSession))) {
    return NextResponse.json({ message: "담당 거래처의 위치만 수정할 수 있습니다." }, { status: 403 });
  }

  const result = await supabaseRequest<{ alreadyApplied: boolean; customerId: string; geocodeAccuracy: "manual"; lat: number; lng: number }>(
    "rpc/set_customer_manual_coordinate_atomic",
    {
      method: "POST",
      body: JSON.stringify({
        p_actor_name: getCustomerOperationalName(scope.customerSession) || scope.adminSession?.name || "담당자",
        p_actor_user_id: scope.customerSession?.userId && UUID.test(scope.customerSession.userId) ? scope.customerSession.userId : null,
        p_company_id: scope.companyId,
        p_customer_id: body.customerId,
        p_latitude: body.lat,
        p_longitude: body.lng,
        p_request_key: body.requestId.trim()
      })
    }
  );
  return NextResponse.json({ coordinate: result });
}

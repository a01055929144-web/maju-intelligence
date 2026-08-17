import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { RELATIONSHIP_STATUS_ACTIVE, RELATIONSHIP_STATUS_TERMINATED, setCustomerRelationshipStatus } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * 거래처의 "거래중/거래종료" 상태를 수동으로 바꾸는 전용 엔드포인트입니다. 일반 거래처 저장
 * (/api/customers)과 분리한 이유는 lib/store.ts의 setCustomerRelationshipStatus() 주석 참고 —
 * 이 컬럼이 아직 없는 환경에서도 나머지 거래처 저장 기능이 함께 깨지지 않도록 하기 위함입니다.
 */
export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; customerId?: string; status?: string; note?: string } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);

  if (!scope.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_customers")) {
    return NextResponse.json({ message: "거래처 정보를 등록·수정할 권한이 없습니다." }, { status: 403 });
  }
  if (!body?.customerId) {
    return NextResponse.json({ message: "거래처 id가 필요합니다." }, { status: 400 });
  }
  if (body.status !== RELATIONSHIP_STATUS_ACTIVE && body.status !== RELATIONSHIP_STATUS_TERMINATED) {
    return NextResponse.json({ message: `status는 "${RELATIONSHIP_STATUS_ACTIVE}" 또는 "${RELATIONSHIP_STATUS_TERMINATED}"여야 합니다.` }, { status: 400 });
  }

  try {
    const result = await setCustomerRelationshipStatus(scope.companyId, body.customerId, body.status, body.note);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "거래 상태 저장에 실패했습니다." }, { status: 500 });
  }
}

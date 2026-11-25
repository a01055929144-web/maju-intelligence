import { NextRequest, NextResponse } from "next/server";
import { getCustomerAssignmentKeys, getRequestAuthScope } from "@/lib/auth";
import { canAccessAssignedCustomer } from "@/lib/store";
import { readStoreOrderStatus } from "@/lib/pricing/store-order-status";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// CX-145 P1-3: 고객사 직원이 거래처 상세에서 "이 매장은 왜 주문이 안 되는지"를 본다(읽기 전용, 담당 거래처만).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await getRequestAuthScope(request);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!UUID.test(id)) return NextResponse.json({ message: "요청을 확인해 주세요." }, { status: 400 });
  if (!(await canAccessAssignedCustomer(scope.companyId, id, getCustomerAssignmentKeys(scope.customerSession))))
    return NextResponse.json({ message: "담당 거래처에만 접근할 수 있습니다." }, { status: 403 });
  try {
    return NextResponse.json(await readStoreOrderStatus(scope.companyId, id), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "주문 가능 여부를 확인하지 못했습니다." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

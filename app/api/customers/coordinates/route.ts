import { NextRequest, NextResponse } from "next/server";
import { getCustomerAssignmentKeys, getRequestAuthScope } from "@/lib/auth";
import { isValidKoreanCoordinate } from "@/domains/customer/coordinates";
import { canAccessAssignedCustomer, saveCustomerCoordinates } from "@/lib/store";

export const dynamic = "force-dynamic";

const MAX_ENTRIES = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 48-5: 지도가 브라우저에서 정확히 찾은(exact) 거래처 좌표를 저장한다. 근사·손으로 지정은 이 경로로 받지 않는다.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { companyId?: string; entries?: Array<{ address?: unknown; customerId?: unknown; lat?: unknown; lng?: unknown }> } | null;
  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!Array.isArray(body?.entries) || body.entries.length > MAX_ENTRIES) {
    return NextResponse.json({ message: `entries는 ${MAX_ENTRIES}개 이하 배열이어야 합니다.` }, { status: 400 });
  }
  const entries = body.entries.flatMap((entry) => {
    const address = typeof entry.address === "string" ? entry.address.trim() : "";
    if (typeof entry.customerId !== "string" || !UUID.test(entry.customerId) || !address || address.length > 300) return [];
    if (!isValidKoreanCoordinate(entry.lat, entry.lng) || typeof entry.lng !== "number") return [];
    return [{ accuracy: "exact", address, customerId: entry.customerId, lat: entry.lat as number, lng: entry.lng }];
  });
  // 담당 범위가 있는 직원은 자기 담당 거래처 좌표만 저장할 수 있다.
  const assignmentKeys = getCustomerAssignmentKeys(scope.customerSession);
  const allowed = assignmentKeys
    ? (await Promise.all(entries.map(async (entry) => ((await canAccessAssignedCustomer(scope.companyId, entry.customerId, assignmentKeys)) ? entry : null)))).filter((entry) => entry !== null)
    : entries;
  const result = await saveCustomerCoordinates(scope.companyId, allowed);
  return NextResponse.json({ received: body.entries.length, saved: result.saved });
}

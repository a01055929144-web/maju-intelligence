import { NextRequest, NextResponse } from "next/server";
import { groupStopPhotos, type PhotoRow } from "@/domains/delivery/stop-photo-groups";
import { getCustomerAssignmentKeys, getRequestAuthScope } from "@/lib/auth";
import { canAccessAssignedCustomer, createCustomerAttachmentSignedUrl, isProductionStoreConfigured, supabaseRequest } from "@/lib/store";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, private, max-age=0" };
const q = encodeURIComponent;

// CC-63: 거래처의 최근 배송 5회 정류장 사진(delivery_route_stop_photos). 읽기 전용 · 회사/담당 범위 검사 · 짧은(10분) 서명 주소.
// shortcut: 저장 경로가 거래처 첨부와 같은 비공개 버킷이라고 가정한다(서명 실패한 사진은 건너뜀). 다른 버킷을 쓰게 되면 여기만 바꾼다.
export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok || !scope.companyId) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const customerId = request.nextUrl.searchParams.get("customerId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(customerId)) return NextResponse.json({ message: "거래처를 확인해 주세요." }, { status: 400 });
  if (!(await canAccessAssignedCustomer(scope.companyId, customerId, getCustomerAssignmentKeys(scope.customerSession)))) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  if (!isProductionStoreConfigured()) return NextResponse.json({ groups: [] }, { headers: noStore });
  try {
    const stops = await supabaseRequest<Array<{ id: string; route_date: string }>>(`delivery_route_stops?select=id,route_date&company_id=eq.${q(scope.companyId)}&customer_id=eq.${q(customerId)}&stop_type=eq.delivery&order=route_date.desc&limit=5`);
    if (!stops.length) return NextResponse.json({ groups: [] }, { headers: noStore });
    const rows = await supabaseRequest<Array<{ id: string; stop_id: string; order_id: string | null; sort_order: number; storage_path: string }>>(`delivery_route_stop_photos?select=id,stop_id,order_id,sort_order,storage_path&company_id=eq.${q(scope.companyId)}&stop_id=in.(${stops.map((s) => s.id).join(",")})&order=sort_order.asc&limit=100`);
    const signed = await Promise.all(rows.map(async (row): Promise<PhotoRow | null> => {
      const segments = row.storage_path.split("/");
      if (segments[0] !== scope.companyId || segments.some((s) => s === "" || s === "." || s === "..")) return null;
      const url = await createCustomerAttachmentSignedUrl(row.storage_path, 600).catch(() => "");
      return url ? { id: row.id, stopId: row.stop_id, orderId: row.order_id, sortOrder: row.sort_order, url } : null;
    }));
    return NextResponse.json({ groups: groupStopPhotos(stops.map((s) => ({ id: s.id, routeDate: s.route_date })), signed.filter((p): p is PhotoRow => p !== null)) }, { headers: noStore });
  } catch {
    return NextResponse.json({ message: "배송 사진을 불러오지 못했습니다." }, { headers: noStore, status: 503 });
  }
}

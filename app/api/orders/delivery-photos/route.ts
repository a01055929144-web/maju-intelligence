import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { createCustomerAttachmentSignedUrl, supabaseRequest } from "@/lib/store";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, private, max-age=0" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok || !scope.companyId || !scope.customerSession) return NextResponse.json({ message: "Unauthorized" }, { status: 401, headers: noStore });
  if (!isFeatureEnabled("DELIVERY_ORDER_PHOTOS", scope.companyId)) return NextResponse.json({ message: "기능이 열리지 않았습니다." }, { status: 404, headers: noStore });
  const orderId = request.nextUrl.searchParams.get("orderId") ?? "";
  if (!uuid.test(orderId)) return NextResponse.json({ message: "주문을 확인해 주세요." }, { status: 400, headers: noStore });
  const company = encodeURIComponent(scope.companyId), order = encodeURIComponent(orderId);
  const owned = await supabaseRequest<Array<{ id: string }>>(`store_orders?select=id&company_id=eq.${company}&id=eq.${order}&limit=1`);
  if (!owned.length) return NextResponse.json({ message: "주문을 찾지 못했습니다." }, { status: 404, headers: noStore });
  const rows = await supabaseRequest<Array<{ id: string; storage_path: string; sort_order: number }>>(
    `delivery_route_stop_photos?select=id,storage_path,sort_order&company_id=eq.${company}&order_id=eq.${order}&order=sort_order.asc&limit=5`,
  );
  const photos = await signPhotos(scope.companyId, rows);
  return NextResponse.json({ photos }, { headers: noStore });
}

async function signPhotos(companyId: string, rows: Array<{ id: string; storage_path: string; sort_order: number }>) {
  const signed = await Promise.all(rows.map(async row => {
    const segments = row.storage_path.split("/");
    if (segments[0] !== companyId || segments.some(segment => !segment || segment === "." || segment === "..")) return null;
    const url = await createCustomerAttachmentSignedUrl(row.storage_path, 600).catch(() => "");
    return url ? { id: row.id, sortOrder: row.sort_order, url } : null;
  }));
  return signed.filter((photo): photo is { id: string; sortOrder: number; url: string } => photo !== null);
}

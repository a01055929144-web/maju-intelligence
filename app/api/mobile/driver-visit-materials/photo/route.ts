import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { supabaseRequest, uploadLeadVisitPhoto } from "@/lib/store";

export const dynamic = "force-dynamic";
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const q = encodeURIComponent;

export async function POST(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok || !scope.companyId || !scope.customerSession?.companyMemberId || !scope.customerSession.duties?.includes("delivery")) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!isFeatureEnabled("LEAD_VISIT_MATERIALS", scope.companyId)) {
    return NextResponse.json({ message: "기능이 열리지 않았습니다." }, { status: 404 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  const stopId = String(form?.get("stopId") || "");
  if (!(file instanceof File) || !/^[0-9a-f-]{36}$/i.test(stopId)) return NextResponse.json({ message: "사진과 영업 정류장이 필요합니다." }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ message: "JPG, PNG, WEBP, HEIC 사진만 업로드할 수 있습니다." }, { status: 415 });
  if (file.size <= 0 || file.size > MAX_PHOTO_BYTES) return NextResponse.json({ message: "사진은 8MB 이하만 업로드할 수 있습니다." }, { status: 413 });

  const company = q(scope.companyId);
  const [stop] = await supabaseRequest<Array<{ id: string }>>(`delivery_route_stops?select=id&id=eq.${q(stopId)}&company_id=eq.${company}&driver_member_id=eq.${q(scope.customerSession.companyMemberId)}&stop_type=eq.sales&limit=1`).catch(() => []);
  if (!stop) return NextResponse.json({ message: "사진을 올릴 영업 정류장을 찾지 못했습니다." }, { status: 404 });

  try {
    const storagePath = await uploadLeadVisitPhoto({ bytes: await file.arrayBuffer(), companyId: scope.companyId, contentType: file.type, filename: file.name, stopId });
    return NextResponse.json({ storagePath });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "방문 사진을 저장하지 못했습니다." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { supabaseRequest } from "@/lib/store";
import { isStoreAccessPasswordReadEnabled } from "@/lib/store/07-store-access-password-feature";

export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json({ message: "같은 화면에서 다시 시도해 주세요." }, { status: 403 });

  const auth = await getRequestAuthScope(request);
  const userId = auth.ok ? auth.customerSession?.userId : undefined;
  if (!auth.ok || !auth.companyId || !userId)
    return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!isStoreAccessPasswordReadEnabled(auth.companyId))
    return NextResponse.json({ message: "기능이 열리지 않았습니다." }, { status: 404 });

  const body = await request.json().catch(() => null) as {
    routeStopId?: unknown;
    storeProfileId?: unknown;
  } | null;
  const storeProfileId = typeof body?.storeProfileId === "string" ? body.storeProfileId : "";
  const routeStopId = typeof body?.routeStopId === "string" ? body.routeStopId : null;
  if (!uuid.test(storeProfileId) || (routeStopId !== null && !uuid.test(routeStopId)))
    return NextResponse.json({ message: "매장과 배송 정류장을 다시 확인해 주세요." }, { status: 400 });

  try {
    const accessPassword = await supabaseRequest<string | null>("rpc/read_store_access_password_v1", {
      method: "POST",
      body: JSON.stringify({
        p_actor_user: userId,
        p_company: auth.companyId,
        p_route_stop: routeStopId,
        p_store_profile: storeProfileId,
      }),
    });
    return NextResponse.json({ accessPassword }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "출입 정보를 확인할 권한이 없습니다." }, { status: 403 });
  }
}

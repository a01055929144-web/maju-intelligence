import { NextRequest, NextResponse } from "next/server";
import { getCustomerSession, getRequestAuthScope } from "@/lib/auth";
import { getDeliveryCompletionEvents, getStaffLocationEvents, getStaffVehicleLocations, upsertStaffMobileLocation } from "@/lib/store";

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok || !scope.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const locations = await getStaffVehicleLocations(scope.companyId);
    const includeEvents = request.nextUrl.searchParams.get("events") === "true";
    const events = includeEvents
      ? await getStaffLocationEvents(scope.companyId, {
          hours: Number(request.nextUrl.searchParams.get("hours")) || 12,
          userId: request.nextUrl.searchParams.get("userId") || undefined
        })
      : undefined;
    const includeCompletions = request.nextUrl.searchParams.get("completions") === "true";
    const completions = includeCompletions
      ? await getDeliveryCompletionEvents(scope.companyId, {
          deliveryVehicle: request.nextUrl.searchParams.get("deliveryVehicle") || undefined,
          driverName: request.nextUrl.searchParams.get("driverName") || undefined,
          hours: Number(request.nextUrl.searchParams.get("hours")) || 12
        })
      : undefined;
    return NextResponse.json({ completions, events, locations });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "차량 위치를 불러오지 못했습니다." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getCustomerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.userId) {
    return NextResponse.json({ error: "실제 직원 계정으로 로그인해야 위치를 저장할 수 있습니다." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "유효한 위치 좌표가 필요합니다." }, { status: 400 });
  }
  const status = body?.status === "paused" || body?.status === "offline" ? body.status : "active";

  try {
    const result = await upsertStaffMobileLocation({
      accuracyMeters: Number.isFinite(Number(body?.accuracyMeters)) ? Number(body.accuracyMeters) : undefined,
      companyId: session.companyId,
      currentCustomerId: typeof body?.currentCustomerId === "string" ? body.currentCustomerId : undefined,
      deliveryVehicle: typeof body?.deliveryVehicle === "string" ? body.deliveryVehicle : undefined,
      driverName: session.name,
      lat,
      lng,
      status,
      userAgent: request.headers.get("user-agent") || undefined,
      userId: session.userId
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "모바일 위치를 저장하지 못했습니다." }, { status: 400 });
  }
}

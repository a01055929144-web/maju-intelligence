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
      // 2026-09-12 버그 수정("라이브 차량도 이름이 안맞아"): 종전에는 session.name(카카오/네이버/구글
      // 로그인 닉네임 — 언제든 바뀔 수 있고, 닉네임이 없으면 "개인 사용자"로 대체되는 값)을 그대로
      // 라이브 차량 목록의 기사명으로 매 위치 갱신마다 DB(staff_mobile_devices.driver_name)에 저장했습니다.
      // 그 결과 지역명이나 무의미한 기본값처럼 실제 담당자와 무관한 텍스트가 "라이브 차량" 패널에
      // 노출됐습니다. 오늘 카카오 초대 매칭 버그(자동 배정 매핑, invitedEmployeeName 도입) 수정과
      // 같은 이유로, 세션에 이미 들어있는 invitedEmployeeName(초대 시 관리자가 입력한 정식 이름 —
      // "직원"/"모바일 직원" 같은 placeholder 기본값은 제외됨)이 있으면 그걸 우선 쓰고, 초대 없이
      // 개인 워크스페이스를 만든 계정처럼 그 값이 없을 때만 기존과 동일하게 닉네임으로 대체합니다.
      driverName: session.invitedEmployeeName || session.name,
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

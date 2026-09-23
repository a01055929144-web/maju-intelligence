import { NextRequest, NextResponse } from "next/server";
import { getCustomerOperationalName, getCustomerSession, getRequestAuthScope, shouldScopeCustomerData } from "@/lib/auth";
import { getDeliveryCompletionEvents, getStaffLocationEvents, getStaffVehicleLocations, upsertStaffMobileLocation } from "@/lib/store";

export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok || !scope.companyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const isScopedStaffView = shouldScopeCustomerData(scope.customerSession);
    const scopedUserId = isScopedStaffView ? scope.customerSession?.userId : undefined;
    const locations = isScopedStaffView && !scopedUserId
      ? []
      : await getStaffVehicleLocations(scope.companyId, { userId: scopedUserId });
    const includeEvents = request.nextUrl.searchParams.get("events") === "true";
    const date = request.nextUrl.searchParams.get("date") || undefined;
    const requestedUserId = request.nextUrl.searchParams.get("userId") || undefined;
    const eventUserId = isScopedStaffView ? scopedUserId : requestedUserId;
    const events = includeEvents && (!isScopedStaffView || Boolean(eventUserId))
      ? await getStaffLocationEvents(scope.companyId, {
          date,
          hours: Number(request.nextUrl.searchParams.get("hours")) || 12,
          userId: eventUserId
        })
      : includeEvents ? [] : undefined;
    const includeCompletions = request.nextUrl.searchParams.get("completions") === "true";
    const completions = includeCompletions
      ? await getDeliveryCompletionEvents(scope.companyId, {
          deliveryVehicle: isScopedStaffView
            ? scope.customerSession?.assignedVehicle
            : request.nextUrl.searchParams.get("deliveryVehicle") || undefined,
          driverName: isScopedStaffView
            ? scope.customerSession?.assignedManagerName || scope.customerSession?.name
            : request.nextUrl.searchParams.get("driverName") || undefined,
          date,
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
      // 같은 이유로 안정적인 운영 이름을 한 함수에서 결정합니다. 수동 담당자 배정명, 초대 시 정식명,
      // 개인/오너의 회사 설정 운영 표시명, 소셜 닉네임 순으로 사용하고 placeholder는 제외합니다.
      driverName: getCustomerOperationalName(session),
      lat,
      lng,
      recordedAt: typeof body?.recordedAt === "string" ? body.recordedAt : undefined,
      status,
      userAgent: request.headers.get("user-agent") || undefined,
      userId: session.userId
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "모바일 위치를 저장하지 못했습니다." }, { status: 400 });
  }
}

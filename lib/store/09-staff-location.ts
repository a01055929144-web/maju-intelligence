import { resolveStaffWorkWindow } from "../../domains/delivery/staff-location";
import { resolveCompanyStaffDisplayName } from "../../domains/organization/staff-display-name";
import type { StaffLocationEvent, StaffMobileLocationInput, StaffVehicleLocation } from "../store";
import { getErrorMessage } from "../store";
import { kstDayRangeIso } from "./09-delivery-history";
import { evaluateStaffLocation, getStaffLocationDisplayState, resolveStaffLocationPersistence, STAFF_LOCATION_FRESHNESS_MINUTES } from "../staff-location";
import { isProductionStoreConfigured, supabaseRequest } from "./00-core";
import { isMissingStaffMobileLocationSchemaError } from "./01-staff-store-errors";

function toStaffVehicleLocation(row: {
  current_customer_id?: string | null;
  delivery_vehicle?: string | null;
  driver_name?: string | null;
  id: string;
  last_accuracy_m?: number | string | null;
  last_lat?: number | string | null;
  last_lng?: number | string | null;
  last_location_at?: string | null;
  last_seen_at?: string | null;
  location_status?: string | null;
  user_id: string;
}, identity?: { assignedManagerName?: string; assignedVehicle?: string; employeeName?: string; userName?: string }): StaffVehicleLocation | null {
  const lat = Number(row.last_lat);
  const lng = Number(row.last_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const lastLocationAt = row.last_location_at || undefined;
  const displayState = getStaffLocationDisplayState(lastLocationAt);
  const staleMs = lastLocationAt ? Date.now() - new Date(lastLocationAt).getTime() : Number.POSITIVE_INFINITY;
  const isStale = staleMs > STAFF_LOCATION_FRESHNESS_MINUTES * 60 * 1000;
  // 병합 노트(2026-09-12): origin(Codex)에는 이 식별자 우선순위 로직 자체가 없는 옛 버전이 계속
  // 이어지고 있고, C:\maju-deploy 로컬에만 있던 기능이라 pull할 때마다 이 지점에서 merge conflict가
  // 납니다. 아래 로직은 getStaffVehicleLocations()의 identity(담당자/직원명) 조인과
  // StaffVehicleLocation.displayName / assignedManagerName 필드, 그리고 UI
  // (sales-route-map-workspace.tsx)의 displayName 표시가 모두 이 값에 의존하고 있어 origin 쪽(빈 블록)을
  // 취하면 빌드가 깨지므로, 다음에 또 이 conflict가 나더라도 반드시 이 로컬 버전을 유지해야 합니다.
  const usableName = (value?: string) => {
    const name = value?.trim() || "";
    return /^(개인 사용자|배송기사|모바일 직원)$/.test(name) ? "" : name;
  };
  const companyDisplayName = resolveCompanyStaffDisplayName({
    appUserName: identity?.userName,
    invitationEmployeeName: identity?.employeeName
  });
  const displayName =
    usableName(companyDisplayName) ||
    usableName(identity?.assignedManagerName) ||
    usableName(row.driver_name || undefined) ||
    "이름 미등록 직원";
  return {
    accuracyMeters: row.last_accuracy_m === null || row.last_accuracy_m === undefined ? undefined : Number(row.last_accuracy_m),
    assignedManagerName: identity?.assignedManagerName,
    currentCustomerId: row.current_customer_id || undefined,
    deliveryVehicle: identity?.assignedVehicle || row.delivery_vehicle || undefined,
    displayName,
    driverName: displayName,
    id: row.id,
    isStale,
    displayState,
    lastLocationAt,
    lastSeenAt: row.last_seen_at || undefined,
    lat,
    lng,
    // 좌표는 current_customer_id가 있던 실제 배송 업무 이벤트에서만 가져옵니다. 따라서 기사가
    // 앱을 종료했더라도 그 좌표는 사생활 위치가 아니라 마지막 운행 위치이며 지도에 남깁니다.
    status: isStale ? "stale" : ((row.location_status || "active") as StaffVehicleLocation["status"]),
    userId: row.user_id
  };
}

export async function upsertStaffMobileLocation(input: StaffMobileLocationInput): Promise<{ location: StaffVehicleLocation | null; persisted: boolean }> {
  if (!input.companyId) throw new Error("고객사 ID가 필요합니다.");
  if (!input.userId) throw new Error("실제 직원 계정으로 로그인해야 위치를 저장할 수 있습니다.");
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) throw new Error("유효한 위치 좌표가 필요합니다.");

  const receivedAt = new Date();
  const parsedRecordedAt = input.recordedAt ? new Date(input.recordedAt) : receivedAt;
  const recordedAt = Number.isFinite(parsedRecordedAt.getTime()) && parsedRecordedAt.getTime() <= receivedAt.getTime() + 60_000
    ? parsedRecordedAt.toISOString()
    : receivedAt.toISOString();

  if (!isProductionStoreConfigured()) {
    return {
      location: {
        accuracyMeters: input.accuracyMeters,
        currentCustomerId: input.currentCustomerId,
        deliveryVehicle: input.deliveryVehicle,
        displayName: input.driverName || "이름 미등록 직원",
        driverName: input.driverName || "배송기사",
        id: input.userId,
        isStale: false,
        displayState: "realtime",
        lastLocationAt: recordedAt,
        lastSeenAt: receivedAt.toISOString(),
        lat: input.lat,
        lng: input.lng,
        status: input.status || "active",
        userId: input.userId
      },
      persisted: false
    };
  }

  const now = receivedAt.toISOString();
  try {
    const existingRows = await supabaseRequest<Array<{
      current_customer_id: string | null; delivery_vehicle: string | null; driver_name: string | null; id: string;
      last_accuracy_m: number | string | null; last_lat: number | string | null; last_lng: number | string | null;
      last_location_at: string | null; last_seen_at: string | null; location_status: string | null; user_id: string;
      work_auto_ends_at: string | null; work_ended_at: string | null; work_started_at: string | null;
    }>>(
      `staff_mobile_devices?select=id,user_id,driver_name,delivery_vehicle,last_lat,last_lng,last_accuracy_m,last_location_at,last_seen_at,location_status,current_customer_id,work_started_at,work_ended_at,work_auto_ends_at&company_id=eq.${encodeURIComponent(input.companyId)}&user_id=eq.${encodeURIComponent(input.userId)}&platform=eq.mobile_web&limit=1`
    ).catch(() => []);
    const existing = existingRows[0];
    const previousPoint = existing?.last_location_at && existing.last_lat !== null && existing.last_lng !== null
      ? {
          accuracyMeters: existing.last_accuracy_m === null ? undefined : Number(existing.last_accuracy_m),
          lat: Number(existing.last_lat),
          lng: Number(existing.last_lng),
          recordedAt: existing.last_location_at
        }
      : undefined;
    const decision = evaluateStaffLocation({ accuracyMeters: input.accuracyMeters, lat: input.lat, lng: input.lng, recordedAt }, previousPoint);
    const isTerminalStatus = input.status === "paused" || input.status === "offline";
    if (!isTerminalStatus && !decision.accept && decision.reason !== "stationary" && decision.reason !== "older") {
      return { location: existing ? toStaffVehicleLocation(existing) : null, persisted: false };
    }
    const elapsedMs = previousPoint ? Math.max(0, new Date(recordedAt).getTime() - new Date(previousPoint.recordedAt).getTime()) : Number.POSITIVE_INFINITY;
    const persistence = resolveStaffLocationPersistence(decision, Boolean(previousPoint), elapsedMs);
    const workFields = resolveStaffWorkWindow(input.workActive, {
      autoEndsAt: existing?.work_auto_ends_at,
      endedAt: existing?.work_ended_at,
      startedAt: existing?.work_started_at
    }, receivedAt.getTime());
    const rowPayload = {
      company_id: input.companyId,
      current_customer_id: input.currentCustomerId || existing?.current_customer_id || null,
      delivery_vehicle: input.deliveryVehicle || existing?.delivery_vehicle || null,
      device_label: input.driverName || "모바일 웹",
      driver_name: input.driverName || existing?.driver_name || null,
      last_accuracy_m: persistence.updateTimestamp && Number.isFinite(input.accuracyMeters) ? input.accuracyMeters : existing?.last_accuracy_m ?? null,
      last_lat: persistence.updateCoordinates ? input.lat : existing?.last_lat ?? input.lat,
      last_lng: persistence.updateCoordinates ? input.lng : existing?.last_lng ?? input.lng,
      last_location_at: persistence.updateTimestamp ? recordedAt : existing?.last_location_at || recordedAt,
      last_seen_at: now,
      location_status: input.status || "active",
      platform: "mobile_web",
      user_agent: input.userAgent || null,
      user_id: input.userId,
      ...workFields
    };
    const saveDevice = (payload: Record<string, unknown>) => supabaseRequest<
      Array<{
        current_customer_id: string | null; delivery_vehicle: string | null; driver_name: string | null; id: string;
        last_accuracy_m: number | string | null; last_lat: number | string | null; last_lng: number | string | null;
        last_location_at: string | null; last_seen_at: string | null; location_status: string | null; user_id: string;
      }>
    >("staff_mobile_devices?on_conflict=company_id,user_id,platform", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify([payload])
    });
    const rows = await supabaseRequest<
      Array<{
        current_customer_id: string | null;
        delivery_vehicle: string | null;
        driver_name: string | null;
        id: string;
        last_accuracy_m: number | string | null;
        last_lat: number | string | null;
        last_lng: number | string | null;
        last_location_at: string | null;
        last_seen_at: string | null;
        location_status: string | null;
        user_id: string;
      }>
    >("staff_mobile_devices?on_conflict=company_id,user_id,platform", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify([rowPayload])
    }).catch(async (error) => {
      if (input.workActive === undefined || !/work_started_at|work_ended_at|work_auto_ends_at|schema cache/i.test(getErrorMessage(error))) throw error;
      return saveDevice({
        company_id: rowPayload.company_id,
        current_customer_id: rowPayload.current_customer_id,
        delivery_vehicle: rowPayload.delivery_vehicle,
        device_label: rowPayload.device_label,
        driver_name: rowPayload.driver_name,
        last_accuracy_m: rowPayload.last_accuracy_m,
        last_lat: rowPayload.last_lat,
        last_lng: rowPayload.last_lng,
        last_location_at: rowPayload.last_location_at,
        last_seen_at: rowPayload.last_seen_at,
        location_status: rowPayload.location_status,
        platform: rowPayload.platform,
        user_agent: rowPayload.user_agent,
        user_id: rowPayload.user_id
      });
    });
    const location = toStaffVehicleLocation(rows[0]) || null;
    if (location && persistence.storeHistory) {
      await supabaseRequest("staff_location_events", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify([
          {
            accuracy_m: Number.isFinite(input.accuracyMeters) ? input.accuracyMeters : null,
            company_id: input.companyId,
            current_customer_id: input.currentCustomerId || null,
            delivery_vehicle: input.deliveryVehicle || null,
            device_id: location.id,
            driver_name: input.driverName || null,
            latitude: input.lat,
            longitude: input.lng,
            recorded_at: recordedAt,
            user_id: input.userId
          }
        ])
      }).catch((eventError) => {
        if (isMissingStaffMobileLocationSchemaError(eventError)) return null;
        throw eventError;
      });
    }
    return { location, persisted: true };
  } catch (error) {
    if (isMissingStaffMobileLocationSchemaError(error)) {
      throw new Error("모바일 위치 저장 컬럼이 없습니다. Supabase SQL Editor에서 supabase/migrations/20260901_staff_mobile_location.sql 파일 내용을 실행한 뒤 다시 시도하세요.");
    }
    throw error;
  }
}

export async function getStaffVehicleLocations(companyId?: string, options: { userId?: string } = {}): Promise<StaffVehicleLocation[]> {
  if (!companyId || !isProductionStoreConfigured()) return [];
  try {
    const memberFilter = options.userId ? `&user_id=eq.${encodeURIComponent(options.userId)}` : "";
    const members = await supabaseRequest<Array<{ user_id: string; app_users: { name: string | null; status: string | null } | null }>>(
      `company_members?select=user_id,app_users(name,status)&company_id=eq.${encodeURIComponent(companyId)}&status=eq.active${memberFilter}&limit=100`
    );
    const activeMembers = members.filter((member) => member.app_users?.status !== "inactive" && member.app_users?.status !== "deleted");
    const userIds = Array.from(new Set(activeMembers.map((member) => member.user_id).filter(Boolean)));
    if (!userIds.length) return [];
    const activeUserIds = new Set(userIds);
    const userIdFilter = userIds.map((id) => encodeURIComponent(id)).join(",");
    const [devices, invitationRows, operationalEvents] = await Promise.all([
      supabaseRequest<Array<{
        delivery_vehicle: string | null; driver_name: string | null; id: string;
        last_seen_at: string | null; location_status: string | null; user_id: string;
      }>>(
        `staff_mobile_devices?select=id,user_id,driver_name,delivery_vehicle,last_seen_at,location_status&company_id=eq.${encodeURIComponent(companyId)}&user_id=in.(${userIdFilter})&order=last_seen_at.desc&limit=100`
      ).catch(() => []),
      supabaseRequest<Array<{
        accepted_by: string | null; assigned_manager_name: string | null;
        assigned_vehicle: string | null; employee_name: string | null;
      }>>(
        `staff_invitations?select=accepted_by,employee_name,assigned_manager_name,assigned_vehicle&company_id=eq.${encodeURIComponent(companyId)}&accepted_by=in.(${userIdFilter})&status=eq.accepted&order=accepted_at.desc`
      ).catch(() => []),
      supabaseRequest<Array<{
        accuracy_m: number | string | null; current_customer_id: string | null;
        delivery_vehicle: string | null; device_id: string | null; driver_name: string | null;
        id: string; latitude: number | string; longitude: number | string;
        recorded_at: string; user_id: string;
      }>>("rpc/list_latest_operational_staff_locations", {
        method: "POST",
        body: JSON.stringify({ p_company_id: companyId, p_user_id: options.userId || null })
      }).catch(() => [])
    ]);
    const userNameById = new Map(activeMembers.map((member) => [member.user_id, member.app_users?.name || undefined]));
    const deviceByUserId = new Map<string, (typeof devices)[number]>();
    devices.forEach((row) => { if (!deviceByUserId.has(row.user_id)) deviceByUserId.set(row.user_id, row); });
    const invitationByUserId = new Map<string, (typeof invitationRows)[number]>();
    invitationRows.forEach((row) => {
      if (row.accepted_by && !invitationByUserId.has(row.accepted_by)) invitationByUserId.set(row.accepted_by, row);
    });
    return operationalEvents
      .filter((event) => activeUserIds.has(event.user_id))
      .map((event) => {
        const device = deviceByUserId.get(event.user_id);
        const invitation = invitationByUserId.get(event.user_id);
        return toStaffVehicleLocation({
          current_customer_id: event.current_customer_id,
          delivery_vehicle: event.delivery_vehicle || device?.delivery_vehicle || null,
          driver_name: event.driver_name || device?.driver_name || null,
          id: device?.id || event.device_id || event.id,
          last_accuracy_m: event.accuracy_m,
          last_lat: event.latitude,
          last_lng: event.longitude,
          last_location_at: event.recorded_at,
          last_seen_at: device?.last_seen_at || event.recorded_at,
          location_status: device?.location_status || "stale",
          user_id: event.user_id
        }, {
          assignedManagerName: invitation?.assigned_manager_name || undefined,
          assignedVehicle: invitation?.assigned_vehicle || undefined,
          employeeName: invitation?.employee_name || undefined,
          userName: userNameById.get(event.user_id)
        });
      })
      .filter((location): location is StaffVehicleLocation => Boolean(location));
  } catch (error) {
    if (isMissingStaffMobileLocationSchemaError(error)) return [];
    throw error;
  }
}

export async function getStaffLocationEvents(companyId?: string, options: { date?: string; hours?: number; userId?: string } = {}): Promise<StaffLocationEvent[]> {
  if (!companyId || !isProductionStoreConfigured()) return [];
  const dateRange = options.date && /^\d{4}-\d{2}-\d{2}$/.test(options.date) ? kstDayRangeIso(options.date) : null;
  const since = dateRange?.start || new Date(Date.now() - Math.max(1, options.hours || 12) * 60 * 60 * 1000).toISOString();
  const untilFilter = dateRange ? `&recorded_at=lte.${encodeURIComponent(dateRange.end)}` : "";
  const userFilter = options.userId ? `&user_id=eq.${encodeURIComponent(options.userId)}` : "";
  try {
    const rows = await supabaseRequest<
      Array<{
        accuracy_m: number | string | null;
        current_customer_id: string | null;
        delivery_vehicle: string | null;
        driver_name: string | null;
        id: string;
        latitude: number | string;
        longitude: number | string;
        recorded_at: string;
        user_id: string;
      }>
    >(
      `staff_location_events?select=id,user_id,driver_name,delivery_vehicle,latitude,longitude,accuracy_m,recorded_at,current_customer_id&company_id=eq.${encodeURIComponent(
        companyId
      )}&recorded_at=gte.${encodeURIComponent(since)}${untilFilter}${userFilter}&order=recorded_at.asc&limit=6000`
    );
    return rows
      .map((row) => ({
        accuracyMeters: row.accuracy_m === null || row.accuracy_m === undefined ? undefined : Number(row.accuracy_m),
        currentCustomerId: row.current_customer_id || undefined,
        deliveryVehicle: row.delivery_vehicle || undefined,
        driverName: row.driver_name || "배송기사",
        id: row.id,
        lat: Number(row.latitude),
        lng: Number(row.longitude),
        recordedAt: row.recorded_at,
        userId: row.user_id
      }))
      .filter((event) => Number.isFinite(event.lat) && Number.isFinite(event.lng));
  } catch (error) {
    if (isMissingStaffMobileLocationSchemaError(error)) return [];
    throw error;
  }
}

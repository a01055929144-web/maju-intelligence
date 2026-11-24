import { kstDateKey } from "../../domains/shared/kst-date";
import type { CustomerMapSummaryItem, CustomerMasterItem, DeliveryCompletionEvent, DeliveryHistoryDay, DeliveryHistoryDriverGroup, DeliveryHistoryFollowUpStatus } from "../store";
import { getCustomerMapSummaries, getCustomerMaster, getRouteOrderConfirmationMap } from "../store";
import { isProductionStoreConfigured, supabaseRequest } from "./00-core";

const toKstDateKey = (iso: string): string => kstDateKey(iso);

export async function getDeliveryCompletionEvents(
  companyId?: string,
  options: { date?: string; deliveryVehicle?: string; driverName?: string; hours?: number } = {}
): Promise<DeliveryCompletionEvent[]> {
  if (!companyId || !isProductionStoreConfigured()) return [];
  const dateRange = options.date && /^\d{4}-\d{2}-\d{2}$/.test(options.date) ? kstDayRangeIso(options.date) : null;
  const since = dateRange?.start || new Date(Date.now() - Math.max(1, options.hours || 12) * 60 * 60 * 1000).toISOString();
  const untilFilter = dateRange ? `&created_at=lte.${encodeURIComponent(dateRange.end)}` : "";
  try {
    const rows = await supabaseRequest<
      Array<{
        created_at: string;
        customer_id: string;
        id: string;
        memo: string;
        next_action: string | null;
      }>
    >(
      `customer_notes?select=id,customer_id,memo,next_action,created_at&company_id=eq.${encodeURIComponent(
        companyId
      )}&note_type=eq.delivery&created_at=gte.${encodeURIComponent(since)}${untilFilter}&order=created_at.asc&limit=1000`
    );
    if (!rows.length) return [];

    const [customerMap, confirmationMap] = await Promise.all([
      getCustomerMapSummaries(companyId).catch(() => ({ customers: [] as CustomerMapSummaryItem[], source: "empty" as const, truncated: false })),
      getRouteOrderConfirmationMap(companyId, options.date).catch(() => new Map<string, string[]>())
    ]);
    const stopByCustomerId = new Map(
      customerMap.customers.map((customer) => {
        const confirmedIds = customer.deliveryManager ? confirmationMap.get(customer.deliveryManager) : undefined;
        const confirmedIndex = confirmedIds?.indexOf(customer.id) ?? -1;
        return [customer.id, {
          deliveryDriver: customer.deliveryManager,
          deliveryVehicle: customer.deliveryVehicle,
          name: customer.customerName,
          order: confirmedIndex >= 0 ? confirmedIndex + 1 : undefined
        }] as const;
      })
    );
    const driverName = normalizeComparableText(options.driverName);
    const deliveryVehicle = normalizeComparableText(options.deliveryVehicle);
    const filtered = rows.filter((row) => {
      const stop = stopByCustomerId.get(row.customer_id);
      if (!stop) return !driverName && !deliveryVehicle;
      const stopDriver = normalizeComparableText(stop.deliveryDriver);
      const stopVehicle = normalizeComparableText(stop.deliveryVehicle);
      if (deliveryVehicle && stopVehicle && stopVehicle !== deliveryVehicle) return false;
      if (!deliveryVehicle && driverName && stopDriver && stopDriver !== driverName) return false;
      return true;
    });

    return filtered.map((row, index) => {
      const stop = stopByCustomerId.get(row.customer_id);
      return {
        actualOrder: index + 1,
        completedAt: row.created_at,
        customerId: row.customer_id,
        customerName: stop?.name || "거래처",
        deliveryDriver: stop?.deliveryDriver,
        deliveryVehicle: stop?.deliveryVehicle,
        id: row.id,
        memoSnippet: summarizeDeliveryMemo(row.memo),
        plannedOrder: stop?.order && stop.order < 10000 ? stop.order : undefined,
        statusLabel: extractDeliveryStatus(row.memo)
      };
    });
  } catch {
    return [];
  }
}

function summarizeDeliveryMemo(memo: string) {
  return memo
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => !line.startsWith("배송 상태:") && !line.startsWith("알림 방식:"))
    ?.slice(0, 60);
}

function extractDeliveryStatus(memo: string) {
  const match = memo.match(/배송 상태:\s*([^\n\r]+)/);
  return match?.[1]?.trim();
}

function normalizeComparableText(value?: string | null) {
  return (value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

// "YYYY-MM-DD" 하루(KST 기준)를 UTC ISO 문자열 시작/끝 경계로 바꿉니다. 서버 시각은 UTC로
// 저장되지만 사용자가 달력에서 고르는 날짜는 한국 시간 기준 하루이므로, DB 필터링 전에
// KST 자정~다음 KST 자정 구간을 UTC로 환산해야 정확한 하루가 조회됩니다.
export function kstDayRangeIso(dateKey: string): { end: string; start: string } {
  const start = new Date(`${dateKey}T00:00:00+09:00`);
  const end = new Date(`${dateKey}T23:59:59.999+09:00`);
  return { end: end.toISOString(), start: start.toISOString() };
}

// UTC ISO 시각을 KST 기준 "YYYY-MM-DD" 날짜 키로 바꿉니다(달력에 날짜별 건수를 표시할 때 사용).

// 달력에 날짜별 배송완료 건수를 배지로 보여주기 위한 요약입니다. from~to(둘 다 YYYY-MM-DD, KST
// 기준, inclusive) 구간의 배송완료 메모(customer_notes, note_type=delivery) 건수를 날짜별로 셉니다.
export async function getDeliveryHistorySummary(companyId: string | undefined, range: { from: string; to: string }): Promise<Record<string, number>> {
  if (!companyId || !isProductionStoreConfigured()) return {};
  try {
    const { start } = kstDayRangeIso(range.from);
    const { end } = kstDayRangeIso(range.to);
    const rows = await supabaseRequest<Array<{ created_at: string }>>(
      `customer_notes?select=created_at&company_id=eq.${encodeURIComponent(companyId)}&note_type=eq.delivery&created_at=gte.${encodeURIComponent(
        start
      )}&created_at=lte.${encodeURIComponent(end)}&order=created_at.asc&limit=5000`
    );
    const counts: Record<string, number> = {};
    for (const row of rows) {
      const key = toKstDateKey(row.created_at);
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  } catch {
    return {};
  }
}

// 특정 날짜(KST) 하루의 배송 히스토리를 담당자별로 묶어서 돌려줍니다. 그날 저장된
// route_plan_confirmations(코스 탭에서 확정한 방문 순서)가 있으면 그것을 "계획한 순서"로 쓰고,
// 없으면 어느 담당자 소속인지 지금 등록된 거래처의 담당자 값으로만 최선 추정합니다(과거 시점의
// 실제 담당자와 다를 수 있어 planMatchedThatDay로 그 차이를 구분해서 알려줍니다).
export async function getDeliveryHistoryForDate(companyId: string | undefined, date: string): Promise<DeliveryHistoryDay> {
  const empty: DeliveryHistoryDay = { date, drivers: [], followUps: [], totalCompletions: 0, unassignedCompletions: [] };
  if (!companyId || !isProductionStoreConfigured()) return empty;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return empty;

  try {
    const { start, end } = kstDayRangeIso(date);
    const [noteRows, confirmationRows, locationRows, customerMaster, followUpRows] = await Promise.all([
      supabaseRequest<Array<{ created_at: string; customer_id: string; id: string; memo: string }>>(
        `customer_notes?select=id,customer_id,memo,created_at&company_id=eq.${encodeURIComponent(companyId)}&note_type=eq.delivery&created_at=gte.${encodeURIComponent(
          start
        )}&created_at=lte.${encodeURIComponent(end)}&order=created_at.asc&limit=1000`
      ),
      supabaseRequest<Array<{ customer_ids: unknown; driver_name: string }>>(
        `route_plan_confirmations?select=driver_name,customer_ids&company_id=eq.${encodeURIComponent(companyId)}&route_date=eq.${encodeURIComponent(date)}`
      ).catch(() => []),
      supabaseRequest<
        Array<{
          accuracy_m: number | string | null;
          delivery_vehicle: string | null;
          driver_name: string | null;
          id: string;
          latitude: number | string;
          longitude: number | string;
          recorded_at: string;
          user_id: string;
        }>
      >(
        `staff_location_events?select=id,user_id,driver_name,delivery_vehicle,latitude,longitude,accuracy_m,recorded_at&company_id=eq.${encodeURIComponent(
          companyId
        )}&recorded_at=gte.${encodeURIComponent(start)}&recorded_at=lte.${encodeURIComponent(end)}&order=recorded_at.asc&limit=6000`
      ).catch(() => []),
      getCustomerMaster(companyId).catch(() => ({ customers: [] as CustomerMasterItem[], source: "empty" as const, truncated: false })),
      supabaseRequest<Array<{ customer_id: string; processed_at: string; processed_by_name: string; processed_by_role: string; route_date: string; status: DeliveryHistoryFollowUpStatus }>>(
        `delivery_route_follow_ups?select=customer_id,route_date,status,processed_by_name,processed_by_role,processed_at&company_id=eq.${encodeURIComponent(companyId)}&route_date=eq.${encodeURIComponent(date)}`
      ).catch(() => [])
    ]);

    const customerById = new Map(customerMaster.customers.map((customer) => [customer.id, customer]));
    const driverGroups = new Map<string, DeliveryHistoryDriverGroup>();
    const ensureDriver = (rawName: string): DeliveryHistoryDriverGroup => {
      const key = rawName.trim() || "미배정";
      let group = driverGroups.get(key);
      if (!group) {
        group = { completions: [], driverName: key, events: [], planMatchedThatDay: false, plannedCustomerIds: [] };
        driverGroups.set(key, group);
      }
      return group;
    };

    for (const row of confirmationRows) {
      if (!Array.isArray(row.customer_ids)) continue;
      const group = ensureDriver(row.driver_name);
      group.plannedCustomerIds = row.customer_ids as string[];
      group.planMatchedThatDay = true;
    }

    // 그날 실제로 GPS를 보고한 기록에서 담당자별 배송차량을 역추정합니다(그날 시점 기준이라
    // 지금 등록된 값보다 신뢰도가 높습니다).
    const vehicleVotesByDriver = new Map<string, Map<string, number>>();
    for (const row of locationRows) {
      const driverName = (row.driver_name || "").trim();
      if (!driverName) continue;
      const group = ensureDriver(driverName);
      group.events.push({
        accuracyMeters: row.accuracy_m === null || row.accuracy_m === undefined ? undefined : Number(row.accuracy_m),
        deliveryVehicle: row.delivery_vehicle || undefined,
        driverName,
        id: row.id,
        lat: Number(row.latitude),
        lng: Number(row.longitude),
        recordedAt: row.recorded_at,
        userId: row.user_id
      });
      if (row.delivery_vehicle) {
        const votes = vehicleVotesByDriver.get(driverName) || new Map<string, number>();
        votes.set(row.delivery_vehicle, (votes.get(row.delivery_vehicle) || 0) + 1);
        vehicleVotesByDriver.set(driverName, votes);
      }
    }
    // Map을 for...of로 직접 순회하면 이 프로젝트의 tsconfig(target: es5, downlevelIteration
    // 미설정)에서 빌드 타입 에러가 나므로, 이 파일의 다른 곳들과 같은 방식으로 Array.from()으로
    // 배열로 바꾼 뒤 순회합니다.
    for (const [driverName, votes] of Array.from(vehicleVotesByDriver)) {
      const top = Array.from(votes.entries()).sort((a, b) => b[1] - a[1])[0];
      if (top) ensureDriver(driverName).deliveryVehicle = top[0];
    }

    const driverByCustomerId = new Map<string, string>();
    for (const [driverName, group] of Array.from(driverGroups)) {
      for (const customerId of group.plannedCustomerIds) driverByCustomerId.set(customerId, driverName);
    }

    const unassignedCompletions: DeliveryCompletionEvent[] = [];
    const completionsByDriver = new Map<string, DeliveryCompletionEvent[]>();
    for (const row of noteRows) {
      const customer = customerById.get(row.customer_id);
      // 그날의 확정 순서(route_plan_confirmations)에 이 거래처가 있으면 그 담당자 소속으로 보고,
      // 없으면(그날 순서를 확정하지 않았거나 나중에 담당자가 바뀐 경우) 지금 등록된 담당자로
      // 최선 추정합니다 - 이 경우는 과거 실제와 다를 수 있어 planMatchedThatDay=false로 남습니다.
      const driverName = driverByCustomerId.get(row.customer_id) || (customer?.deliveryManager || "").trim() || undefined;
      const group = driverName ? ensureDriver(driverName) : undefined;
      const plannedIndex = group ? group.plannedCustomerIds.indexOf(row.customer_id) : -1;
      const completion: DeliveryCompletionEvent = {
        actualOrder: 0,
        completedAt: row.created_at,
        customerId: row.customer_id,
        customerName: customer?.customerName || "거래처",
        deliveryDriver: driverName,
        deliveryVehicle: group?.deliveryVehicle || customer?.deliveryVehicle,
        id: row.id,
        memoSnippet: summarizeDeliveryMemo(row.memo),
        plannedOrder: plannedIndex >= 0 ? plannedIndex + 1 : undefined,
        statusLabel: extractDeliveryStatus(row.memo)
      };
      if (!driverName) {
        unassignedCompletions.push(completion);
        continue;
      }
      const list = completionsByDriver.get(driverName) || [];
      list.push(completion);
      completionsByDriver.set(driverName, list);
    }
    for (const [driverName, list] of Array.from(completionsByDriver)) {
      list.forEach((completion, index) => {
        completion.actualOrder = index + 1;
      });
      ensureDriver(driverName).completions = list;
    }
    unassignedCompletions.forEach((completion, index) => {
      completion.actualOrder = index + 1;
    });

    const drivers = Array.from(driverGroups.values())
      .filter((group) => group.completions.length > 0 || group.events.length > 0 || group.plannedCustomerIds.length > 0)
      .sort((a, b) => b.completions.length - a.completions.length || a.driverName.localeCompare(b.driverName, "ko"));

    const totalCompletions = drivers.reduce((sum, group) => sum + group.completions.length, 0) + unassignedCompletions.length;

    const followUps = followUpRows.map((row) => ({
      customerId: row.customer_id,
      processedAt: row.processed_at,
      processedByName: row.processed_by_name,
      processedByRole: row.processed_by_role,
      routeDate: row.route_date,
      status: row.status
    }));
    return { date, drivers, followUps, totalCompletions, unassignedCompletions };
  } catch {
    return empty;
  }
}

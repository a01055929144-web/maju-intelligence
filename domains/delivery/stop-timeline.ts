// CC-67: delivery_route_stops 한 줄을 오늘 코스 · 배송 이력 화면 한 줄로. React·DB를 모른다.
export type RouteStopRecord = {
  readonly id: string;
  readonly order: number;
  readonly type: "delivery" | "sales";
  readonly status: "planned" | "arrived" | "completed" | "partial" | "problem" | "not_delivered";
  readonly name: string;
  readonly driverName: string;
  readonly arrivedAt?: string | null;
  readonly completedAt?: string | null;
  readonly reasonLabel?: string | null;
  readonly photoCount: number;
};

export const STOP_STATUS_LABEL: Record<RouteStopRecord["status"], string> = {
  planned: "예정", arrived: "도착", completed: "완료", partial: "일부 배송", problem: "문제", not_delivered: "전달 못 함"
};

/** 기사별로 묶고 순서대로. 영업 정류장은 점선 표시. 정류장이 없으면 빈 목록(호출한 화면이 지금 방식을 그대로 쓴다). */
export function groupStopsByDriver(stops: ReadonlyArray<RouteStopRecord>): Array<{ driverName: string; stops: Array<RouteStopRecord & { dashed: boolean }> }> {
  return Array.from(new Set(stops.map((stop) => stop.driverName)), (driverName) => ({
    driverName,
    stops: stops.filter((stop) => stop.driverName === driverName).sort((a, b) => a.order - b.order).map((stop) => ({ ...stop, dashed: stop.type === "sales" }))
  }));
}

/** 시각 → "HH:mm"(한국 시간). 없거나 잘못된 값은 빈 글. */
export function stopClock(iso?: string | null): string {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(new Date(ms)) : "";
}

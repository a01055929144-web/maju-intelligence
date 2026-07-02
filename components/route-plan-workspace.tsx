"use client";

import { useMemo, useState } from "react";
import { LucideIcon, MapPin, Navigation, PackageCheck, SlidersHorizontal, Truck, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KakaoAddressMap, KakaoMapMarker } from "@/components/kakao-address-map";
import { RouteBatchDistanceAction } from "@/components/route-batch-distance-action";
import { RouteDistanceAction } from "@/components/route-distance-action";
import { RouteSequenceAction } from "@/components/route-sequence-action";
import { VisitResultForm } from "@/components/visit-result-form";
import { RoutePlan, RoutePlanStop } from "@/lib/store";

type RoutePlanWorkspaceProps = {
  readonly mapMarkers: KakaoMapMarker[];
  readonly routePlan: RoutePlan;
};

type CourseMode = "sales" | "delivery";
type SalesViewMode = "map" | "stops";
type DeliveryViewMode = "map" | "route";
type DeliveryVehicle = {
  id: string;
  name: string;
  driver: string;
  area: string;
  stops: RoutePlanStop[];
  totalDistanceKm: number;
  totalDurationMinutes: number;
  expectedRevenue: number;
};

const courseOptions: Array<{ icon: LucideIcon; key: CourseMode; label: string }> = [
  { icon: UsersRound, key: "sales", label: "영업 코스" },
  { icon: PackageCheck, key: "delivery", label: "배송 코스" }
];

export function RoutePlanWorkspace({ mapMarkers, routePlan }: RoutePlanWorkspaceProps) {
  const [courseMode, setCourseMode] = useState<CourseMode>("sales");
  const [salesViewMode, setSalesViewMode] = useState<SalesViewMode>("map");
  const [deliveryViewMode, setDeliveryViewMode] = useState<DeliveryViewMode>("map");
  const [vehicleId, setVehicleId] = useState("truck-1");
  const [region, setRegion] = useState("all");
  const regions = useMemo(() => routePlan.groups.map((group) => group.region), [routePlan.groups]);
  const filteredGroups = useMemo(
    () => (region === "all" ? routePlan.groups : routePlan.groups.filter((group) => group.region === region)),
    [region, routePlan.groups]
  );
  const filteredStops = filteredGroups.flatMap((group) => group.stops);
  const deliveryVehicles = useMemo(() => createDeliveryVehicles(filteredStops), [filteredStops]);
  const selectedVehicle = deliveryVehicles.find((vehicle) => vehicle.id === vehicleId) || deliveryVehicles[0];
  const deliveryStops = selectedVehicle?.stops || [];
  const destinations = deliveryStops.map((stop) => stop.address || "").filter(Boolean);
  const salesMarkers = filterMarkersForStops(mapMarkers, filteredStops, false);
  const deliveryMarkers = createDeliveryMarkers(mapMarkers, deliveryStops);
  const isSalesCourse = courseMode === "sales";

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" />
            코스 작업공간
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            {courseOptions.map(({ icon: Icon, key, label }) => (
              <button
                key={key}
                className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-bold transition ${
                  courseMode === key ? "border-primary bg-primary text-white" : "border-border bg-white hover:bg-muted"
                }`}
                onClick={() => setCourseMode(key as CourseMode)}
                type="button"
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-border bg-white p-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black">{isSalesCourse ? "영업 코스" : "배송 코스"}</p>
              <p className="text-xs text-muted-foreground">
                {isSalesCourse
                  ? "신규 리드 방문, 담당자 메모, 방문 결과 기록을 관리합니다."
                  : "물류 출발지 기준으로 거래처까지 실제 도로 거리와 경유 경로를 계산합니다."}
              </p>
            </div>
            <Badge className={isSalesCourse ? "bg-primary/10 text-primary" : "bg-accent/20 text-foreground"}>
              {isSalesCourse ? "Sales Visit" : "Delivery Route"}
            </Badge>
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/35 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm font-black">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            지역 필터
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterButton active={region === "all"} label="전체" onClick={() => setRegion("all")} />
            {regions.map((nextRegion) => (
              <FilterButton key={nextRegion} active={region === nextRegion} label={nextRegion} onClick={() => setRegion(nextRegion)} />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isSalesCourse
            ? ([
                ["map", "영업 지도"],
                ["stops", "방문 관리"]
              ] as const).map(([key, label]) => (
                <ViewButton key={key} active={salesViewMode === key} label={label} onClick={() => setSalesViewMode(key)} />
              ))
            : ([
                ["map", "배송 지도"],
                ["route", "경유 계산"]
              ] as const).map(([key, label]) => (
                <ViewButton key={key} active={deliveryViewMode === key} label={label} onClick={() => setDeliveryViewMode(key)} />
              ))}
        </div>
        {!isSalesCourse ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {deliveryVehicles.map((vehicle) => (
              <button
                key={vehicle.id}
                className={`rounded-md border p-4 text-left transition ${
                  vehicleId === vehicle.id ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-white hover:bg-muted/45"
                }`}
                onClick={() => setVehicleId(vehicle.id)}
                type="button"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-sm font-black">
                    <Truck className="h-4 w-4 text-primary" />
                    {vehicle.name}
                  </span>
                  <Badge className="bg-muted text-foreground">{vehicle.stops.length}곳</Badge>
                </div>
                <p className="text-xs font-bold text-muted-foreground">{vehicle.driver} · {vehicle.area}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] font-black">
                  <span className="rounded-md bg-white px-2 py-1">{vehicle.totalDistanceKm.toLocaleString()}km</span>
                  <span className="rounded-md bg-white px-2 py-1">{formatMinutes(vehicle.totalDurationMinutes)}</span>
                  <span className="rounded-md bg-white px-2 py-1">월 {vehicle.expectedRevenue.toLocaleString()}만</span>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {isSalesCourse && salesViewMode === "map" ? (
          <div className="space-y-3">
            <KakaoAddressMap markers={salesMarkers} />
            <p className="text-xs font-bold text-muted-foreground">영업 지도에는 선택한 지역의 방문 후보 위치가 표시됩니다.</p>
          </div>
        ) : null}

        {!isSalesCourse && deliveryViewMode === "map" ? (
          <div className="space-y-3">
            <KakaoAddressMap markers={deliveryMarkers} />
            <p className="text-xs font-bold text-muted-foreground">
              배송 지도에는 {selectedVehicle?.name || "선택 차량"}의 물류 출발지와 담당 거래처가 표시됩니다.
            </p>
          </div>
        ) : null}

        {!isSalesCourse && deliveryViewMode === "route" ? (
          <div className="space-y-3">
            {selectedVehicle ? <DeliveryStopList vehicle={selectedVehicle} /> : null}
            <RouteBatchDistanceAction buttonLabel="배송 거리 전체 계산" destinations={destinations} />
            <RouteSequenceAction buttonLabel="배송 경유 도로 연결" destinations={destinations} resultTitle="티맵 실제 배송 도로 경로" />
          </div>
        ) : null}

        {isSalesCourse && salesViewMode === "stops" ? (
          <RouteStopGroups groups={filteredGroups} />
        ) : null}

        {!filteredGroups.length ? (
          <div className="rounded-md border border-border bg-muted/35 p-6 text-center">
            <MapPin className="mx-auto mb-3 h-8 w-8 text-primary" />
            <p className="font-black">선택한 지역의 방문 예정 리드가 없습니다.</p>
            <p className="mt-1 text-sm text-muted-foreground">다른 지역을 선택하거나 대시보드에서 리드 상태를 변경하세요.</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DeliveryStopList({ vehicle }: { readonly vehicle: DeliveryVehicle }) {
  return (
    <div className="rounded-md border border-border bg-muted/25 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-black">{vehicle.name} 담당 거래처</p>
          <p className="text-xs text-muted-foreground">{vehicle.driver} · {vehicle.area}</p>
        </div>
        <Badge className="bg-primary/10 text-primary">{vehicle.stops.length}곳 배정</Badge>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {vehicle.stops.map((stop, index) => (
          <div key={stop.id || `${vehicle.id}-${stop.name}`} className="rounded-md bg-white p-3 text-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-black text-white">
                {index + 1}
              </span>
              <div>
                <p className="font-black">{stop.name}</p>
                <p className="text-xs text-muted-foreground">{stop.address || "주소 미등록"}</p>
                <p className="mt-1 text-xs font-bold text-muted-foreground">
                  {stop.distanceKm || 0}km · {formatMinutes(stop.durationMinutes || 0)} · 예상 월 {stop.expectedRevenue.toLocaleString()}만원
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ViewButton({ active, label, onClick }: { readonly active: boolean; readonly label: string; readonly onClick: () => void }) {
  return (
    <button
      className={`h-9 rounded-md border px-3 text-sm font-bold transition ${
        active ? "border-foreground bg-foreground text-white" : "border-border bg-white hover:bg-muted"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function RouteStopGroups({ groups }: { readonly groups: RoutePlan["groups"] }) {
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.region} className="rounded-md border border-border p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-black">{group.region}</p>
              <p className="text-xs text-muted-foreground">
                {group.stops.length}곳 · {group.totalDistanceKm.toLocaleString()}km · {formatMinutes(group.totalDurationMinutes)} · 예상 월{" "}
                {group.expectedRevenue.toLocaleString()}만원
              </p>
            </div>
            <Badge className="bg-primary/10 text-primary">지역 묶음</Badge>
          </div>
          <div className="space-y-2">
            {group.stops.map((stop) => (
              <div key={stop.id || stop.name} className="rounded-md bg-muted/35 p-3">
                <div className="grid gap-3 sm:grid-cols-[44px_1fr_90px_110px] sm:items-center">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-black text-white">{stop.order}</span>
                  <div>
                    <p className="font-bold">{stop.name}</p>
                    <p className="text-xs text-muted-foreground">{stop.region} · 예상 월 {stop.expectedRevenue}만원</p>
                    <p className="mt-1 text-xs text-muted-foreground">{stop.address || "주소 미등록"}</p>
                  </div>
                  <Badge className="justify-center bg-accent/20 text-foreground">{stop.score}점</Badge>
                  <span className="text-xs font-bold text-muted-foreground">방문 후보</span>
                </div>
                <div className="mt-3 rounded-md bg-muted/45 p-3">
                  <RouteDistanceAction
                    destinationAddress={stop.address}
                    distanceKm={stop.distanceKm}
                    durationMinutes={stop.durationMinutes}
                    routeProvider={stop.routeProvider}
                  />
                </div>
                <div className="mt-3 border-t border-border pt-3">
                  <VisitResultForm expectedRevenue={stop.expectedRevenue} leadId={stop.id} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FilterButton({ active, label, onClick }: { readonly active: boolean; readonly label: string; readonly onClick: () => void }) {
  return (
    <button
      className={`h-8 rounded-md border px-3 text-xs font-black transition ${
        active ? "border-primary bg-primary text-white" : "border-border bg-white hover:bg-muted"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function filterMarkersForStops(markers: KakaoMapMarker[], stops: RoutePlanStop[], includeOrigin: boolean) {
  const stopAddresses = new Set(stops.map((stop) => stop.address).filter(Boolean));
  return markers.filter((marker) => (includeOrigin && marker.tone === "origin") || stopAddresses.has(marker.address));
}

function createDeliveryVehicles(stops: RoutePlanStop[]): DeliveryVehicle[] {
  const templates = [
    { area: "성동·광진권", driver: "김배송 매니저", id: "truck-1", name: "배송 1호차" },
    { area: "강남·서초권", driver: "박배송 매니저", id: "truck-2", name: "배송 2호차" },
    { area: "송파·위례권", driver: "이배송 매니저", id: "truck-3", name: "배송 3호차" },
    { area: "하남·미사권", driver: "최배송 매니저", id: "truck-4", name: "배송 4호차" },
    { area: "성수·건대권", driver: "정배송 매니저", id: "truck-5", name: "배송 5호차" },
    { area: "마포·망원권", driver: "한배송 매니저", id: "truck-6", name: "배송 6호차" },
    { area: "용산·이태원권", driver: "오배송 매니저", id: "truck-7", name: "배송 7호차" },
    { area: "중구·종로권", driver: "서배송 매니저", id: "truck-8", name: "배송 8호차" },
    { area: "분당·판교권", driver: "신배송 매니저", id: "truck-9", name: "배송 9호차" },
    { area: "구리·남양주권", driver: "문배송 매니저", id: "truck-10", name: "배송 10호차" }
  ];
  const sortedStops = [...stops].sort((a, b) => `${a.region}-${a.order}`.localeCompare(`${b.region}-${b.order}`));
  const deliveryPool = createDeliveryStopPool(sortedStops, templates.length * 15);

  return templates.map((template, vehicleIndex) => {
    const vehicleStops = deliveryPool.slice(vehicleIndex * 15, vehicleIndex * 15 + 15).map((stop, stopIndex) => ({
      ...stop,
      order: stopIndex + 1
    }));
    return {
      ...template,
      stops: vehicleStops,
      expectedRevenue: vehicleStops.reduce((total, stop) => total + stop.expectedRevenue, 0),
      totalDistanceKm: roundToOneDecimal(vehicleStops.reduce((total, stop) => total + Number(stop.distanceKm || 0), 0)),
      totalDurationMinutes: vehicleStops.reduce((total, stop) => total + Number(stop.durationMinutes || 0), 0)
    };
  });
}

function createDeliveryStopPool(stops: RoutePlanStop[], totalCount: number): RoutePlanStop[] {
  const seedStops = stops.length ? stops : [createFallbackStop()];

  return Array.from({ length: totalCount }, (_, index) => {
    const source = seedStops[index % seedStops.length];
    const copyRound = Math.floor(index / seedStops.length) + 1;
    return {
      ...source,
      expectedRevenue: Math.max(80, source.expectedRevenue + ((index % 5) - 2) * 12),
      id: `${source.id || "delivery"}-${index + 1}`,
      name: copyRound === 1 ? source.name : `${source.name} 배송처 ${copyRound}`,
      order: index + 1,
      score: Math.max(50, Math.min(99, source.score - (index % 7)))
    };
  });
}

function createFallbackStop(): RoutePlanStop {
  return {
    address: "서울 성동구 성수동",
    expectedRevenue: 120,
    id: "delivery-fallback",
    name: "샘플 거래처",
    order: 1,
    region: "성수동",
    score: 78,
    status: "today"
  };
}

function createDeliveryMarkers(markers: KakaoMapMarker[], stops: RoutePlanStop[]) {
  const origin = markers.find((marker) => marker.tone === "origin");
  const stopMarkers = stops.map((stop, index) => ({
    address: stop.address || "",
    label: String(index + 1),
    name: stop.name,
    tone: "customer" as const,
    x: 18 + ((index * 7) % 68),
    y: 18 + ((index * 11) % 60)
  }));

  return origin ? [origin, ...stopMarkers] : stopMarkers;
}

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function formatMinutes(minutes: number) {
  if (!minutes) return "0분";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}시간 ${rest}분` : `${rest}분`;
}

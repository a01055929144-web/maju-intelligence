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
  addresses: readonly string[];
  stops: RoutePlanStop[];
  totalDistanceKm: number;
  totalDurationMinutes: number;
  expectedRevenue: number;
};

const courseOptions: Array<{ icon: LucideIcon; key: CourseMode; label: string }> = [
  { icon: UsersRound, key: "sales", label: "영업 코스" },
  { icon: PackageCheck, key: "delivery", label: "배송 코스" }
];

const deliveryAddressGroups: ReadonlyArray<readonly string[]> = [
  [
    "서울 성동구 왕십리로 63",
    "서울 성동구 아차산로 100",
    "서울 성동구 성수이로 118",
    "서울 성동구 뚝섬로 273",
    "서울 성동구 광나루로 144",
    "서울 광진구 능동로 92",
    "서울 광진구 아차산로 272",
    "서울 광진구 자양로 117",
    "서울 광진구 군자로 70",
    "서울 광진구 동일로 178",
    "서울 성동구 행당로 84",
    "서울 성동구 독서당로 302",
    "서울 광진구 천호대로 536",
    "서울 광진구 광나루로 361",
    "서울 성동구 고산자로 202"
  ],
  [
    "서울 강남구 테헤란로 152",
    "서울 강남구 논현로 508",
    "서울 강남구 도산대로 145",
    "서울 강남구 압구정로 165",
    "서울 강남구 선릉로 428",
    "서울 서초구 강남대로 373",
    "서울 서초구 서초대로 396",
    "서울 서초구 반포대로 222",
    "서울 서초구 방배로 100",
    "서울 서초구 양재대로 12길 36",
    "서울 강남구 삼성로 212",
    "서울 강남구 학동로 426",
    "서울 강남구 언주로 508",
    "서울 서초구 사임당로 174",
    "서울 서초구 효령로 292"
  ],
  [
    "서울 송파구 올림픽로 300",
    "서울 송파구 송파대로 345",
    "서울 송파구 백제고분로 276",
    "서울 송파구 오금로 87",
    "서울 송파구 가락로 99",
    "서울 송파구 중대로 135",
    "서울 송파구 위례성대로 6",
    "서울 송파구 문정로 83",
    "서울 송파구 양재대로 932",
    "서울 송파구 석촌호수로 210",
    "경기 성남시 수정구 위례광장로 300",
    "경기 성남시 수정구 위례서일로 10",
    "경기 하남시 위례대로 190",
    "경기 하남시 위례학암로 14",
    "서울 송파구 충민로 66"
  ],
  [
    "경기 하남시 미사강변대로 200",
    "경기 하남시 미사강변중앙로 180",
    "경기 하남시 미사대로 750",
    "경기 하남시 조정대로 45",
    "경기 하남시 덕풍동로 111",
    "경기 하남시 신장로 130",
    "경기 하남시 하남대로 802",
    "경기 하남시 감일백제로 105",
    "경기 하남시 초이로 133",
    "경기 하남시 서하남로 488",
    "경기 하남시 검단산로 239",
    "경기 하남시 미사강변한강로 135",
    "경기 하남시 아리수로 570",
    "경기 하남시 대청로 15",
    "경기 하남시 천현로 51"
  ],
  [
    "서울 성동구 연무장길 76",
    "서울 성동구 서울숲2길 32",
    "서울 성동구 성수일로 77",
    "서울 성동구 성수이로 51",
    "서울 성동구 상원길 54",
    "서울 성동구 왕십리로 83",
    "서울 성동구 뚝섬로 379",
    "서울 광진구 동일로 20길 106",
    "서울 광진구 능동로 120",
    "서울 광진구 아차산로 241",
    "서울 광진구 화양동 7-4",
    "서울 광진구 군자로 24",
    "서울 광진구 자양번영로 60",
    "서울 성동구 아차산로 17",
    "서울 성동구 둘레15길 12"
  ],
  [
    "서울 마포구 월드컵로 75",
    "서울 마포구 동교로 162",
    "서울 마포구 양화로 45",
    "서울 마포구 포은로 90",
    "서울 마포구 망원로 74",
    "서울 마포구 독막로 8",
    "서울 마포구 잔다리로 30",
    "서울 마포구 와우산로 94",
    "서울 마포구 성미산로 29",
    "서울 마포구 백범로 35",
    "서울 서대문구 연희로 89",
    "서울 서대문구 신촌로 83",
    "서울 은평구 응암로 189",
    "서울 은평구 통일로 684",
    "서울 마포구 월드컵북로 396"
  ],
  [
    "서울 용산구 이태원로 177",
    "서울 용산구 한강대로 405",
    "서울 용산구 독서당로 46",
    "서울 용산구 녹사평대로 150",
    "서울 용산구 후암로 107",
    "서울 용산구 청파로 378",
    "서울 용산구 회나무로 13",
    "서울 용산구 대사관로 35",
    "서울 용산구 서빙고로 17",
    "서울 용산구 원효로 51",
    "서울 중구 퇴계로 100",
    "서울 중구 다산로 128",
    "서울 중구 동호로 249",
    "서울 용산구 보광로 60",
    "서울 용산구 장문로 23"
  ],
  [
    "서울 중구 세종대로 110",
    "서울 중구 을지로 100",
    "서울 중구 명동길 26",
    "서울 중구 퇴계로 173",
    "서울 중구 마른내로 15",
    "서울 중구 청계천로 40",
    "서울 종로구 종로 1",
    "서울 종로구 대학로 101",
    "서울 종로구 삼청로 30",
    "서울 종로구 율곡로 75",
    "서울 종로구 자하문로 10",
    "서울 종로구 돈화문로 30",
    "서울 종로구 인사동길 49",
    "서울 중구 장충단로 275",
    "서울 중구 남대문로 81"
  ],
  [
    "경기 성남시 분당구 판교역로 166",
    "경기 성남시 분당구 대왕판교로 660",
    "경기 성남시 분당구 운중로 242",
    "경기 성남시 분당구 정자일로 95",
    "경기 성남시 분당구 성남대로 331",
    "경기 성남시 분당구 황새울로 258",
    "경기 성남시 분당구 야탑로 81",
    "경기 성남시 분당구 돌마로 46",
    "경기 성남시 분당구 미금일로 90",
    "경기 성남시 수정구 창업로 54",
    "경기 성남시 수정구 성남대로 1200",
    "경기 성남시 중원구 둔촌대로 80",
    "경기 성남시 분당구 불정로 6",
    "경기 성남시 분당구 수내로 39",
    "경기 성남시 분당구 판교로 255"
  ],
  [
    "경기 구리시 경춘로 261",
    "경기 구리시 안골로 57",
    "경기 구리시 동구릉로 136",
    "경기 구리시 갈매중앙로 89",
    "경기 구리시 벌말로 180",
    "경기 남양주시 다산중앙로 123",
    "경기 남양주시 미금로 103",
    "경기 남양주시 별내중앙로 30",
    "경기 남양주시 순화궁로 249",
    "경기 남양주시 화도읍 마석중앙로 70",
    "경기 남양주시 진접읍 해밀예당1로 50",
    "경기 남양주시 오남읍 진건오남로 806",
    "경기 남양주시 와부읍 덕소로 97",
    "경기 남양주시 평내로 29",
    "경기 남양주시 호평로 46"
  ]
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
    { addresses: deliveryAddressGroups[0], area: "성동·광진권", driver: "김배송 매니저", id: "truck-1", name: "배송 1호차" },
    { addresses: deliveryAddressGroups[1], area: "강남·서초권", driver: "박배송 매니저", id: "truck-2", name: "배송 2호차" },
    { addresses: deliveryAddressGroups[2], area: "송파·위례권", driver: "이배송 매니저", id: "truck-3", name: "배송 3호차" },
    { addresses: deliveryAddressGroups[3], area: "하남·미사권", driver: "최배송 매니저", id: "truck-4", name: "배송 4호차" },
    { addresses: deliveryAddressGroups[4], area: "성수·건대권", driver: "정배송 매니저", id: "truck-5", name: "배송 5호차" },
    { addresses: deliveryAddressGroups[5], area: "마포·망원권", driver: "한배송 매니저", id: "truck-6", name: "배송 6호차" },
    { addresses: deliveryAddressGroups[6], area: "용산·이태원권", driver: "오배송 매니저", id: "truck-7", name: "배송 7호차" },
    { addresses: deliveryAddressGroups[7], area: "중구·종로권", driver: "서배송 매니저", id: "truck-8", name: "배송 8호차" },
    { addresses: deliveryAddressGroups[8], area: "분당·판교권", driver: "신배송 매니저", id: "truck-9", name: "배송 9호차" },
    { addresses: deliveryAddressGroups[9], area: "구리·남양주권", driver: "문배송 매니저", id: "truck-10", name: "배송 10호차" }
  ];
  const sortedStops = [...stops].sort((a, b) => `${a.region}-${a.order}`.localeCompare(`${b.region}-${b.order}`));
  const seedStops = sortedStops.length ? sortedStops : [createFallbackStop()];

  return templates.map((template, vehicleIndex) => {
    const vehicleStops = template.addresses.map((address, stopIndex) => {
      const source = seedStops[(vehicleIndex * 15 + stopIndex) % seedStops.length];
      return {
        ...source,
        address,
        expectedRevenue: Math.max(80, source.expectedRevenue + ((stopIndex % 5) - 2) * 12),
        id: `${template.id}-store-${stopIndex + 1}`,
        name: `${template.area} 거래처 ${String(stopIndex + 1).padStart(2, "0")}`,
        order: stopIndex + 1,
        region: template.area,
        score: Math.max(50, Math.min(99, source.score - (stopIndex % 7)))
      };
    });
    return {
      ...template,
      stops: vehicleStops,
      expectedRevenue: vehicleStops.reduce((total, stop) => total + stop.expectedRevenue, 0),
      totalDistanceKm: roundToOneDecimal(vehicleStops.reduce((total, stop) => total + Number(stop.distanceKm || 0), 0)),
      totalDurationMinutes: vehicleStops.reduce((total, stop) => total + Number(stop.durationMinutes || 0), 0)
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

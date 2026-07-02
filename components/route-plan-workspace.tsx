"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, LucideIcon, MapPin, Navigation, PackageCheck, SlidersHorizontal, Truck, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KakaoAddressMap, KakaoMapMarker } from "@/components/kakao-address-map";
import { RouteBatchDistanceAction } from "@/components/route-batch-distance-action";
import { RouteDistanceAction } from "@/components/route-distance-action";
import { RouteSequence, RouteSequenceAction } from "@/components/route-sequence-action";
import { VisitResultForm } from "@/components/visit-result-form";
import { RoutePlan, RoutePlanStop } from "@/lib/store";

type RoutePlanWorkspaceProps = {
  readonly mapMarkers: KakaoMapMarker[];
  readonly routePlan: RoutePlan;
};

type CourseMode = "sales" | "delivery";
type SalesViewMode = "map" | "stops";
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

const storeNamePool = [
  "마루한식",
  "담소식당",
  "오늘국밥",
  "정성반상",
  "고운분식",
  "성수면옥",
  "바른김밥",
  "서울돈까스",
  "온기식탁",
  "소담카페",
  "브레드하우스",
  "하루초밥",
  "우리반찬",
  "청담국수",
  "미가손만두",
  "라온비스트로",
  "늘봄식당",
  "가온족발",
  "한그릇덮밥",
  "모아치킨",
  "다온갈비",
  "새벽해장국",
  "어반키친",
  "달빛포차",
  "푸른샐러드",
  "더테이블",
  "명가칼국수",
  "제일냉면",
  "풍년쌈밥",
  "올리브델리"
];

export function RoutePlanWorkspace({ mapMarkers, routePlan }: RoutePlanWorkspaceProps) {
  const [courseMode, setCourseMode] = useState<CourseMode>("sales");
  const [salesViewMode, setSalesViewMode] = useState<SalesViewMode>("map");
  const [vehicleId, setVehicleId] = useState("truck-1");
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null);
  const [deliverySequence, setDeliverySequence] = useState<RouteSequence | null>(null);
  const [selectedStoreIdsByVehicle, setSelectedStoreIdsByVehicle] = useState<Record<string, string[]>>({});
  const [region, setRegion] = useState("all");
  const regions = useMemo(() => routePlan.groups.map((group) => group.region), [routePlan.groups]);
  const filteredGroups = useMemo(
    () => (region === "all" ? routePlan.groups : routePlan.groups.filter((group) => group.region === region)),
    [region, routePlan.groups]
  );
  const filteredStops = filteredGroups.flatMap((group) => group.stops);
  const deliveryVehicles = useMemo(() => createDeliveryVehicles(filteredStops), [filteredStops]);
  const selectedVehicle = deliveryVehicles.find((vehicle) => vehicle.id === vehicleId) || deliveryVehicles[0];
  const allDeliveryStops = useMemo(() => deliveryVehicles.flatMap((vehicle) => vehicle.stops), [deliveryVehicles]);
  const defaultDeliveryStoreIds = useMemo(() => selectedVehicle?.stops.map((stop) => stop.id).filter(Boolean) || [], [selectedVehicle]);
  const selectedDeliveryStoreIds = selectedStoreIdsByVehicle[vehicleId] || defaultDeliveryStoreIds;
  const selectedDeliveryStoreIdSet = useMemo(() => new Set(selectedDeliveryStoreIds), [selectedDeliveryStoreIds]);
  const deliveryStops = allDeliveryStops.filter((stop) => selectedDeliveryStoreIdSet.has(stop.id));
  const activeStore = allDeliveryStops.find((store) => store.id === activeStoreId) || deliveryStops[0] || allDeliveryStops[0];
  const destinations = deliveryStops.map((stop) => stop.address || "").filter(Boolean);
  const destinationsKey = destinations.join("|");
  const salesMarkers = filterMarkersForStops(mapMarkers, filteredStops, false);
  const deliveryMarkers = createDeliveryMarkers(mapMarkers, deliveryStops);
  const integratedDeliveryMarkers = deliverySequence ? createRouteMarkersFromSequence(deliverySequence, deliveryStops) : deliveryMarkers;
  const deliveryRoutePath = deliverySequence?.path || [];
  const isSalesCourse = courseMode === "sales";

  useEffect(() => {
    setDeliverySequence(null);
  }, [destinationsKey, vehicleId]);

  function updateSelectedStoreIds(nextStoreIds: string[]) {
    setSelectedStoreIdsByVehicle((current) => ({
      ...current,
      [vehicleId]: nextStoreIds.slice(0, 15)
    }));
  }

  function toggleDeliveryStore(storeId: string) {
    if (selectedDeliveryStoreIdSet.has(storeId)) {
      updateSelectedStoreIds(selectedDeliveryStoreIds.filter((id) => id !== storeId));
      return;
    }

    if (selectedDeliveryStoreIds.length >= 15) return;
    updateSelectedStoreIds([...selectedDeliveryStoreIds, storeId]);
  }

  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-none">
      <CardHeader className="space-y-3 border-b border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="flex items-center gap-2 text-lg text-slate-950">
            <Navigation className="h-5 w-5 text-slate-500" />
            코스 작업공간
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            {courseOptions.map(({ icon: Icon, key, label }) => (
              <button
                key={key}
                className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-bold transition ${
                  courseMode === key ? "border-slate-950 bg-slate-950 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
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
        <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm font-black text-slate-700">
            <SlidersHorizontal className="h-4 w-4 text-slate-500" />
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
            : null}
        </div>
        {!isSalesCourse ? (
          <div className="grid gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 md:grid-cols-2 xl:grid-cols-5">
            {deliveryVehicles.map((vehicle) => (
              <button
                key={vehicle.id}
                className={`p-3 text-left transition ${
                  vehicleId === vehicle.id ? "bg-slate-950 text-white" : "bg-white text-slate-900 hover:bg-slate-50"
                }`}
                onClick={() => setVehicleId(vehicle.id)}
                type="button"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-sm font-black">
                    <Truck className={`h-4 w-4 ${vehicleId === vehicle.id ? "text-white" : "text-emerald-700"}`} />
                    {vehicle.name}
                  </span>
                  <Badge className={vehicleId === vehicle.id ? "bg-white text-slate-950" : "bg-slate-100 text-slate-700"}>
                    {getSelectedStoreCount(selectedStoreIdsByVehicle, vehicle)}곳 선택
                  </Badge>
                </div>
                <p className={`text-xs font-bold ${vehicleId === vehicle.id ? "text-slate-300" : "text-slate-500"}`}>{vehicle.driver} · {vehicle.area}</p>
                <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-md bg-slate-200 text-[11px] font-black">
                  <span className={`px-2 py-1 ${vehicleId === vehicle.id ? "bg-white/10" : "bg-slate-50"}`}>{vehicle.totalDistanceKm.toLocaleString()}km</span>
                  <span className={`px-2 py-1 ${vehicleId === vehicle.id ? "bg-white/10" : "bg-slate-50"}`}>{formatMinutes(vehicle.totalDurationMinutes)}</span>
                  <span className={`px-2 py-1 ${vehicleId === vehicle.id ? "bg-white/10" : "bg-slate-50"}`}>월 {vehicle.expectedRevenue.toLocaleString()}만</span>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-3 bg-slate-50 p-4">
        {!isSalesCourse && selectedVehicle ? (
          <SelectedDeliverySummary selectedCount={deliveryStops.length} selectedVehicle={selectedVehicle} />
        ) : null}

        {isSalesCourse && salesViewMode === "map" ? (
          <div className="space-y-3">
            <KakaoAddressMap markers={salesMarkers} />
            <p className="text-xs font-bold text-muted-foreground">영업 지도에는 선택한 지역의 방문 후보 위치가 표시됩니다.</p>
          </div>
        ) : null}

        {!isSalesCourse ? (
          <div className="space-y-3">
            <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-black text-slate-950">통합 배송 지도</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    선택한 배송지와 티맵 경유 도로 경로를 한 지도에서 확인합니다.
                  </p>
                </div>
                <Badge className={deliverySequence ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}>
                  {deliverySequence ? "티맵 경로 반영" : "배송지 선택 지도"}
                </Badge>
              </div>
              <KakaoAddressMap
                mapClassName="h-[680px]"
                markers={integratedDeliveryMarkers}
                routePath={deliveryRoutePath}
                showList={false}
              />
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
              {selectedVehicle ? (
                <DeliveryStopList
                  allStores={allDeliveryStops}
                  activeStore={activeStore}
                  onClear={() => updateSelectedStoreIds([])}
                  onSelectStore={setActiveStoreId}
                  onSelectAssigned={() => updateSelectedStoreIds(defaultDeliveryStoreIds)}
                  onToggleStore={toggleDeliveryStore}
                  selectedStoreIds={selectedDeliveryStoreIds}
                  vehicle={selectedVehicle}
                />
              ) : null}
              <div className="space-y-3">
                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <RouteBatchDistanceAction buttonLabel="배송 거리 전체 계산" destinations={destinations} />
                </div>
                <RouteSequenceAction
                  buttonLabel="배송 경유 도로 연결"
                  destinations={destinations}
                  onSequenceChange={setDeliverySequence}
                  resultTitle="티맵 실제 배송 도로 경로"
                  showMap={false}
                />
              </div>
            </div>
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

function SelectedDeliverySummary({
  selectedCount,
  selectedVehicle
}: {
  readonly selectedCount: number;
  readonly selectedVehicle: DeliveryVehicle;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-700 text-white">
            <Truck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-black text-slate-500">오늘 선택한 배송차</p>
            <p className="mt-1 text-lg font-black text-slate-950">{selectedVehicle.name}</p>
            <p className="text-xs font-bold text-slate-500">
              {selectedVehicle.driver} · {selectedVehicle.area} · 선택 배송지 {selectedCount}곳
            </p>
          </div>
        </div>
        <Badge className={selectedCount ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}>
          {selectedCount ? "배송지 선택됨" : "배송지 미선택"}
        </Badge>
      </div>
    </div>
  );
}

function DeliveryStopList({
  activeStore,
  allStores,
  onClear,
  onSelectStore,
  onSelectAssigned,
  onToggleStore,
  selectedStoreIds,
  vehicle
}: {
  readonly activeStore?: RoutePlanStop;
  readonly allStores: RoutePlanStop[];
  readonly onClear: () => void;
  readonly onSelectStore: (storeId: string) => void;
  readonly onSelectAssigned: () => void;
  readonly onToggleStore: (storeId: string) => void;
  readonly selectedStoreIds: string[];
  readonly vehicle: DeliveryVehicle;
}) {
  const selectedStoreIdSet = new Set(selectedStoreIds);
  const selectedStores = allStores.filter((store) => selectedStoreIdSet.has(store.id));
  const isSelectionFull = selectedStoreIds.length >= 15;

  function handleStoreCardSelect(storeId: string, checked: boolean) {
    onSelectStore(storeId);
    if (!checked && isSelectionFull) return;
    onToggleStore(storeId);
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-black text-slate-950">{vehicle.name} 배송지 선택</p>
          <p className="text-xs font-medium text-slate-500">{vehicle.driver} · 전체 거래처 {allStores.length}곳 중 오늘 배송지 선택</p>
        </div>
        <Badge className="bg-emerald-50 text-emerald-700">{selectedStoreIds.length}/15곳 선택</Badge>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button className="h-8 rounded-md border border-slate-200 bg-slate-950 px-3 text-xs font-black text-white hover:bg-slate-800" onClick={onSelectAssigned} type="button">
          기본 권역 15곳
        </button>
        <button className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50" onClick={onClear} type="button">
          선택 해제
        </button>
        {isSelectionFull ? <span className="self-center text-xs font-bold text-amber-700">티맵 경유 계산은 최대 15곳까지 선택합니다.</span> : null}
      </div>

      <div className="mb-3 grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-black text-slate-500">오늘 배송지</p>
          {selectedStores.length ? (
            <div className="flex flex-wrap gap-2">
              {selectedStores.map((store, index) => (
                <button
                  key={store.id}
                  className="rounded-md bg-white px-2 py-1 text-left text-xs font-black text-emerald-700 shadow-sm hover:bg-emerald-50"
                  onClick={() => onSelectStore(store.id)}
                  type="button"
                >
                  {index + 1}. {store.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs font-bold text-slate-500">아래 거래처에서 오늘 배송할 매장을 선택하세요.</p>
          )}
        </div>
        {activeStore ? (
          <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-black text-slate-500">매장 상세</p>
                <p className="mt-1 text-base font-black text-slate-950">{activeStore.name}</p>
              </div>
              <Badge className={selectedStoreIdSet.has(activeStore.id) ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}>
                {selectedStoreIdSet.has(activeStore.id) ? "오늘 배송" : "미선택"}
              </Badge>
            </div>
            <div className="space-y-2 text-xs">
              <DetailRow label="주소" value={activeStore.address || "주소 미등록"} />
              <DetailRow label="권역" value={activeStore.region} />
              <DetailRow label="예상매출" value={`월 ${activeStore.expectedRevenue.toLocaleString()}만원`} />
              <DetailRow label="거래점수" value={`${activeStore.score}점`} />
              <DetailRow label="예상거리" value={`${activeStore.distanceKm || 0}km`} />
              <DetailRow label="예상시간" value={formatMinutes(activeStore.durationMinutes || 0)} />
            </div>
          </div>
        ) : null}
      </div>

      <div className="max-h-[420px] overflow-auto rounded-md border border-slate-200 bg-white">
        <div className="grid gap-px bg-slate-200 md:grid-cols-2">
          {allStores.map((stop) => {
            const checked = selectedStoreIdSet.has(stop.id);
            const isDisabled = !checked && isSelectionFull;
            return (
              <div
                key={stop.id}
                className={`flex cursor-pointer items-start gap-3 border-l-4 p-3 text-sm transition hover:bg-slate-50 ${
                  checked ? "border-l-emerald-600 bg-emerald-50" : "border-l-transparent bg-white"
                } ${activeStore?.id === stop.id ? "ring-2 ring-inset ring-slate-950" : ""} ${
                  isDisabled ? "cursor-not-allowed opacity-60" : ""
                }`}
                onClick={() => handleStoreCardSelect(stop.id, checked)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  handleStoreCardSelect(stop.id, checked);
                }}
                role="button"
                tabIndex={0}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-white ${
                    checked ? "border-emerald-700 bg-emerald-700" : "border-slate-300 bg-white"
                  }`}
                >
                  {checked ? <Check className="h-3.5 w-3.5" /> : null}
                </span>
                <div>
                  <p className="font-black text-slate-950">{stop.name}</p>
                  <p className="text-xs font-medium text-slate-500">{stop.region} · {stop.address || "주소 미등록"}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {stop.distanceKm || 0}km · {formatMinutes(stop.durationMinutes || 0)} · 예상 월 {stop.expectedRevenue.toLocaleString()}만원
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-2">
      <span className="font-black text-slate-500">{label}</span>
      <span className="font-bold text-slate-900">{value}</span>
    </div>
  );
}

function getSelectedStoreCount(selectedStoreIdsByVehicle: Record<string, string[]>, vehicle: DeliveryVehicle) {
  return selectedStoreIdsByVehicle[vehicle.id]?.length ?? vehicle.stops.length;
}

function ViewButton({ active, label, onClick }: { readonly active: boolean; readonly label: string; readonly onClick: () => void }) {
  return (
    <button
      className={`h-9 rounded-md border px-3 text-sm font-bold transition ${
        active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
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
        active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
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
        name: createStoreName(vehicleIndex, stopIndex),
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

function createStoreName(vehicleIndex: number, stopIndex: number) {
  const baseName = storeNamePool[(vehicleIndex * 15 + stopIndex) % storeNamePool.length];
  const district = ["성동", "강남", "송파", "하남", "성수", "마포", "용산", "종로", "판교", "구리"][vehicleIndex] || "서울";
  return `${district} ${baseName} ${String(stopIndex + 1).padStart(2, "0")}`;
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

function createRouteMarkersFromSequence(sequence: RouteSequence, stops: RoutePlanStop[]) {
  const stopByAddress = new Map(stops.map((stop) => [stop.address, stop]));
  const stopMarkers = sequence.stops.map((address, index) => {
    const stop = stopByAddress.get(address);
    return {
      address,
      label: String(index + 1),
      name: stop?.name || `경유 ${index + 1}`,
      tone: "customer" as const,
      x: 18 + ((index * 7) % 68),
      y: 18 + ((index * 11) % 60)
    };
  });

  return [
    {
      address: sequence.originAddress,
      label: "출발",
      name: "물류 출발지",
      tone: "origin" as const,
      x: 72,
      y: 62
    },
    ...stopMarkers
  ];
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

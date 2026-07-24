"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CalendarDays, Check, CheckCircle2, ChevronDown, Clock, Edit3, FileImage, MapPin, Navigation, PanelLeftClose, PanelLeftOpen, Plus, RefreshCw, Search, Truck, UserRound, X } from "lucide-react";
import { KakaoAddressMap, KakaoMapMarker } from "@/components/kakao-address-map";
import { DeliveryVehicle } from "@/components/route-plan-workspace";
import { RouteSequence, RouteSequenceAction } from "@/components/route-sequence-action";
import { RoutePlan, RoutePlanStop } from "@/lib/store";

type RevenueGrade = "A" | "B" | "C";
type GradeFilter = "all" | RevenueGrade;
type MarkerViewMode = "grade" | "vehicle";
type WorkspaceView = "map" | "customers" | "course";

type StoreRow = RoutePlanStop & {
  accountCopyStatus: "missing" | "received";
  bankAccount: string;
  birthDate: string;
  businessCertificateStatus: "missing" | "received";
  businessRegistrationNumber: string;
  businessStatus: "active" | "closed" | "unknown";
  deliveryArea?: string;
  deliveryDriver?: string;
  deliveryVehicleId?: string;
  deliveryVehicleName?: string;
  email: string;
  grade: RevenueGrade;
  industry: string;
  markerX: number;
  markerY: number;
  memo: string;
  openingDate: string;
  phone: string;
  representativeName: string;
};

type RoutePlanStoreDetails = RoutePlanStop & {
  businessNumber?: string;
  businessStatus?: string;
  loadingPosition?: string;
  memo?: string;
};

type StoreEdit = Partial<
  Pick<
    StoreRow,
    | "accountCopyStatus"
    | "address"
    | "bankAccount"
    | "birthDate"
    | "businessCertificateStatus"
    | "businessRegistrationNumber"
    | "businessStatus"
    | "deliveryArea"
    | "deliveryDriver"
    | "email"
    | "expectedRevenue"
    | "grade"
    | "industry"
    | "memo"
    | "name"
    | "openingDate"
    | "phone"
    | "representativeName"
    | "status"
  >
>;
type VehicleEdit = Partial<Pick<DeliveryVehicle, "area" | "driver">>;

type StoreHistoryItem = {
  id: string;
  memo: string;
  recordedAt: string;
};

type StoreAttachment = {
  businessCertificate?: AttachmentFile;
  bankbookCopy?: AttachmentFile;
  loadingPositionMedia?: AttachmentFile[];
};

type AttachmentFile = {
  dataUrl?: string;
  mediaType?: "file" | "image" | "video";
  name: string;
};

type BusinessOcrSuggestion = {
  businessRegistrationNumber: string;
  businessStatus: StoreRow["businessStatus"];
  companyName: string;
  openingDate: string;
  representativeName: string;
};

type SalesRouteMapWorkspaceProps = {
  readonly mapMarkers: KakaoMapMarker[];
  readonly routePlan: RoutePlan;
};

type CourseSummary = {
  distanceKm: number;
  durationMinutes: number;
  expectedRevenue: number;
  selectedCount: number;
};

const gradeFilters: Array<{ label: string; value: GradeFilter }> = [
  { label: "전체", value: "all" },
  { label: "A등급", value: "A" },
  { label: "B등급", value: "B" },
  { label: "C등급", value: "C" }
];
const workspaceViews: Array<{ label: string; value: WorkspaceView }> = [
  { label: "지도", value: "map" },
  { label: "거래처 목록", value: "customers" },
  { label: "경유 코스", value: "course" }
];
const workspaceViewDescriptions: Record<WorkspaceView, string> = {
  course: "배송차별 매장을 선택하고 티맵 경유 순서를 계산합니다.",
  customers: "전체 거래처를 검색, 등급, 배송차 기준으로 정리합니다.",
  map: "매장 등급 또는 배송차 기준으로 지도 마커를 확인합니다."
};
const originMarkerId = "origin-hub";
const tmapWaypointLimit = 15;
const vehicleMarkerColors = ["#2563eb", "#059669", "#dc2626", "#7c3aed", "#ea580c", "#0891b2", "#be123c", "#4f46e5", "#16a34a", "#9333ea"];

const localStoreKeys = {
  attachments: "maju:sales-route:attachments",
  histories: "maju:sales-route:histories",
  storeEdits: "maju:sales-route:store-edits",
  vehicleEdits: "maju:sales-route:vehicle-edits"
};

export function SalesRouteMapWorkspace({ mapMarkers, routePlan }: SalesRouteMapWorkspaceProps) {
  const [query, setQuery] = useState("");
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("all");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [mapFocusId, setMapFocusId] = useState("");
  const [previewStoreId, setPreviewStoreId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [activeView, setActiveView] = useState<WorkspaceView>("map");
  const [excludeClosedStores, setExcludeClosedStores] = useState(false);
  const [markerViewMode, setMarkerViewMode] = useState<MarkerViewMode>("grade");
  const [storeAttachments, setStoreAttachments] = useState<Record<string, StoreAttachment>>(() => readLocalJson(localStoreKeys.attachments, {}));
  const [storeEdits, setStoreEdits] = useState<Record<string, StoreEdit>>(() => readLocalJson(localStoreKeys.storeEdits, {}));
  const [storeHistories, setStoreHistories] = useState<Record<string, StoreHistoryItem[]>>(() => readLocalJson(localStoreKeys.histories, {}));
  const [vehicleEdits, setVehicleEdits] = useState<Record<string, VehicleEdit>>(() => readLocalJson(localStoreKeys.vehicleEdits, {}));
  const [courseSummary, setCourseSummary] = useState<CourseSummary | null>(null);
  const [vehicleFilterId, setVehicleFilterId] = useState("all");
  const routeSeedStores = useMemo(() => createStoreRows(routePlan, mapMarkers), [mapMarkers, routePlan]);
  const deliveryVehicles = useMemo(() => applyVehicleEdits(createDeliveryVehiclesFromStores(routeSeedStores), vehicleEdits), [routeSeedStores, vehicleEdits]);
  const allStores = useMemo(() => applyStoreEdits(createDeliveryStoreRows(deliveryVehicles, mapMarkers), storeEdits), [deliveryVehicles, mapMarkers, storeEdits]);
  const gradeBaseStores = useMemo(
    () =>
      allStores.filter((store) => {
        const keyword = query.trim().toLowerCase();
        const matchesQuery =
          !keyword ||
          `${store.name} ${store.region} ${store.address || ""} ${store.businessRegistrationNumber} ${store.deliveryDriver || ""} ${store.deliveryVehicleName || ""}`
            .toLowerCase()
            .includes(keyword);
        const matchesVehicle = vehicleFilterId === "all" || store.deliveryVehicleId === vehicleFilterId;
        const matchesStatus = !excludeClosedStores || store.businessStatus !== "closed";
        return matchesQuery && matchesVehicle && matchesStatus;
      }),
    [allStores, excludeClosedStores, query, vehicleFilterId]
  );
  const visibleStores = useMemo(
    () => gradeBaseStores.filter((store) => gradeFilter === "all" || store.grade === gradeFilter),
    [gradeBaseStores, gradeFilter]
  );
  const selectedStore = allStores.find((store) => store.id === selectedId);
  const previewStore = allStores.find((store) => store.id === previewStoreId);
  const gradeCounts = useMemo(() => countGrades(gradeBaseStores), [gradeBaseStores]);
  const routeTotals = useMemo(() => getStoreTotals(visibleStores), [visibleStores]);
  const allStoreTotals = useMemo(() => getStoreTotals(allStores), [allStores]);
  const vehicleMarkerMeta = useMemo(() => createVehicleMarkerMeta(deliveryVehicles), [deliveryVehicles]);
  const markers = useMemo(() => createMarkers(mapMarkers, visibleStores, markerViewMode, vehicleMarkerMeta), [mapMarkers, markerViewMode, vehicleMarkerMeta, visibleStores]);
  const deliveryDefaults = useMemo(() => getDeliveryDefaults(deliveryVehicles), [deliveryVehicles]);
  const selectedVehicle = deliveryVehicles.find((vehicle) => vehicle.id === vehicleFilterId);
  const isVehicleFiltered = vehicleFilterId !== "all";
  const selectedVehicleLabel = selectedVehicle ? selectedVehicle.name : "전체 매장";
  const selectedGradeLabel = gradeFilter === "all" ? "전체" : `${gradeFilter}등급`;
  const selectedGradeCount = gradeFilter === "all" ? gradeBaseStores.length : gradeCounts[gradeFilter];
  const kpiSummary = activeView === "course" && courseSummary ? courseSummary : null;
  const distanceKpiHelper = kpiSummary ? "티맵 경유 순서 계산값" : "출발지에서 각 매장까지의 단건 거리 합계";
  const durationKpiHelper = kpiSummary ? "티맵 경유 순서 계산값" : "출발지에서 각 매장까지의 단건 시간 합계";
  const activeFilterLabels = [
    query.trim() ? `검색: ${query.trim()}` : "",
    isVehicleFiltered ? `배송차: ${selectedVehicleLabel}` : "",
    gradeFilter !== "all" ? `등급: ${selectedGradeLabel}` : "",
    excludeClosedStores ? "이탈 제외" : ""
  ].filter(Boolean);
  const selectedVehicleStoreCount = selectedVehicle?.stops.length ?? allStores.length;
  const routeReadinessItems = [
    {
      done: isVehicleFiltered,
      label: "배송차 선택",
      value: isVehicleFiltered ? selectedVehicleLabel : "전체 매장 보기"
    },
    {
      done: selectedVehicleStoreCount > 0,
      label: "관리 매장",
      value: `${selectedVehicleStoreCount.toLocaleString()}곳`
    },
    {
      done: activeView === "course",
      label: "작업 화면",
      value: activeView === "course" ? "경유 코스" : "지도 확인"
    },
    {
      done: Boolean(kpiSummary),
      label: "티맵 계산",
      value: kpiSummary ? `${kpiSummary.selectedCount.toLocaleString()}곳 완료` : "계산 전"
    }
  ];
  const selectVehicle = (vehicleId: string) => {
    setVehicleFilterId(vehicleId);
    setGradeFilter("all");
    setMapFocusId("");
    setPreviewStoreId("");
    setSelectedId("");
  };

  const focusOrigin = () => {
    setActiveView("map");
    setMapFocusId(originMarkerId);
    setPreviewStoreId("");
    setSelectedId("");
  };

  const resetWorkspace = () => {
    setActiveView("map");
    setCourseSummary(null);
    setExcludeClosedStores(false);
    setGradeFilter("all");
    setMapFocusId("");
    setMarkerViewMode("grade");
    setPreviewStoreId("");
    setQuery("");
    setSelectedId("");
    setVehicleFilterId("all");
  };
  const changeWorkspaceView = (nextView: WorkspaceView) => {
    setActiveView(nextView);
    setPreviewStoreId("");
    setMapFocusId("");
    if (nextView === "course" && vehicleFilterId === "all" && deliveryVehicles[0]) {
      selectVehicle(deliveryVehicles[0].id);
    }
  };

  useEffect(() => saveLocalJson(localStoreKeys.attachments, storeAttachments), [storeAttachments]);
  useEffect(() => saveLocalJson(localStoreKeys.histories, storeHistories), [storeHistories]);
  useEffect(() => saveLocalJson(localStoreKeys.storeEdits, storeEdits), [storeEdits]);
  useEffect(() => saveLocalJson(localStoreKeys.vehicleEdits, vehicleEdits), [vehicleEdits]);

  async function updateStore(storeId: string, edit: StoreEdit) {
    const currentStore = allStores.find((store) => store.id === storeId);
    if (!currentStore) return { persisted: false };

    const nextStore = { ...currentStore, ...edit };
    setStoreEdits((current) => ({ ...current, [storeId]: { ...current[storeId], ...edit } }));

    const response = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toCustomerPayload(nextStore))
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message || "거래처 저장에 실패했습니다.");
    return { persisted: payload?.persisted !== false };
  }

  return (
    <div className="flex h-[calc(100vh-112px)] min-h-[720px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-900 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
      <header className="flex flex-col gap-3 border-b border-slate-200/80 bg-white px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h2 className="whitespace-nowrap text-[18px] font-black leading-tight">영업·배송 통합 지도</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">거래처 위치, 매출 등급, 방문·배송 우선순위를 한 화면에서 확인합니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50/80 p-1.5">
            <span className="hidden px-2 text-[11px] font-black uppercase tracking-wide text-slate-400 2xl:inline">마커</span>
            {[
              { label: "매장 등급별", value: "grade" },
              { label: "배송차별", value: "vehicle" }
            ].map((item) => (
              <button
                className={`h-8 rounded-md px-3 text-xs font-black transition ${markerViewMode === item.value ? "bg-blue-700 text-white shadow-sm" : "text-slate-500 hover:bg-white hover:text-blue-800"}`}
                key={item.value}
                onClick={() => setMarkerViewMode(item.value as MarkerViewMode)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
          <nav className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-1 shadow-sm">
            <span className="hidden px-2 text-[11px] font-black uppercase tracking-wide text-slate-400 2xl:inline">업무 탭</span>
            {workspaceViews.map((item) => (
              <button
                className={`group h-9 rounded-md px-3 text-left text-xs font-black transition ${activeView === item.value ? "bg-teal-700 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-teal-800"}`}
                key={item.value}
                onClick={() => changeWorkspaceView(item.value)}
                title={workspaceViewDescriptions[item.value]}
                type="button"
              >
                <span className="block leading-none">{item.label}</span>
                <span className={`mt-1 hidden text-[10px] font-bold leading-none 2xl:block ${activeView === item.value ? "text-white/75" : "text-slate-400 group-hover:text-teal-600"}`}>
                  {item.value === "map" ? "현황" : item.value === "customers" ? "관리" : "계산"}
                </span>
              </button>
            ))}
          </nav>
          <span className="hidden text-xs font-bold text-slate-400 2xl:inline">기존 영업·배송 데이터 기준</span>
          <button
            aria-label="필터 초기화"
            className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-500 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
            onClick={resetWorkspace}
            title="필터 초기화"
            type="button"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 border-b border-slate-200/80 bg-slate-50/60 lg:grid-cols-3 2xl:grid-cols-5">
        <Kpi
          helper={`전체 ${gradeBaseStores.length} · A ${gradeCounts.A} · B ${gradeCounts.B} · C ${gradeCounts.C}`}
          label={kpiSummary ? "선택 경유지" : `${isVehicleFiltered ? selectedVehicleLabel : "등급 매장"} · ${selectedGradeLabel}`}
          tone={gradeFilter === "A" ? "green" : gradeFilter === "C" ? "purple" : "blue"}
          value={`${kpiSummary?.selectedCount ?? selectedGradeCount}곳`}
        />
        <Kpi
          helper={selectedVehicle ? `${selectedVehicle.driver} · ${selectedVehicle.area}` : "전체 배송차 기준"}
          label={selectedVehicle ? "선택 배송차" : "배송차량"}
          tone="blue"
          value={selectedVehicle ? selectedVehicle.name : `${deliveryVehicles.length}대`}
        />
        <Kpi label="매장 매출합" tone="green" value={`${(kpiSummary?.expectedRevenue ?? routeTotals.expectedRevenue).toLocaleString()}만원`} />
        <Kpi helper={distanceKpiHelper} label={kpiSummary ? "경유 코스 거리" : "출발지 기준 거리합"} tone="purple" value={`${(kpiSummary?.distanceKm ?? routeTotals.distanceKm).toLocaleString()}km`} />
        <Kpi helper={durationKpiHelper} label={kpiSummary ? "경유 코스 시간" : "출발지 기준 시간합"} tone="red" value={formatMinutes(kpiSummary?.durationMinutes ?? routeTotals.durationMinutes)} />
      </section>

      <RouteBasisStrip
        allStoreCount={allStores.length}
        allStoreTotals={allStoreTotals}
        currentStoreCount={visibleStores.length}
        currentTotals={routeTotals}
        routePlan={routePlan}
      />

      <RouteWorkspaceGuide
        activeView={activeView}
        courseSummary={courseSummary}
        markerViewMode={markerViewMode}
        selectedVehicleLabel={selectedVehicleLabel}
        visibleStoreCount={visibleStores.length}
      />
      <RouteReadinessPanel
        activeView={activeView}
        items={routeReadinessItems}
        onOpenCourse={() => changeWorkspaceView("course")}
        selectedVehicle={selectedVehicle}
      />

      <section className="grid gap-2 border-b border-slate-200/80 bg-white px-4 py-2.5 xl:grid-cols-[minmax(260px,1fr)_auto] xl:items-start">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="h-10 w-full rounded-md border border-slate-200 bg-white/90 pl-9 pr-3 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:ring-2 focus:ring-teal-100"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="거래처명·지역·주소 검색..."
            value={query}
          />
        </label>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <MarkerModeLegend mode={markerViewMode} vehicles={deliveryVehicles} />
          {gradeFilters.map((filter) => (
            <button
              className={`h-9 rounded-md border px-3 text-xs font-black transition ${
                gradeFilter === filter.value ? "border-teal-700 bg-teal-700 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"
              }`}
              key={filter.value}
              onClick={() => setGradeFilter(filter.value)}
              type="button"
            >
              {filter.label}
            </button>
          ))}
          <button
            aria-pressed={excludeClosedStores}
            className={`h-9 rounded-md border px-3 text-xs font-black transition ${
              excludeClosedStores ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-slate-700 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"
            }`}
            onClick={() => setExcludeClosedStores((value) => !value)}
            type="button"
          >
            {excludeClosedStores ? "이탈 제외 중" : "이탈 제외"}
          </button>
          <button className="h-9 rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800" onClick={focusOrigin} type="button">
            내 위치
          </button>
          <span className="rounded-md bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">
            {selectedVehicleLabel}
          </span>
          <span className="ml-1 text-xs font-black text-slate-500">
            {visibleStores.length}/{allStores.length}개
          </span>
        </div>
        <div className="flex min-h-7 flex-wrap items-center gap-2 xl:col-span-2">
          <span className="text-xs font-black text-slate-400">적용 조건</span>
          {activeFilterLabels.length ? (
            activeFilterLabels.map((label) => (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 ring-1 ring-inset ring-slate-200" key={label}>
                {label}
              </span>
            ))
          ) : (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 ring-1 ring-inset ring-emerald-100">전체 매장 표시 중</span>
          )}
        </div>
      </section>

      {activeView === "map" ? (
        <section className={`grid min-h-0 flex-1 grid-cols-1 ${leftCollapsed ? "xl:grid-cols-[56px_minmax(0,1fr)_360px]" : "xl:grid-cols-[320px_minmax(0,1fr)_360px]"}`}>
          <DeliveryAssignmentPanel
            collapsed={leftCollapsed}
            onSelectVehicle={selectVehicle}
            onToggleCollapsed={() => setLeftCollapsed((value) => !value)}
            onUpdateVehicle={(vehicleId, edit) => setVehicleEdits((current) => ({ ...current, [vehicleId]: { ...current[vehicleId], ...edit } }))}
            selectedVehicleId={vehicleFilterId}
            totalStores={allStores.length}
            vehicles={deliveryVehicles}
          />

          <div className="relative min-h-0 min-w-0 bg-slate-100">
            <div className="h-full [&>div]:h-full">
              <KakaoAddressMap
                focusedMarkerId={previewStoreId || selectedId || mapFocusId || undefined}
                mapClassName="h-[720px] min-h-[620px] rounded-none border-0 xl:h-full"
                markers={markers}
                onMarkerClick={(marker) => {
                  if (!marker.id || marker.tone === "origin") return;
                  setMapFocusId("");
                  setPreviewStoreId(marker.id);
                }}
                showList={false}
              />
            </div>
            {previewStore ? (
              <StoreQuickCard
                onClose={() => setPreviewStoreId("")}
                onOpenDetail={() => {
                  setSelectedId(previewStore.id);
                  setPreviewStoreId("");
                }}
                store={previewStore}
              />
            ) : null}
          </div>

          <StoreManagementPanel
            onSelectStore={setSelectedId}
            selectedStoreId={selectedId}
            title={selectedVehicle ? `${selectedVehicle.name} 거래처` : "전체 매장 거래처"}
            stores={visibleStores}
          />
        </section>
      ) : null}

      {activeView === "customers" ? (
        <CustomerDirectoryView
            onSelectStore={setSelectedId}
            selectedStoreId={selectedId}
            stores={visibleStores}
        />
      ) : null}

      {activeView === "course" ? (
        <TodayCourseView
          markers={markers}
          onPreviewStore={setPreviewStoreId}
          onSummaryChange={setCourseSummary}
          onSelectStore={setSelectedId}
          onSelectVehicle={selectVehicle}
          routeTotals={routeTotals}
          selectedStoreId={selectedId}
          selectedVehicle={selectedVehicle}
          selectedVehicleId={vehicleFilterId}
          stores={visibleStores}
          vehicles={deliveryVehicles}
        />
      ) : null}
      {selectedStore ? (
        <StoreDetail
          attachments={storeAttachments[selectedStore.id] || {}}
          areaOptions={deliveryDefaults.areas}
          driverOptions={deliveryDefaults.drivers}
          history={storeHistories[selectedStore.id] || []}
          key={selectedStore.id}
          onClose={() => setSelectedId("")}
          onClearHistory={(storeId) =>
            setStoreHistories((current) => ({
              ...current,
              [storeId]: []
            }))
          }
          onDeleteHistory={(storeId, historyId) =>
            setStoreHistories((current) => ({
              ...current,
              [storeId]: (current[storeId] || []).filter((item) => item.id !== historyId)
            }))
          }
          onSaveAttachment={(slot, file) =>
            setStoreAttachments((current) => ({
              ...current,
              [selectedStore.id]: {
                ...current[selectedStore.id],
                [slot]: file
              }
            }))
          }
          onSaveLoadingMedia={(files) =>
            setStoreAttachments((current) => ({
              ...current,
              [selectedStore.id]: {
                ...current[selectedStore.id],
                loadingPositionMedia: [...(current[selectedStore.id]?.loadingPositionMedia || []), ...files]
              }
            }))
          }
          onUpdateStore={updateStore}
          onWriteHistory={(storeId, memo) =>
            setStoreHistories((current) => ({
              ...current,
              [storeId]: [
                {
                  id: `${storeId}-${Date.now()}`,
                  memo,
                  recordedAt: new Date().toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })
                },
                ...(current[storeId] || [])
              ]
            }))
          }
          store={selectedStore}
        />
      ) : null}
    </div>
  );
}

function DeliveryAssignmentPanel({
  collapsed,
  onSelectVehicle,
  onToggleCollapsed,
  onUpdateVehicle,
  selectedVehicleId,
  totalStores,
  vehicles
}: {
  readonly collapsed: boolean;
  readonly onSelectVehicle: (vehicleId: string) => void;
  readonly onToggleCollapsed: () => void;
  readonly onUpdateVehicle: (vehicleId: string, edit: VehicleEdit) => void;
  readonly selectedVehicleId: string;
  readonly totalStores: number;
  readonly vehicles: DeliveryVehicle[];
}) {
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);

  if (collapsed) {
    return (
      <aside className="flex min-h-0 flex-col items-center gap-3 border-r border-slate-200/80 bg-white py-3">
        <button
          aria-label="배송 담당자 패널 펼치기"
          className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
          onClick={onToggleCollapsed}
          type="button"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
        <Truck className="h-5 w-5 text-slate-500" />
        <span className="[writing-mode:vertical-rl] text-xs font-black text-slate-500">담당자필터</span>
      </aside>
    );
  }

  return (
    <aside className="min-h-0 border-r border-slate-200/80 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-slate-950">
            <Truck className="h-4 w-4 text-slate-500" />
            배송담당자 필터
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">담당자별 거래처만 지도에 표시합니다.</p>
        </div>
        <button
          aria-label="배송 담당자 패널 접기"
          className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
          onClick={onToggleCollapsed}
          type="button"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-2 p-3 pb-0">
        <button
          className={`w-full rounded-md border p-3 text-left transition ${
            selectedVehicleId === "all" ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900/5" : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
          onClick={() => onSelectVehicle("all")}
          type="button"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-black text-slate-950">전체 담당자</p>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-slate-700 ring-1 ring-inset ring-slate-200">{totalStores}곳</span>
          </div>
          <p className="mt-1 text-xs font-bold text-slate-500">담당자 필터 없이 모든 배송 매장 표시</p>
        </button>
      </div>
      <div className="max-h-[calc(100vh-520px)] min-h-[420px] space-y-2 overflow-auto p-3 pt-2">
        {vehicles.map((vehicle) => {
          const selected = vehicle.id === selectedVehicleId;
          const editing = editingVehicleId === vehicle.id;
          return (
            <div
              className={`w-full rounded-md border p-3 text-left transition ${
                selected ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900/5" : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
              key={vehicle.id}
            >
              {editing ? (
                <VehicleEditForm onCancel={() => setEditingVehicleId(null)} onSave={(edit) => {
                  onUpdateVehicle(vehicle.id, edit);
                  setEditingVehicleId(null);
                }} vehicle={vehicle} />
              ) : (
                <button className="block w-full text-left" onClick={() => onSelectVehicle(vehicle.id)} type="button">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-black text-slate-950">{vehicle.name}</p>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-slate-700 ring-1 ring-inset ring-slate-200">
                      {vehicle.stops.length}곳
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs font-bold text-slate-500">
                    <UserRound className="h-3.5 w-3.5" />
                    {vehicle.driver}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-bold text-slate-400">{vehicle.area}</p>
                    <span
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-black text-slate-600 hover:bg-slate-50"
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditingVehicleId(vehicle.id);
                      }}
                      role="button"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      편집
                    </span>
                  </div>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function RouteWorkspaceGuide({
  activeView,
  courseSummary,
  markerViewMode,
  selectedVehicleLabel,
  visibleStoreCount
}: {
  readonly activeView: WorkspaceView;
  readonly courseSummary: CourseSummary | null;
  readonly markerViewMode: MarkerViewMode;
  readonly selectedVehicleLabel: string;
  readonly visibleStoreCount: number;
}) {
  const viewLabel = activeView === "map" ? "지도 확인" : activeView === "customers" ? "거래처 목록" : "경유 코스";
  const markerLabel = markerViewMode === "grade" ? "매장 등급별 마커" : "배송차별 마커";
  const guide =
    activeView === "course"
      ? courseSummary
        ? `${selectedVehicleLabel} 기준 경유 ${courseSummary.selectedCount}곳의 도로 거리와 시간이 계산되었습니다.`
        : `${selectedVehicleLabel} 기준 경유 매장을 선택한 뒤 티맵 계산을 실행하세요.`
      : activeView === "customers"
        ? "목록에서 거래처를 누르면 상세 패널에서 원장, 첨부자료, 메모를 편집할 수 있습니다."
        : "마커를 누르면 간략 카드가 열리고, 상세 버튼으로 거래처 원장을 확인합니다.";

  return (
    <section className="border-b border-slate-200/80 bg-slate-50/70 px-4 py-2.5">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded-md bg-white px-2.5 py-1 text-xs font-black text-slate-800 ring-1 ring-inset ring-slate-200">{viewLabel}</span>
          <span className="rounded-md bg-white px-2.5 py-1 text-xs font-black text-blue-700 ring-1 ring-inset ring-blue-100">{markerLabel}</span>
          <span className="rounded-md bg-white px-2.5 py-1 text-xs font-black text-emerald-700 ring-1 ring-inset ring-emerald-100">{visibleStoreCount.toLocaleString()}개 표시</span>
        </div>
        <p className="min-w-0 text-xs font-bold leading-5 text-slate-500 lg:text-right">{guide}</p>
      </div>
    </section>
  );
}

function RouteReadinessPanel({
  activeView,
  items,
  onOpenCourse,
  selectedVehicle
}: {
  readonly activeView: WorkspaceView;
  readonly items: Array<{ done: boolean; label: string; value: string }>;
  readonly onOpenCourse: () => void;
  readonly selectedVehicle?: DeliveryVehicle;
}) {
  const readyCount = items.filter((item) => item.done).length;
  const needsCourse = activeView !== "course";

  return (
    <section className="border-b border-slate-200/80 bg-white px-4 py-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px] xl:items-center">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <div key={item.label} className={`rounded-md border p-3 ${item.done ? "border-emerald-100 bg-emerald-50/70" : "border-amber-100 bg-amber-50/70"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-black text-slate-500">{item.label}</p>
                {item.done ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <Clock className="h-4 w-4 text-amber-700" />}
              </div>
              <p className="mt-2 truncate text-sm font-black text-slate-950" title={item.value}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-slate-500">코스 준비도</p>
              <p className="mt-1 text-lg font-black text-slate-950">{readyCount}/{items.length}</p>
            </div>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md bg-teal-700 px-3 text-xs font-black text-white shadow-sm transition hover:bg-teal-800"
              onClick={onOpenCourse}
              type="button"
            >
              <Navigation className="h-3.5 w-3.5" />
              {needsCourse ? "경유 코스 열기" : selectedVehicle ? "계산 진행" : "차량 선택"}
            </button>
          </div>
          <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
            {selectedVehicle ? `${selectedVehicle.driver} · ${selectedVehicle.area}` : "차량을 선택하면 해당 담당 매장만 경유 계산 대상으로 좁혀집니다."}
          </p>
        </div>
      </div>
    </section>
  );
}

function StoreQuickCard({
  onClose,
  onOpenDetail,
  store
}: {
  readonly onClose: () => void;
  readonly onOpenDetail: () => void;
  readonly store: StoreRow;
}) {
  return (
    <div className="absolute left-4 top-4 z-30 h-auto w-[min(300px,calc(100%-32px))] rounded-lg border border-slate-200 bg-white/95 shadow-[0_18px_48px_rgba(15,23,42,0.16)] backdrop-blur">
      <div className="flex items-start justify-between gap-2 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="min-w-0 truncate text-[15px] font-black leading-5 text-slate-950">{store.name}</p>
            <span className={businessStatusClass(store.businessStatus)}>{getBusinessStatusLabel(store.businessStatus)}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-700">{store.industry}</span>
          </div>
        </div>
        <button className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={onClose} type="button">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="border-t border-slate-100 px-3.5 py-3">
        <p className="flex gap-2 text-[13px] font-bold leading-5 text-slate-600">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
          <span className="line-clamp-2">{store.address || store.region}</span>
        </p>
        <div className="mt-2.5 flex justify-end">
          <button className="h-7 rounded-md bg-teal-700 px-2.5 text-xs font-black text-white shadow-sm hover:bg-teal-800" onClick={onOpenDetail} type="button">
            상세
          </button>
        </div>
      </div>
    </div>
  );
}

function MarkerModeLegend({ mode, vehicles }: { readonly mode: MarkerViewMode; readonly vehicles: DeliveryVehicle[] }) {
  if (mode === "grade") {
    return (
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
        <span className="mr-1 text-xs font-black text-slate-500">마커</span>
        {[
          ["A", "#7c3aed"],
          ["B", "#2563eb"],
          ["C", "#64748b"]
        ].map(([label, color]) => (
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-700" key={label}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            {label}등급
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex max-w-full flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
      <span className="mr-1 text-xs font-black text-slate-500">마커</span>
      {vehicles.slice(0, 5).map((vehicle, index) => (
        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-700" key={vehicle.id}>
          <span className="grid h-4 min-w-4 place-items-center rounded-full text-[10px] text-white" style={{ backgroundColor: vehicleMarkerColors[index % vehicleMarkerColors.length] }}>
            {index + 1}
          </span>
          {vehicle.name}
        </span>
      ))}
      {vehicles.length > 5 ? <span className="px-1 text-[11px] font-black text-slate-400">+{vehicles.length - 5}</span> : null}
    </div>
  );
}

function VehicleEditForm({
  onCancel,
  onSave,
  vehicle
}: {
  readonly onCancel: () => void;
  readonly onSave: (edit: VehicleEdit) => void;
  readonly vehicle: DeliveryVehicle;
}) {
  const [driver, setDriver] = useState(vehicle.driver);
  const [area, setArea] = useState(vehicle.area);

  return (
    <div className="space-y-2">
      <p className="text-sm font-black text-slate-950">{vehicle.name} 편집</p>
      <input className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm font-bold outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100" onChange={(event) => setDriver(event.target.value)} value={driver} />
      <input className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm font-bold outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100" onChange={(event) => setArea(event.target.value)} value={area} />
      <div className="flex gap-2">
        <button className="h-8 flex-1 rounded-md bg-teal-700 text-xs font-black text-white shadow-sm hover:bg-teal-800" onClick={() => onSave({ area, driver })} type="button">
          저장
        </button>
        <button className="h-8 flex-1 rounded-md border border-slate-200 bg-white text-xs font-black text-slate-600" onClick={onCancel} type="button">
          취소
        </button>
      </div>
    </div>
  );
}

function StoreManagementPanel({
  onSelectStore,
  selectedStoreId,
  stores,
  title
}: {
  readonly onSelectStore: (storeId: string) => void;
  readonly selectedStoreId: string;
  readonly stores: StoreRow[];
  readonly title: string;
}) {
  return (
    <aside className="h-full min-h-0 border-l border-slate-200/80 bg-white">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-950">{title}</p>
            <p className="mt-1 truncate text-xs font-bold text-slate-500">매장을 누르면 상세 패널이 열립니다.</p>
          </div>
          <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{stores.length}곳</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {stores.length ? (
            stores.map((store) => (
              <button
                className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${
                  store.id === selectedStoreId ? "bg-slate-50 shadow-[inset_3px_0_0_#0f172a]" : ""
                }`}
                key={store.id}
                onClick={() => onSelectStore(store.id)}
                type="button"
              >
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-black text-slate-950">{store.name}</p>
                  <span className={gradeBadgeClass(store.grade)}>{store.grade}</span>
                </div>
                <p className="mt-1 truncate text-xs font-bold text-slate-500">{store.address || store.region}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-slate-400">
                    {store.distanceKm?.toLocaleString() || "-"}km · {formatMinutes(store.durationMinutes || 0)} · {store.expectedRevenue.toLocaleString()}만원
                  </p>
                  <span className={businessStatusClass(store.businessStatus)}>{getBusinessStatusLabel(store.businessStatus)}</span>
                </div>
              </button>
            ))
          ) : (
            <div className="grid h-full min-h-[180px] place-items-center px-5 text-center">
              <div>
                <p className="text-sm font-black text-slate-700">조건에 맞는 거래처가 없습니다.</p>
                <p className="mt-2 text-xs font-bold leading-5 text-slate-500">등급 필터나 검색어를 조정해 주세요.</p>
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-bold leading-5 text-slate-500">상세 정보, 메모, 첨부자료는 매장 선택 후 우측 넓은 패널에서 관리합니다.</p>
        </div>
      </div>
    </aside>
  );
}

function CustomerDirectoryView({
  onSelectStore,
  selectedStoreId,
  stores
}: {
  readonly onSelectStore: (storeId: string) => void;
  readonly selectedStoreId: string;
  readonly stores: StoreRow[];
}) {
  const totals = getStoreTotals(stores);
  const gradeCounts = countGrades(stores);
  const closedCount = stores.filter((store) => store.businessStatus === "closed").length;

  return (
    <section className="min-h-0 flex-1 overflow-auto bg-[#f6f8fb] p-4">
      <div className="grid gap-3 lg:grid-cols-4">
        <DirectoryStat label="거래처" value={`${stores.length}곳`} />
        <DirectoryStat label="A등급" value={`${gradeCounts.A}곳`} />
        <DirectoryStat label="예상매출" value={`${totals.expectedRevenue.toLocaleString()}만원`} />
        <DirectoryStat label="사업자 확인" value={`${closedCount}곳`} tone={closedCount ? "rose" : "slate"} />
      </div>

      <div className="mt-4 overflow-hidden rounded-md border border-slate-200/80 bg-white shadow-sm">
        <div className="grid grid-cols-[minmax(180px,1.5fr)_120px_130px_110px_120px_120px] border-b border-slate-200/80 bg-slate-50/80 px-4 py-3 text-xs font-black text-slate-500">
          <span>거래처</span>
          <span>매출등급</span>
          <span>담당자</span>
          <span>예상매출</span>
          <span>거리</span>
          <span>상태</span>
        </div>
        <div className="max-h-[calc(100vh-430px)] overflow-auto">
          {stores.map((store) => (
            <button
              className={`grid w-full grid-cols-[minmax(180px,1.5fr)_120px_130px_110px_120px_120px] items-center gap-0 border-b border-slate-100 px-4 py-3 text-left text-sm transition hover:bg-slate-50 ${
                store.id === selectedStoreId ? "bg-slate-50 shadow-[inset_3px_0_0_#0f172a]" : "bg-white"
              }`}
              key={store.id}
              onClick={() => onSelectStore(store.id)}
              type="button"
            >
              <span className="min-w-0">
                <span className="block truncate font-black text-slate-950">{store.name}</span>
                <span className="mt-1 block truncate text-xs font-bold text-slate-500">{store.address || store.region}</span>
              </span>
              <span>
                <span className={gradeBadgeClass(store.grade)}>{store.grade}</span>
              </span>
              <span className="truncate font-bold text-slate-700">{store.deliveryDriver || "미지정"}</span>
              <span className="font-black text-slate-950">{store.expectedRevenue.toLocaleString()}만원</span>
              <span className="font-bold text-slate-500">{store.distanceKm?.toLocaleString() || "-"}km</span>
              <span>
                <span className={businessStatusClass(store.businessStatus)}>{getBusinessStatusLabel(store.businessStatus)}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function TodayCourseView({
  markers,
  onPreviewStore,
  onSummaryChange,
  onSelectStore,
  onSelectVehicle,
  routeTotals,
  selectedStoreId,
  selectedVehicle,
  selectedVehicleId,
  stores,
  vehicles
}: {
  readonly markers: KakaoMapMarker[];
  readonly onPreviewStore: (storeId: string) => void;
  readonly onSummaryChange: (summary: CourseSummary) => void;
  readonly onSelectStore: (storeId: string) => void;
  readonly onSelectVehicle: (vehicleId: string) => void;
  readonly routeTotals: { distanceKm: number; durationMinutes: number; expectedRevenue: number };
  readonly selectedStoreId: string;
  readonly selectedVehicle?: DeliveryVehicle;
  readonly selectedVehicleId: string;
  readonly stores: StoreRow[];
  readonly vehicles: DeliveryVehicle[];
}) {
  const [routeSequence, setRouteSequence] = useState<RouteSequence | null>(null);
  const [routeBatchIndex, setRouteBatchIndex] = useState(0);
  const [routePanelCollapsed, setRoutePanelCollapsed] = useState(false);
  const [routeQuery, setRouteQuery] = useState("");
  const [routeSelectedStoreId, setRouteSelectedStoreId] = useState("");
  const [selectedRouteStoreIds, setSelectedRouteStoreIds] = useState<string[]>([]);
  const isVehicleScoped = selectedVehicleId !== "all";
  const selectedDriver = selectedVehicle?.driver || "배송차 선택 필요";
  const orderedStores = [...stores].sort((a, b) => a.order - b.order);
  const orderedStoreIds = orderedStores.map((store) => store.id).join("|");
  const selectedRouteIdSet = new Set(selectedRouteStoreIds);
  const selectedRouteStoresAll = orderedStores.filter((store) => selectedRouteIdSet.has(store.id));
  const routeBatchCount = Math.max(1, Math.ceil(selectedRouteStoresAll.length / tmapWaypointLimit));
  const activeRouteBatchIndex = Math.min(routeBatchIndex, routeBatchCount - 1);
  const routeBatchStart = activeRouteBatchIndex * tmapWaypointLimit;
  const selectedRouteStores = selectedRouteStoresAll.slice(routeBatchStart, routeBatchStart + tmapWaypointLimit);
  const activeRouteIdSet = new Set(selectedRouteStores.map((store) => store.id));
  const selectedRouteTotals = getStoreTotals(selectedRouteStores);
  const routeDistanceKm = routeSequence?.totalDistanceKm ?? selectedRouteTotals.distanceKm;
  const routeDurationMinutes = routeSequence?.totalDurationMinutes ?? selectedRouteTotals.durationMinutes;
  const routeRevenue = selectedRouteTotals.expectedRevenue;
  const routeRoadPointCount = routeSequence ? countFiniteRoutePoints(routeSequence.path) : 0;
  const tmapLegCount = routeSequence?.legs.filter((leg) => leg.provider === "tmap").length || 0;
  const inactiveSelectedCount = Math.max(0, selectedRouteStoresAll.length - selectedRouteStores.length);
  const routeCandidateStores = isVehicleScoped
    ? orderedStores.filter((store) => {
        const keyword = routeQuery.trim().toLowerCase();
        if (!keyword) return true;
        return `${store.name} ${store.address || ""} ${store.region} ${store.deliveryDriver || ""}`.toLowerCase().includes(keyword);
      })
    : [];
  const routeSelectedStore = orderedStores.find((store) => store.id === routeSelectedStoreId) || routeCandidateStores[0] || orderedStores[0];
  const originMarker = markers.find((marker) => marker.tone === "origin");
  const sequencedRouteStores = routeSequence?.stops.length
    ? routeSequence.stops
        .map((address) => selectedRouteStores.find((store) => getRouteStopAddress(store) === address))
        .filter((store): store is StoreRow => Boolean(store))
    : selectedRouteStores;
  const routeMapMarkers = [
    ...(originMarker
      ? [
          {
            ...originMarker,
            label: "출발",
            name: "물류 출발지"
          }
        ]
      : []),
    ...sequencedRouteStores.map((store, index) => {
      const marker = markers.find((item) => item.id === store.id);
      return {
        address: marker?.address || store.address || store.region,
        id: store.id,
        label: String(index + 1),
        name: `${index + 1}. ${store.name}`,
        tone: "customer" as const,
        x: marker?.x ?? store.markerX,
        y: marker?.y ?? store.markerY
      };
    })
  ];

  useEffect(() => {
    setRouteSequence(null);
    setRouteBatchIndex(0);
    if (!isVehicleScoped) {
      setSelectedRouteStoreIds([]);
      setRouteSelectedStoreId("");
      return;
    }
    setSelectedRouteStoreIds(orderedStores.slice(0, tmapWaypointLimit).map((store) => store.id));
    setRouteSelectedStoreId(orderedStores[0]?.id || "");
  }, [isVehicleScoped, orderedStoreIds, selectedVehicleId]);

  useEffect(() => {
    setRouteSequence(null);
    setRouteBatchIndex((current) => Math.min(current, Math.max(0, Math.ceil(selectedRouteStoreIds.length / tmapWaypointLimit) - 1)));
  }, [selectedRouteStoreIds]);

  useEffect(() => {
    onSummaryChange({
      distanceKm: routeDistanceKm,
      durationMinutes: routeDurationMinutes,
      expectedRevenue: routeRevenue,
      selectedCount: selectedRouteStores.length
    });
  }, [onSummaryChange, routeDistanceKm, routeDurationMinutes, routeRevenue, selectedRouteStores.length]);

  const toggleRouteStore = (storeId: string) => {
    setSelectedRouteStoreIds((current) => {
      if (current.includes(storeId)) return current.filter((id) => id !== storeId);
      return [...current, storeId];
    });
  };
  const selectDefaultRouteStores = () => {
    setRouteBatchIndex(0);
    setSelectedRouteStoreIds(orderedStores.slice(0, tmapWaypointLimit).map((store) => store.id));
  };
  const selectAllRouteStores = () => {
    setRouteBatchIndex(0);
    setSelectedRouteStoreIds(orderedStores.map((store) => store.id));
  };
  const clearRouteStores = () => {
    setRouteSequence(null);
    setRouteBatchIndex(0);
    setSelectedRouteStoreIds([]);
  };
  const goToPreviousRouteBatch = () => {
    setRouteSequence(null);
    setRouteBatchIndex((current) => Math.max(0, current - 1));
  };
  const goToNextRouteBatch = () => {
    setRouteSequence(null);
    setRouteBatchIndex((current) => Math.min(routeBatchCount - 1, current + 1));
  };
  const openRouteStore = (storeId: string) => {
    setRouteSelectedStoreId(storeId);
  };

  return (
    <section className={`grid min-h-0 flex-1 grid-cols-1 bg-[#f6f8fb] ${routePanelCollapsed ? "xl:grid-cols-[300px_minmax(0,1fr)_60px]" : "xl:grid-cols-[300px_minmax(0,1fr)_440px]"}`}>
      <aside className="min-h-0 border-r border-slate-200/80 bg-white">
        <div className="border-b border-slate-200/80 px-4 py-3">
          <p className="text-sm font-black text-slate-950">경유 코스</p>
          <p className="mt-1 text-xs font-bold text-slate-500">차량을 고른 뒤 경유 매장을 계산합니다.</p>
        </div>
        <div className="border-b border-slate-200/80 p-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-black text-slate-500">실사용 순서</p>
            <div className="mt-3 grid gap-2">
              <RouteWorkStep active={!isVehicleScoped} done={isVehicleScoped} label="배송차 선택" />
              <RouteWorkStep active={isVehicleScoped && selectedRouteStores.length > 0} done={isVehicleScoped && selectedRouteStores.length > 0} label="경유 매장 선택" />
              <RouteWorkStep active={isVehicleScoped && selectedRouteStores.length > 0 && !routeSequence} done={Boolean(routeSequence)} label="티맵 도로 계산" />
              <RouteWorkStep active={Boolean(routeSequence)} done={Boolean(routeSequence)} label="코스 확인" />
            </div>
          </div>
        </div>
        <div className="space-y-2 p-3">
          <button
            className={`w-full rounded-md border p-3 text-left transition ${selectedVehicleId === "all" ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900/5" : "border-slate-200 bg-white hover:bg-slate-50"}`}
            onClick={() => onSelectVehicle("all")}
            type="button"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-black text-slate-950">전체 매장 보기</p>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-blue-700 ring-1 ring-inset ring-blue-200">{stores.length}곳</span>
            </div>
            <p className="mt-1 text-xs font-bold text-slate-500">전체 위치 확인용 · 경유 계산은 차량 선택 후 진행</p>
          </button>
          {vehicles.map((vehicle) => (
            <button
              className={`w-full rounded-md border p-3 text-left transition ${selectedVehicleId === vehicle.id ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
              key={vehicle.id}
              onClick={() => onSelectVehicle(vehicle.id)}
              type="button"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-black text-slate-950">{vehicle.name}</p>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-emerald-700 ring-1 ring-inset ring-emerald-200">{vehicle.stops.length}곳</span>
              </div>
              <p className="mt-1 text-xs font-bold text-slate-500">{vehicle.driver} · {vehicle.area}</p>
            </button>
          ))}
        </div>
      </aside>

      <div className="relative min-h-0 min-w-0 bg-slate-100">
        <div className="h-full [&>div]:h-full">
          <KakaoAddressMap
            focusedMarkerId={routeSelectedStoreId || selectedStoreId || undefined}
            mapClassName="h-[720px] min-h-[620px] rounded-none border-0 xl:h-full"
            markers={routeMapMarkers}
            onMarkerClick={(marker) => {
              if (!marker.id || marker.tone === "origin") return;
              openRouteStore(marker.id);
              onPreviewStore(marker.id);
            }}
            routePath={routeSequence?.path || []}
            showList={false}
          />
        </div>
        {routeSelectedStoreId && routeSelectedStore ? (
          <StoreQuickCard
            onClose={() => setRouteSelectedStoreId("")}
            onOpenDetail={() => onSelectStore(routeSelectedStore.id)}
            store={routeSelectedStore}
          />
        ) : null}
      </div>

      <aside className="min-h-0 border-l border-slate-200/80 bg-white">
        {routePanelCollapsed ? (
          <div className="flex h-full flex-col items-center gap-3 px-2 py-3">
            <button
              aria-label="경유 코스 패널 열기"
              className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              onClick={() => setRoutePanelCollapsed(false)}
              type="button"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
            <div className="[writing-mode:vertical-rl] text-xs font-black text-slate-500">경유 코스</div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{selectedRouteStores.length}</span>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
              <div className="min-w-0">
                  <p className="text-sm font-black text-slate-950">{selectedDriver} 경유 순서</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                  선택 {selectedRouteStoresAll.length}곳 · 계산 {selectedRouteStores.length}/{tmapWaypointLimit}곳 · 경유 {routeDistanceKm.toLocaleString()}km · {formatMinutes(routeDurationMinutes)}
                </p>
              </div>
              <button
                aria-label="경유 코스 패널 접기"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                onClick={() => setRoutePanelCollapsed(true)}
                type="button"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <div className="border-b border-slate-200/80 p-3">
                <div className="mb-3 grid grid-cols-3 gap-2">
                  <RouteMetric label="계산 대상" value={`${selectedRouteStores.length}곳`} />
                  <RouteMetric label={routeSequence ? "도로 경유 거리" : "출발지 거리합"} value={`${routeDistanceKm.toLocaleString()}km`} />
                  <RouteMetric label={routeSequence ? "도로 경유 시간" : "출발지 시간합"} value={formatMinutes(routeDurationMinutes)} />
                </div>
                <div className={`mb-3 rounded-md border p-3 ${routeSequence ? "border-emerald-200 bg-emerald-50" : isVehicleScoped && selectedRouteStores.length ? "border-blue-200 bg-blue-50" : "border-amber-200 bg-amber-50"}`}>
                  <p className={`text-sm font-black ${routeSequence ? "text-emerald-800" : isVehicleScoped && selectedRouteStores.length ? "text-blue-800" : "text-amber-800"}`}>
                    {routeSequence ? "티맵 계산 완료" : isVehicleScoped && selectedRouteStores.length ? "티맵 계산 대기" : isVehicleScoped ? "경유지 선택 필요" : "배송차 선택 필요"}
                  </p>
                  <p className={`mt-1 text-xs font-bold leading-5 ${routeSequence ? "text-emerald-700" : isVehicleScoped && selectedRouteStores.length ? "text-blue-700" : "text-amber-800"}`}>
                    {routeSequence
                      ? `현재 묶음 ${selectedRouteStores.length}곳의 도로 경로를 지도에 반영했습니다.`
                      : isVehicleScoped && selectedRouteStores.length
                        ? `${activeRouteBatchIndex + 1}묶음 ${selectedRouteStores.length}곳을 계산할 준비가 됐습니다. 버튼을 눌러 도로 기준 경유 거리와 시간을 갱신하세요.`
                        : isVehicleScoped
                          ? "아래 매장 목록에서 경유지를 추가하세요."
                          : "왼쪽에서 배송차를 선택하면 해당 차량의 매장만 경유 계산 대상으로 표시됩니다."}
                  </p>
                </div>
                {isVehicleScoped ? (
                  <RouteSequenceAction
                    buttonLabel={`${activeRouteBatchIndex + 1}묶음 티맵 계산`}
                    destinations={selectedRouteStores.map((store) => getRouteStopAddress(store)).filter(Boolean)}
                    onSequenceChange={setRouteSequence}
                    showMap={false}
                  />
                ) : null}
              </div>
              <div className="space-y-2 border-b border-slate-200/80 p-3">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-bold outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-100"
                    onChange={(event) => setRouteQuery(event.target.value)}
                    placeholder="경유 매장 검색..."
                    value={routeQuery}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button className="h-8 rounded-md bg-teal-700 px-3 text-xs font-black text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!isVehicleScoped} onClick={selectDefaultRouteStores} type="button">
                    기본 15곳 선택
                  </button>
                  <button className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={!isVehicleScoped} onClick={selectAllRouteStores} type="button">
                    전체 선택
                  </button>
                  <button className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={!isVehicleScoped} onClick={clearRouteStores} type="button">
                    선택 해제
                  </button>
                  <span className="inline-flex h-8 items-center rounded-md bg-slate-100 px-3 text-xs font-black text-slate-700">
                    {activeRouteBatchIndex + 1}/{routeBatchCount}묶음 · 계산 {selectedRouteStores.length}곳
                  </span>
                  {inactiveSelectedCount ? <span className="inline-flex h-8 items-center rounded-md bg-slate-100 px-3 text-xs font-black text-slate-600">다른 묶음 {inactiveSelectedCount}곳</span> : null}
                </div>
                {routeBatchCount > 1 ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={activeRouteBatchIndex === 0}
                      onClick={goToPreviousRouteBatch}
                      type="button"
                    >
                      이전 15곳
                    </button>
                    <button
                      className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={activeRouteBatchIndex >= routeBatchCount - 1}
                      onClick={goToNextRouteBatch}
                      type="button"
                    >
                      다음 15곳
                    </button>
                  </div>
                ) : null}
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold leading-5 text-slate-500">
                  티맵 경유지 제한 때문에 실제 도로 계산은 최대 {tmapWaypointLimit}곳씩 나눠 처리합니다.
                </div>
              </div>
              <div className="border-b border-slate-200 bg-slate-50/80 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-slate-950">선택한 경유지</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">현재 묶음 {selectedRouteStores.length}곳을 티맵 계산에 사용합니다.</p>
                  </div>
                  <span className="rounded-md bg-white px-2 py-1 text-xs font-black text-blue-700 ring-1 ring-inset ring-blue-100">
                    {activeRouteBatchIndex + 1}/{routeBatchCount}
                  </span>
                </div>
                {selectedRouteStores.length ? (
                  <div className="max-h-[260px] space-y-2 overflow-auto pr-1">
                    {selectedRouteStores.map((store, index) => (
                      <button
                        className={`w-full rounded-md border p-3 text-left transition hover:bg-white ${
                          store.id === routeSelectedStore?.id ? "border-slate-900 bg-white shadow-sm ring-1 ring-slate-900/5" : "border-slate-200 bg-white/80"
                        }`}
                        key={store.id}
                        onClick={() => openRouteStore(store.id)}
                        type="button"
                      >
                        <div className="flex items-start gap-3">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal-700 text-xs font-black text-white shadow-sm">{routeBatchStart + index + 1}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-black text-slate-950">{store.name}</span>
                            <span className="mt-1 block truncate text-xs font-bold text-slate-500">{store.address || store.region}</span>
                            <span className="mt-2 block text-xs font-bold text-slate-400">
                              출발지 기준 {store.distanceKm?.toLocaleString() || "-"}km · {formatMinutes(store.durationMinutes || 0)} · 매출 {store.expectedRevenue.toLocaleString()}만원
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-2">
                            <span className={gradeBadgeClass(store.grade)}>{store.grade}</span>
                            <span
                              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-black text-slate-600 hover:bg-slate-50"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleRouteStore(store.id);
                              }}
                            >
                              해제
                            </span>
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-center">
                    <p className="text-sm font-black text-slate-700">선택한 경유지가 없습니다.</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">아래 매장 목록에서 추가 버튼을 누르세요.</p>
                  </div>
                )}
                {inactiveSelectedCount ? (
                  <div className="mt-2 rounded-md bg-white px-3 py-2 text-xs font-bold text-slate-500 ring-1 ring-inset ring-slate-200">
                    다른 묶음에 대기 중인 경유지 {inactiveSelectedCount}곳이 있습니다. 다음 15곳 버튼으로 이어서 계산합니다.
                  </div>
                ) : null}
              </div>
              <div className="p-3">
                {routeSequence?.legs.length ? (
                  <div className={`mb-3 rounded-md border p-3 ${routeRoadPointCount ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                    <p className={`text-xs font-black ${routeRoadPointCount ? "text-emerald-800" : "text-amber-800"}`}>
                      {routeRoadPointCount ? "티맵 경유 경로 반영됨" : "거리·시간 계산됨 · 도로 경로 좌표 없음"}
                    </p>
                    <p className={`mt-1 text-xs font-bold leading-5 ${routeRoadPointCount ? "text-emerald-700" : "text-amber-800"}`}>
                      경유지 {routeSequence.stops.length}곳 · 실도로 {tmapLegCount}/{routeSequence.legs.length}구간 · 경유 코스 {routeSequence.totalDistanceKm.toLocaleString()}km · {formatMinutes(routeSequence.totalDurationMinutes)} · 도로 좌표 {routeRoadPointCount.toLocaleString()}개
                    </p>
                    {tmapLegCount < routeSequence.legs.length ? <p className="mt-1 text-xs font-bold leading-5 text-amber-800">일부 구간은 티맵 주소 지오코딩이 실패해 도로선 없이 기초 거리값만 반영됐습니다.</p> : null}
                  </div>
                ) : null}
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-slate-950">{isVehicleScoped ? "매장 선택" : "배송차 선택 필요"}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      {isVehicleScoped ? "매장을 누르면 지도 위치가 이동하고, 추가 버튼으로 경유지에 넣습니다." : "왼쪽에서 배송차를 선택하면 해당 차량의 매장이 표시됩니다."}
                    </p>
                  </div>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">{routeCandidateStores.length}곳</span>
                </div>
                <div className="space-y-2">
                  {routeCandidateStores.length ? (
                    routeCandidateStores.map((store, index) => {
                    const selectedForRoute = selectedRouteIdSet.has(store.id);
                    const activeForRoute = activeRouteIdSet.has(store.id);
                    const selectedOrder = selectedRouteStoreIds.indexOf(store.id) + 1;
                    return (
                    <button
                      className={`w-full rounded-md border p-3 text-left transition hover:bg-slate-50 ${
                        store.id === routeSelectedStore?.id
                          ? "border-slate-900 bg-slate-50"
                          : activeForRoute
                            ? "border-slate-300 bg-slate-50/80"
                            : selectedForRoute
                              ? "border-slate-300 bg-slate-50"
                              : "border-slate-200 bg-white"
                      }`}
                      key={store.id}
                      onClick={() => openRouteStore(store.id)}
                      type="button"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black ${
                            activeForRoute ? "bg-teal-700 text-white" : selectedForRoute ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {selectedForRoute ? selectedOrder : index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black text-slate-950">{store.name}</span>
                          <span className="mt-1 block truncate text-xs font-bold text-slate-500">{store.address || store.region}</span>
                          <span className="mt-2 block text-xs font-bold text-slate-400">출발지 기준 {store.distanceKm?.toLocaleString() || "-"}km · {formatMinutes(store.durationMinutes || 0)} · 매출 {store.expectedRevenue.toLocaleString()}만원</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-2">
                          <span className={gradeBadgeClass(store.grade)}>{store.grade}</span>
                          {activeForRoute ? (
                            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-black text-slate-700">계산</span>
                          ) : selectedForRoute ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600">대기</span>
                          ) : null}
                          <span
                            className={`rounded-md px-2 py-1 text-[11px] font-black ${
                              selectedForRoute ? "bg-teal-600 text-white" : "bg-blue-600 text-white hover:bg-blue-700"
                            }`}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleRouteStore(store.id);
                            }}
                          >
                            {selectedForRoute ? "해제" : "추가"}
                          </span>
                        </span>
                      </div>
                    </button>
                  );
                    })
                  ) : (
                    <div className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-center">
                      <p className="text-sm font-black text-slate-700">{isVehicleScoped ? "조건에 맞는 매장이 없습니다." : "배송차를 먼저 선택하세요."}</p>
                      <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                        {isVehicleScoped ? "검색어를 조정하거나 다른 배송차를 선택하세요." : "왼쪽 배송차 목록에서 1호차, 2호차처럼 실제 차량을 선택하면 경유지를 고를 수 있습니다."}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>
    </section>
  );
}

function DirectoryStat({ label, tone = "slate", value }: { readonly label: string; readonly tone?: "rose" | "slate"; readonly value: string }) {
  return (
    <div className="rounded-md border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-black uppercase text-slate-400">{label}</p>
      <p className={`mt-1 text-[24px] font-black leading-none ${tone === "rose" ? "text-rose-600" : "text-slate-950"}`}>{value}</p>
    </div>
  );
}

function getRouteStopAddress(store: StoreRow) {
  return store.address || store.region;
}

function countFiniteRoutePoints(path: RouteSequence["path"]) {
  return path.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)).length;
}

function StoreDetail({
  areaOptions,
  attachments,
  driverOptions,
  history,
  onClose,
  onClearHistory,
  onDeleteHistory,
  onSaveAttachment,
  onSaveLoadingMedia,
  onUpdateStore,
  onWriteHistory,
  store
}: {
  readonly areaOptions: string[];
  readonly attachments: StoreAttachment;
  readonly driverOptions: string[];
  readonly history: StoreHistoryItem[];
  readonly onClose: () => void;
  readonly onClearHistory: (storeId: string) => void;
  readonly onDeleteHistory: (storeId: string, historyId: string) => void;
  readonly onSaveAttachment: (slot: "bankbookCopy" | "businessCertificate", file: AttachmentFile) => void;
  readonly onSaveLoadingMedia: (files: AttachmentFile[]) => void;
  readonly onUpdateStore: (storeId: string, edit: StoreEdit) => Promise<{ persisted: boolean } | void>;
  readonly onWriteHistory: (storeId: string, memo: string) => void;
  readonly store: StoreRow;
}) {
  const [draftAccountCopyStatus, setDraftAccountCopyStatus] = useState(store.accountCopyStatus);
  const [draftAddress, setDraftAddress] = useState(store.address || "");
  const [draftBankAccount, setDraftBankAccount] = useState(store.bankAccount);
  const [draftBirthDate, setDraftBirthDate] = useState(store.birthDate);
  const [draftBusinessCertificateStatus, setDraftBusinessCertificateStatus] = useState(store.businessCertificateStatus);
  const [draftBusinessNumber, setDraftBusinessNumber] = useState(store.businessRegistrationNumber);
  const [draftBusinessStatus, setDraftBusinessStatus] = useState(store.businessStatus);
  const [draftDeliveryArea, setDraftDeliveryArea] = useState(store.deliveryArea || store.region);
  const [draftDeliveryDriver, setDraftDeliveryDriver] = useState(store.deliveryDriver || "");
  const [draftEmail, setDraftEmail] = useState(store.email);
  const [draftGrade, setDraftGrade] = useState<RevenueGrade>(store.grade);
  const [draftIndustry, setDraftIndustry] = useState(store.industry);
  const [draftName, setDraftName] = useState(store.name);
  const [draftOpeningDate, setDraftOpeningDate] = useState(store.openingDate);
  const [draftPhone, setDraftPhone] = useState(store.phone);
  const [draftRepresentativeName, setDraftRepresentativeName] = useState(store.representativeName);
  const [draftRevenue, setDraftRevenue] = useState(String(store.expectedRevenue));
  const [historyMemo, setHistoryMemo] = useState("");
  const [ocrSuggestion, setOcrSuggestion] = useState<BusinessOcrSuggestion | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [saveError, setSaveError] = useState("");
  const activeOcrSuggestion = ocrSuggestion || (attachments.businessCertificate ? createBusinessOcrSuggestion(store, attachments.businessCertificate.name) : null);
  const businessNumberValid = isValidBusinessRegistrationNumber(draftBusinessNumber);
  const saveDraft = async () => {
    if (!businessNumberValid) {
      setSaveError("사업자번호가 유효하지 않습니다. 사업자등록증 OCR 후보값을 반영하거나 10자리 번호를 확인하세요.");
      return;
    }

    setIsSaving(true);
    setSaveError("");

    try {
      const result = await onUpdateStore(store.id, {
      accountCopyStatus: draftAccountCopyStatus,
      address: draftAddress,
      bankAccount: draftBankAccount,
      birthDate: draftBirthDate,
      businessCertificateStatus: draftBusinessCertificateStatus,
      businessRegistrationNumber: draftBusinessNumber,
      businessStatus: draftBusinessStatus,
      deliveryArea: draftDeliveryArea,
      deliveryDriver: draftDeliveryDriver,
      email: draftEmail,
      expectedRevenue: Number(draftRevenue) || store.expectedRevenue,
      grade: draftGrade,
      industry: draftIndustry,
      name: draftName,
      openingDate: draftOpeningDate,
      phone: draftPhone,
      representativeName: draftRepresentativeName
      });
      const persistedLabel = result?.persisted === false ? "서버 저장 미확인" : "서버 저장 완료";
      setSavedAt(`${persistedLabel} · ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <button aria-label="거래처 상세 닫기" className="fixed inset-0 z-30 bg-slate-950/20" onClick={onClose} type="button" />
      <aside className="fixed right-0 top-0 z-40 flex h-screen w-full max-w-[960px] flex-col border-l border-slate-200 bg-white shadow-2xl">
        <header className="border-b border-slate-200 bg-white px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-black text-blue-700">거래처 상세</p>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                <h3 className="truncate text-2xl font-black text-slate-950">{draftName}</h3>
                <span className={gradeBadgeClass(draftGrade)}>{draftGrade}</span>
                <span className={businessStatusClass(draftBusinessStatus)}>{getBusinessStatusLabel(draftBusinessStatus)}</span>
                <span className={businessNumberValid ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700" : "rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-black text-rose-700"}>
                  {businessNumberValid ? "사업자번호 유효" : "사업자번호 확인"}
                </span>
              </div>
              <p className="mt-2 text-sm font-bold text-slate-500">
                {store.deliveryVehicleName || store.region} · {draftDeliveryDriver || "담당자 미지정"} · {draftAddress || "주소 미등록"}
              </p>
              {savedAt ? <p className="mt-2 text-xs font-black text-emerald-700">변경사항 반영 · {savedAt}</p> : null}
              {saveError ? <p className="mt-2 text-xs font-black text-rose-600">{saveError}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                href={`/crm/timeline?customerId=${encodeURIComponent(store.id)}`}
              >
                히스토리 열기
              </Link>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-black text-white hover:bg-blue-700"
                disabled={isSaving}
                onClick={saveDraft}
                type="button"
              >
                <Check className="h-4 w-4" />
                {isSaving ? "저장 중" : "변경 저장"}
              </button>
              <button className="grid h-9 w-9 place-items-center rounded-md bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-700" onClick={onClose} type="button">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-50 px-6 py-5">
          <div className="space-y-5">
              <CollapsibleSection defaultOpen title="기본 정보">
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <EditRow label="매장명" onChange={setDraftName} value={draftName} />
                  <BusinessNumberEditRow onChange={setDraftBusinessNumber} valid={businessNumberValid} value={draftBusinessNumber} />
                  <EditRow label="대표자명" onChange={setDraftRepresentativeName} value={draftRepresentativeName} />
                  <EditRow label="연락처" onChange={setDraftPhone} value={draftPhone} />
                  <EditRow label="이메일" onChange={setDraftEmail} value={draftEmail} />
                  <EditRow label="개업일" onChange={setDraftOpeningDate} type="date" value={draftOpeningDate} />
                  <EditRow label="생년월일" onChange={setDraftBirthDate} type="date" value={draftBirthDate} />
                  <EditRow label="주소" onChange={setDraftAddress} value={draftAddress} />
                  <EditRow label="업종" onChange={setDraftIndustry} value={draftIndustry} />
                  <EditRow label="계좌정보" onChange={setDraftBankAccount} value={draftBankAccount} />
                  <SelectRow
                    label="사업자등록증"
                    onChange={(value) => setDraftBusinessCertificateStatus(value as StoreRow["businessCertificateStatus"])}
                    options={[
                      { label: "수취 완료", value: "received" },
                      { label: "미수취", value: "missing" }
                    ]}
                    value={draftBusinessCertificateStatus}
                  />
                  <SelectRow
                    label="통장사본"
                    onChange={(value) => setDraftAccountCopyStatus(value as StoreRow["accountCopyStatus"])}
                    options={[
                      { label: "수취 완료", value: "received" },
                      { label: "미수취", value: "missing" }
                    ]}
                    value={draftAccountCopyStatus}
                  />
                  <EditRow label="예상매출" onChange={setDraftRevenue} value={draftRevenue} />
                  <SelectRow
                    label="매출등급"
                    onChange={(value) => setDraftGrade(value as RevenueGrade)}
                    options={[
                      { label: "A등급", value: "A" },
                      { label: "B등급", value: "B" },
                      { label: "C등급", value: "C" }
                    ]}
                    value={draftGrade}
                  />
                  <InfoRow label="매출정보" value="거래원장 업로드 기준 업데이트 예정" />
                  <SelectRow label="담당자" onChange={setDraftDeliveryDriver} options={driverOptions.map((driver) => ({ label: driver, value: driver }))} value={draftDeliveryDriver} />
                  <SelectRow label="배송권역" onChange={setDraftDeliveryArea} options={areaOptions.map((area) => ({ label: area, value: area }))} value={draftDeliveryArea} />
                </div>
              </CollapsibleSection>

              <CollapsibleSection defaultOpen title="첨부자료">
                <div className="mt-4 space-y-3">
                  <LoadingMediaBox files={attachments.loadingPositionMedia || []} onSave={onSaveLoadingMedia} />
                  <AttachmentBox
                    description="업로드하면 OCR 후보값을 읽어 기본정보와 비교합니다."
                    file={attachments.businessCertificate}
                    label="사업자등록증"
                    onSave={(file) => {
                      onSaveAttachment("businessCertificate", file);
                      setDraftBusinessCertificateStatus("received");
                      setOcrSuggestion(createBusinessOcrSuggestion(store, file.name));
                    }}
                  />
                  {activeOcrSuggestion ? (
                    <BusinessOcrPanel
                      current={{
                        businessRegistrationNumber: draftBusinessNumber,
                        companyName: draftName,
                        openingDate: draftOpeningDate,
                        representativeName: draftRepresentativeName
                      }}
                      onApply={() => {
                        setDraftBusinessNumber(activeOcrSuggestion.businessRegistrationNumber);
                        setDraftBusinessStatus(activeOcrSuggestion.businessStatus);
                        setDraftBusinessCertificateStatus("received");
                        setDraftName(activeOcrSuggestion.companyName);
                        setDraftOpeningDate(activeOcrSuggestion.openingDate);
                        setDraftRepresentativeName(activeOcrSuggestion.representativeName);
                      }}
                      suggestion={activeOcrSuggestion}
                    />
                  ) : null}
                  <AttachmentBox description="정산과 결제 확인용 자료입니다." file={attachments.bankbookCopy} label="통장사본" onSave={(file) => onSaveAttachment("bankbookCopy", file)} />
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="메모 히스토리">
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800">
                  메모는 상담·배송 이력이라 운영에서는 삭제 로그를 남기는 방식이 안전합니다. 개별 삭제와 전체 삭제는 확인 후 실행됩니다.
                </div>
                <textarea
                  className="mt-4 min-h-28 w-full rounded-md border border-slate-200 bg-white p-3 text-sm font-bold text-slate-950 outline-none focus:border-blue-500"
                  onChange={(event) => setHistoryMemo(event.target.value)}
                  placeholder="상담, 배송 특이사항, 대표 요청사항 등을 기록하세요."
                  value={historyMemo}
                />
                <button
                  className="mt-2 h-9 w-full rounded-md bg-teal-700 text-sm font-black text-white shadow-sm transition hover:bg-teal-800"
                  onClick={() => {
                    const memo = historyMemo.trim();
                    if (!memo) return;
                    onWriteHistory(store.id, memo);
                    setHistoryMemo("");
                  }}
                  type="button"
                >
                  메모 저장
                </button>
                {history.length ? (
                  <button
                    className="mt-2 h-9 w-full rounded-md border border-rose-200 bg-white text-sm font-black text-rose-600 transition hover:bg-rose-50"
                    onClick={() => {
                      if (window.confirm("이 거래처의 메모 히스토리를 모두 삭제할까요?")) onClearHistory(store.id);
                    }}
                    type="button"
                  >
                    메모 전체 삭제
                  </button>
                ) : null}
                <div className="mt-4 space-y-2">
                  {history.length ? (
                    history.map((item) => (
                      <div className="rounded-md border border-slate-200 bg-white p-3" key={item.id}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-black text-slate-400">{item.recordedAt}</p>
                          <button className="text-xs font-black text-rose-500 hover:text-rose-700" onClick={() => onDeleteHistory(store.id, item.id)} type="button">
                            삭제
                          </button>
                        </div>
                        <p className="mt-1 text-sm font-bold leading-5 text-slate-700">{item.memo}</p>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-md border border-dashed border-slate-200 bg-white p-3 text-sm font-bold text-slate-400">아직 기록된 메모가 없습니다.</p>
                  )}
                </div>
              </CollapsibleSection>
              <CollapsibleSection defaultOpen title="배송·방문 정보">
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <MetricRow icon={<Navigation className="h-4 w-4" />} label="거리" value={`${store.distanceKm?.toLocaleString() || "-"}km`} />
                  <MetricRow icon={<Clock className="h-4 w-4" />} label="출발지 기준 시간" value={formatMinutes(store.durationMinutes || 0)} />
                  <MetricRow icon={<CalendarDays className="h-4 w-4" />} label="방문순서" value={`${store.order}번째`} />
                  <MetricRow label="경로출처" value={getProviderLabel(store.routeProvider)} />
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="AI 추천 근거">
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {(store.reasons?.length ? store.reasons : ["배송 반경", "예상 매출", "지역 확장성"]).map((reason) => (
                    <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700" key={reason}>
                      {reason}
                    </p>
                  ))}
                </div>
              </CollapsibleSection>
          </div>
        </div>
      </aside>
    </>
  );
}

function CollapsibleSection({ children, defaultOpen = false, title }: { readonly children: ReactNode; readonly defaultOpen?: boolean; readonly title: string }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <button className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left" onClick={() => setOpen((value) => !value)} type="button">
        <span className="text-sm font-black text-slate-900">{title}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="border-t border-slate-200 px-5 pb-5">{children}</div> : null}
    </section>
  );
}

function LoadingMediaBox({ files, onSave }: { readonly files: AttachmentFile[]; readonly onSave: (files: AttachmentFile[]) => void }) {
  return (
    <div className="rounded-md border border-blue-300 bg-blue-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-blue-600 text-white">
            <FileImage className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black text-slate-900">배송 적재위치 사진/영상</p>
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-black text-white">중요</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-blue-700 ring-1 ring-inset ring-blue-200">{files.length}개</span>
            </div>
            <p className="mt-1 max-w-xl text-xs font-bold leading-5 text-slate-500">기사님이 출고 전 확인하는 핵심 자료입니다. 적재 위치, 입구, 냉장/냉동 구분 사진과 짧은 영상을 여러 개 저장할 수 있습니다.</p>
          </div>
        </div>
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-black text-white shadow-sm hover:bg-blue-700">
          <Plus className="h-4 w-4" />
          추가
          <input
            accept="image/*,video/*"
            className="sr-only"
            multiple
            onChange={(event) => {
              const selectedFiles = Array.from(event.target.files || []);
              if (!selectedFiles.length) return;
              Promise.all(
                selectedFiles.map(
                  (selectedFile) =>
                    new Promise<AttachmentFile>((resolve) => {
                      const mediaType = selectedFile.type.startsWith("video/") ? "video" : "image";
                      const reader = new FileReader();
                      reader.onload = () => resolve({ dataUrl: String(reader.result || ""), mediaType, name: selectedFile.name });
                      reader.readAsDataURL(selectedFile);
                    })
                )
              ).then(onSave);
              event.target.value = "";
            }}
            type="file"
          />
        </label>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {files.length ? (
          files.map((file, index) => (
            <MediaPreview file={file} key={`${file.name}-${index}`} />
          ))
        ) : (
          <div className="col-span-full grid h-28 place-items-center rounded-md border border-dashed border-blue-200 bg-white text-center">
            <div>
              <p className="text-xs font-black text-slate-600">아직 업로드된 적재위치 자료가 없습니다.</p>
              <p className="mt-1 text-[11px] font-bold text-slate-400">오른쪽 + 버튼으로 사진/영상을 추가하세요.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MediaPreview({ file }: { readonly file: AttachmentFile }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-white p-2">
      {file.mediaType === "video" ? (
        <video className="h-28 w-full rounded bg-slate-100 object-cover" controls src={file.dataUrl} />
      ) : file.dataUrl ? (
        <img alt={file.name} className="h-28 w-full rounded bg-slate-100 object-cover" src={file.dataUrl} />
      ) : (
        <div className="grid h-28 place-items-center rounded bg-slate-100 text-xs font-black text-slate-500">파일</div>
      )}
      <p className="mt-2 truncate text-xs font-bold text-slate-500">{file.name}</p>
    </div>
  );
}

function BusinessOcrPanel({
  current,
  onApply,
  suggestion
}: {
  readonly current: Pick<BusinessOcrSuggestion, "businessRegistrationNumber" | "companyName" | "openingDate" | "representativeName">;
  readonly onApply: () => void;
  readonly suggestion: BusinessOcrSuggestion;
}) {
  const rows = [
    { current: current.companyName, label: "상호명", value: suggestion.companyName },
    { current: formatBusinessRegistrationNumber(current.businessRegistrationNumber), label: "사업자번호", value: formatBusinessRegistrationNumber(suggestion.businessRegistrationNumber) },
    { current: current.representativeName, label: "대표자명", value: suggestion.representativeName },
    { current: current.openingDate, label: "개업일", value: suggestion.openingDate }
  ];
  const suggestionNumberValid = isValidBusinessRegistrationNumber(suggestion.businessRegistrationNumber);

  return (
    <div className="rounded-md border border-blue-200 bg-blue-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-black text-slate-900">OCR 인식 결과 확인</p>
            <span className={suggestionNumberValid ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-black text-emerald-700" : "rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-black text-rose-700"}>
              {suggestionNumberValid ? "사업자번호 검증 통과" : "사업자번호 확인 필요"}
            </span>
          </div>
          <p className="mt-1 text-xs font-bold text-slate-500">사업자등록증에서 읽은 후보값입니다. 기존 값과 비교 후 반영하세요.</p>
        </div>
        <button className="h-9 rounded-md bg-blue-600 px-3 text-xs font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!suggestionNumberValid} onClick={onApply} type="button">
          기본정보에 반영
        </button>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {rows.map((row) => {
          const matched = row.current === row.value;
          return (
            <div className="rounded-md border border-white bg-white/80 p-3" key={row.label}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-black text-slate-500">{row.label}</p>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${matched ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {matched ? "일치" : "확인필요"}
                </span>
              </div>
              <p className="mt-2 break-words text-sm font-black text-slate-950">{row.value}</p>
              {!matched ? <p className="mt-1 break-words text-xs font-bold text-slate-400">현재값: {row.current || "미입력"}</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AttachmentBox({
  description,
  file,
  important = false,
  label,
  onSave
}: {
  readonly description: string;
  readonly file?: AttachmentFile;
  readonly important?: boolean;
  readonly label: string;
  readonly onSave: (file: AttachmentFile) => void;
}) {
  return (
    <div className={`rounded-md border p-4 ${important ? "border-blue-300 bg-blue-50/60" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${important ? "bg-blue-600 text-white" : "bg-white text-slate-400"}`}>
            <FileImage className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black text-slate-900">{label}</p>
              {important ? <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-black text-white">중요</span> : null}
            </div>
            <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{description}</p>
          </div>
        </div>
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 shadow-sm hover:border-blue-300 hover:text-blue-700">
          <Plus className="h-4 w-4" />
          추가
          <input
            accept="image/*,.pdf"
            className="sr-only"
            onChange={(event) => {
              const selectedFile = event.target.files?.[0];
              if (!selectedFile) return;
              if (!selectedFile.type.startsWith("image/")) {
                onSave({ mediaType: "file", name: selectedFile.name });
                event.target.value = "";
                return;
              }
              const reader = new FileReader();
              reader.onload = () => onSave({ dataUrl: String(reader.result || ""), mediaType: "image", name: selectedFile.name });
              reader.readAsDataURL(selectedFile);
              event.target.value = "";
            }}
            type="file"
          />
        </label>
      </div>
      <div className="mt-4">
        {file ? (
          <MediaPreview file={file} />
      ) : (
          <div className="grid h-24 place-items-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-center">
          <div>
              <p className="text-xs font-black text-slate-600">아직 업로드된 자료가 없습니다.</p>
              <p className="mt-1 text-[11px] font-bold text-slate-400">+ 버튼으로 이미지/PDF를 추가하세요.</p>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function EditRow({
  label,
  onChange,
  type = "text",
  value
}: {
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly type?: "date" | "text";
  readonly value: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-xs font-black text-slate-500">{label}</span>
      <input className="h-10 min-w-0 rounded-md border border-slate-200 bg-white px-3 font-bold text-slate-950 outline-none focus:border-blue-500" onChange={(event) => onChange(event.target.value)} type={type} value={value} />
    </label>
  );
}

function BusinessNumberEditRow({ onChange, valid, value }: { readonly onChange: (value: string) => void; readonly valid: boolean; readonly value: string }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="flex items-center justify-between gap-2">
        <span className="text-xs font-black text-slate-500">사업자번호</span>
        <span className={valid ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700" : "rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-black text-rose-700"}>
          {valid ? "유효" : "확인필요"}
        </span>
      </span>
      <input
        className={`h-10 min-w-0 rounded-md border bg-white px-3 font-bold text-slate-950 outline-none focus:border-blue-500 ${valid ? "border-slate-200" : "border-rose-200"}`}
        inputMode="numeric"
        onChange={(event) => onChange(formatBusinessRegistrationNumber(event.target.value))}
        placeholder="000-00-00000"
        value={value}
      />
    </label>
  );
}

function SelectRow({
  label,
  onChange,
  options,
  value
}: {
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly options: Array<{ label: string; value: string }>;
  readonly value: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-xs font-black text-slate-500">{label}</span>
      <select className="h-10 min-w-0 rounded-md border border-slate-200 bg-white px-3 font-bold text-slate-950 outline-none focus:border-blue-500" onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Kpi({
  helper,
  label,
  tone,
  value
}: {
  readonly helper?: string;
  readonly label: string;
  readonly tone: "blue" | "green" | "purple" | "red";
  readonly value: string;
}) {
  const valueClass = {
    blue: "text-slate-950",
    green: "text-emerald-700",
    purple: "text-violet-700",
    red: "text-rose-600"
  }[tone];
  return (
    <div className="border-r border-slate-200/80 px-5 py-3 last:border-r-0">
      <p className="truncate text-[11px] font-black uppercase text-slate-400">{label}</p>
      <p className={`mt-1 truncate text-[24px] font-black leading-none ${valueClass}`}>{value}</p>
      {helper ? <p className="mt-2 truncate text-[11px] font-semibold text-slate-500">{helper}</p> : null}
    </div>
  );
}

function RouteBasisStrip({
  allStoreCount,
  allStoreTotals,
  currentStoreCount,
  currentTotals,
  routePlan
}: {
  readonly allStoreCount: number;
  readonly allStoreTotals: { distanceKm: number; durationMinutes: number; expectedRevenue: number };
  readonly currentStoreCount: number;
  readonly currentTotals: { distanceKm: number; durationMinutes: number; expectedRevenue: number };
  readonly routePlan: RoutePlan;
}) {
  return (
    <section className="grid gap-3 border-b border-slate-200/80 bg-white px-4 py-3 xl:grid-cols-[minmax(0,1fr)_minmax(520px,auto)] xl:items-center">
      <div className="min-w-0">
        <p className="text-xs font-black text-slate-500">운영 기준값</p>
        <p className="mt-1 max-w-3xl text-xs font-bold leading-5 text-slate-500">
          대시보드와 이 화면은 동일한 거래처/코스 데이터 기준입니다. 위 KPI는 검색, 등급, 배송차 필터에 따라 바뀌고 아래 값은 전체 기준을 고정 표시합니다.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
        <RouteBasisMetric label="대시보드 기준 매장" value={`${routePlan.totalStops.toLocaleString()}곳`} />
        <RouteBasisMetric label="전체 출발지 거리합" value={`${(routePlan.totalDistanceKm || allStoreTotals.distanceKm).toLocaleString()}km`} />
        <RouteBasisMetric label="전체 출발지 시간합" value={formatMinutes(routePlan.totalDurationMinutes || allStoreTotals.durationMinutes)} />
        <RouteBasisMetric label="현재 화면 매장" value={`${currentStoreCount.toLocaleString()}/${allStoreCount.toLocaleString()}곳`} helper={`${currentTotals.distanceKm.toLocaleString()}km · ${currentTotals.expectedRevenue.toLocaleString()}만원`} />
      </div>
    </section>
  );
}

function RouteBasisMetric({ helper, label, value }: { readonly helper?: string; readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="truncate text-[11px] font-black text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-slate-950">{value}</p>
      {helper ? <p className="mt-1 truncate text-[11px] font-bold text-slate-500">{helper}</p> : null}
    </div>
  );
}

function RouteMetric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="truncate text-[11px] font-black text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}

function RouteWorkStep({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-md border px-2.5 py-2 ${done ? "border-emerald-200 bg-white text-emerald-800" : active ? "border-blue-200 bg-white text-blue-800" : "border-slate-200 bg-white text-slate-500"}`}>
      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${done ? "bg-emerald-600 text-white" : active ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"}`}>
        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      </span>
      <span className="text-xs font-black">{label}</span>
    </div>
  );
}

function PanelTitle({ title }: { readonly title: string }) {
  return <p className="border-b border-slate-200 pb-2 text-xs font-black text-slate-500">{title}</p>;
}

function InfoRow({ icon, label, value }: { readonly icon?: React.ReactNode; readonly label: string; readonly value: string }) {
  return (
    <div className="grid gap-1.5 text-sm">
      <span className="text-xs font-black text-slate-500">{label}</span>
      <span className="flex min-w-0 items-center gap-2 font-black text-slate-950">
        {icon}
        <span className="min-w-0 break-words">{value}</span>
      </span>
    </div>
  );
}

function MetricRow({ icon, label, value }: { readonly icon?: React.ReactNode; readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-3 text-sm">
      <span className="flex items-center gap-2 font-bold text-slate-500">
        {icon}
        {label}
      </span>
      <span className="font-black text-slate-950">{value}</span>
    </div>
  );
}

function createStoreRows(routePlan: RoutePlan, existingMarkers: KakaoMapMarker[]): StoreRow[] {
  return routePlan.groups
    .flatMap((group) => group.stops)
    .map((store, index) => {
      const marker = existingMarkers.find((item) => item.address === store.address || item.name === store.name);
      const details = store as RoutePlanStoreDetails;
      return {
        ...store,
        accountCopyStatus: getSampleDocumentStatus(index + 3),
        bankAccount: createBankAccount(index),
        birthDate: store.birthDate || createSampleDate(1974 + (index % 18), (index % 12) + 1, (index % 27) + 1),
        businessCertificateStatus: getSampleDocumentStatus(index),
        businessRegistrationNumber: details.businessNumber || createBusinessNumber(index),
        businessStatus: normalizeStoreBusinessStatus(details.businessStatus, index),
        deliveryArea: (store as RoutePlanStop & { deliveryArea?: string }).deliveryArea || store.region,
        deliveryDriver: (store as RoutePlanStop & { deliveryDriver?: string }).deliveryDriver || defaultDriverByIndex(index),
        email: store.email || createStoreEmail(store.name, index),
        grade: getRevenueGrade(store.expectedRevenue),
        industry: store.industry || getSampleIndustry(index),
        markerX: marker?.x ?? 18 + ((index * 13) % 68),
        markerY: marker?.y ?? 20 + ((index * 17) % 58),
        memo: details.loadingPosition || "정기 납품 조건 확인 필요",
        openingDate: store.openingDate || createSampleDate(2015 + (index % 9), (index % 12) + 1, (index % 27) + 1),
        phone: store.phone || createPhoneNumber(index),
        representativeName: store.representativeName || createRepresentativeName(index)
      };
    });
}

function createDeliveryStoreRows(vehicles: DeliveryVehicle[], existingMarkers: KakaoMapMarker[]): StoreRow[] {
  return vehicles.flatMap((vehicle, vehicleIndex) =>
    vehicle.stops.map((store, storeIndex) => {
      const marker = existingMarkers.find((item) => item.address === store.address || item.name === store.name);
      const globalIndex = vehicleIndex * 15 + storeIndex;
      const details = store as StoreRow & RoutePlanStoreDetails;
      return {
        ...store,
        accountCopyStatus: getSampleDocumentStatus(globalIndex + 3),
        bankAccount: createBankAccount(globalIndex),
        birthDate: store.birthDate || createSampleDate(1974 + (globalIndex % 18), (globalIndex % 12) + 1, (globalIndex % 27) + 1),
        businessCertificateStatus: getSampleDocumentStatus(globalIndex),
        businessRegistrationNumber: details.businessRegistrationNumber || details.businessNumber || createBusinessNumber(globalIndex),
        businessStatus: normalizeStoreBusinessStatus(details.businessStatus, globalIndex),
        deliveryArea: vehicle.area,
        deliveryDriver: vehicle.driver,
        deliveryVehicleId: vehicle.id,
        deliveryVehicleName: vehicle.name,
        email: store.email || createStoreEmail(store.name, globalIndex),
        grade: getRevenueGrade(store.expectedRevenue),
        industry: store.industry || getSampleIndustry(globalIndex),
        markerX: marker?.x ?? 16 + (((vehicleIndex * 15 + storeIndex) * 7) % 70),
        markerY: marker?.y ?? 18 + (((vehicleIndex * 15 + storeIndex) * 11) % 58),
        memo: details.loadingPosition || details.memo || "배송 시간대와 결제 조건 확인 필요",
        openingDate: store.openingDate || createSampleDate(2015 + (globalIndex % 9), (globalIndex % 12) + 1, (globalIndex % 27) + 1),
        phone: store.phone || createPhoneNumber(globalIndex),
        representativeName: store.representativeName || createRepresentativeName(globalIndex)
      };
    })
  );
}

function normalizeStoreBusinessStatus(status: string | undefined, index: number): StoreRow["businessStatus"] {
  if (status === "active" || status === "정상") return "active";
  if (status === "closed" || status === "폐업") return "closed";
  if (status === "unknown" || status === "확인 필요" || status === "확인 예정") return "unknown";
  return getSampleBusinessStatus(index);
}

function toCustomerPayload(store: StoreRow) {
  return {
    address: store.address || "",
    birthDate: store.birthDate,
    businessNumber: store.businessRegistrationNumber,
    businessStatus: getBusinessStatusLabel(store.businessStatus),
    customerName: store.name,
    deliveryKm: Number(store.distanceKm || 0),
    deliveryManager: store.deliveryDriver || "",
    deliveryMinutes: Number(store.durationMinutes || 0),
    deliveryZone: store.deliveryArea || store.region,
    email: store.email,
    industry: store.industry,
    loadingPosition: store.memo || "",
    monthlyRevenue: Number(store.expectedRevenue || 0),
    openingDate: store.openingDate,
    phone: store.phone,
    region: store.region,
    representativeName: store.representativeName,
    visitCount: Number(store.order || 0)
  };
}

function createDeliveryVehiclesFromStores(stores: StoreRow[]): DeliveryVehicle[] {
  const groups = new Map<string, StoreRow[]>();

  stores.forEach((store, index) => {
    const driver = store.deliveryDriver || defaultDriverByIndex(index);
    const area = store.deliveryArea || store.region || "미분류";
    groups.set(driver, [...(groups.get(driver) || []), { ...store, deliveryDriver: driver, deliveryArea: area }]);
  });

  return Array.from(groups.entries()).map(([driver, stops], index) => {
    const orderedStops = stops.map((stop, stopIndex) => ({
      ...stop,
      order: stopIndex + 1
    }));

    return {
      addresses: orderedStops.map((stop) => stop.address || stop.region),
      area: summarizeVehicleArea(orderedStops),
      driver,
      expectedRevenue: orderedStops.reduce((total, stop) => total + Number(stop.expectedRevenue || 0), 0),
      id: `vehicle-${index + 1}`,
      name: `배송 ${index + 1}호차`,
      stops: orderedStops,
      totalDistanceKm: roundToOneDecimal(orderedStops.reduce((total, stop) => total + Number(stop.distanceKm || 0), 0)),
      totalDurationMinutes: orderedStops.reduce((total, stop) => total + Number(stop.durationMinutes || 0), 0)
    };
  });
}

function summarizeVehicleArea(stops: StoreRow[]) {
  const areas = Array.from(new Set(stops.map((stop) => stop.deliveryArea || stop.region).filter(Boolean))).slice(0, 3);
  if (areas.length === 0) return "미분류";
  return areas.join("·");
}

function defaultDriverByIndex(index: number) {
  return ["김배송 매니저", "박배송 매니저", "이배송 매니저", "최배송 매니저", "정배송 매니저", "한배송 매니저", "오배송 매니저", "서배송 매니저", "신배송 매니저", "문배송 매니저"][index % 10];
}

function createVehicleMarkerMeta(vehicles: DeliveryVehicle[]) {
  return vehicles.reduce<Record<string, { color: string; label: string }>>((meta, vehicle, index) => {
    meta[vehicle.id] = {
      color: vehicleMarkerColors[index % vehicleMarkerColors.length],
      label: String(index + 1)
    };
    return meta;
  }, {});
}

function createMarkers(existingMarkers: KakaoMapMarker[], stores: StoreRow[], mode: MarkerViewMode, vehicleMeta: Record<string, { color: string; label: string }>): KakaoMapMarker[] {
  const origin = existingMarkers.find((marker) => marker.tone === "origin");
  const originWithId = origin ? { ...origin, id: origin.id || originMarkerId } : undefined;
  const storeMarkers = spreadMarkers(
    stores.map((store) => {
      const vehicle = store.deliveryVehicleId ? vehicleMeta[store.deliveryVehicleId] : undefined;

      return {
        address: store.address || `${store.region} ${store.name}`,
        grade: mode === "grade" ? store.grade : undefined,
        id: store.id,
        label: mode === "vehicle" ? vehicle?.label || "?" : store.grade,
        markerColor: mode === "vehicle" ? vehicle?.color : undefined,
        name: mode === "vehicle" ? `${store.deliveryVehicleName || "배송차 미지정"} · ${store.name}` : store.name,
        tone: "lead" as const,
        x: store.markerX,
        y: store.markerY
      };
    })
  );

  return mergeMarkers(originWithId ? [originWithId, ...storeMarkers] : storeMarkers);
}

function spreadMarkers(markers: KakaoMapMarker[]) {
  const counts = new Map<string, number>();
  return markers.map((marker) => {
    const key = `${Math.round(marker.x / 3)}-${Math.round(marker.y / 3)}`;
    const count = counts.get(key) || 0;
    counts.set(key, count + 1);
    if (count === 0) return marker;
    const angle = count * 1.9;
    const radius = 2.2 + (count % 4) * 0.7;
    return {
      ...marker,
      x: clamp(marker.x + Math.cos(angle) * radius, 4, 96),
      y: clamp(marker.y + Math.sin(angle) * radius, 6, 94)
    };
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function createBusinessOcrSuggestion(store: StoreRow, fileName: string): BusinessOcrSuggestion {
  const seed = fileName.length + store.name.length;
  const currentNumber = isValidBusinessRegistrationNumber(store.businessRegistrationNumber) ? store.businessRegistrationNumber : "";
  const generatedNumber = currentNumber || createBusinessNumber(seed);
  return {
    businessRegistrationNumber: formatBusinessRegistrationNumber(generatedNumber),
    businessStatus: "active",
    companyName: store.name,
    openingDate: store.openingDate,
    representativeName: store.representativeName
  };
}

function mergeMarkers(markers: KakaoMapMarker[]) {
  const seen = new Set<string>();
  return markers.filter((marker) => {
    const key = `${marker.address}-${marker.name}-${marker.tone}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getRevenueGrade(revenue: number): RevenueGrade {
  if (revenue >= 260) return "A";
  if (revenue >= 220) return "B";
  return "C";
}

function createBusinessNumber(index: number) {
  const middle = String(10 + (index % 89)).padStart(2, "0");
  const serial = String(1000 + ((index * 7919) % 8999)).padStart(4, "0");
  const base = `123${middle}${serial}`;
  return formatBusinessRegistrationNumber(`${base}${getBusinessRegistrationCheckDigit(base)}`);
}

function normalizeBusinessRegistrationNumber(value: string) {
  return value.replace(/[^0-9]/g, "").slice(0, 10);
}

function formatBusinessRegistrationNumber(value: string) {
  const digits = normalizeBusinessRegistrationNumber(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function isValidBusinessRegistrationNumber(value: string) {
  const digits = normalizeBusinessRegistrationNumber(value);
  if (!/^[0-9]{10}$/.test(digits)) return false;
  return getBusinessRegistrationCheckDigit(digits.slice(0, 9)) === Number(digits[9]);
}

function getBusinessRegistrationCheckDigit(firstNineDigits: string) {
  const digits = normalizeBusinessRegistrationNumber(firstNineDigits).slice(0, 9).padEnd(9, "0");
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0) + Math.floor((Number(digits[8]) * 5) / 10);
  return (10 - (sum % 10)) % 10;
}

function getSampleBusinessStatus(index: number): StoreRow["businessStatus"] {
  if (index % 37 === 0) return "closed";
  if (index % 11 === 0) return "unknown";
  return "active";
}

function getSampleDocumentStatus(index: number): StoreRow["businessCertificateStatus"] {
  return index % 5 === 0 ? "missing" : "received";
}

function createBankAccount(index: number) {
  return `신한 ${110000000000 + index * 92831}`;
}

function createPhoneNumber(index: number) {
  const middle = String(3100 + ((index * 37) % 6000)).padStart(4, "0");
  const last = String(1000 + ((index * 53) % 8999)).padStart(4, "0");
  return `010-${middle}-${last}`;
}

function createRepresentativeName(index: number) {
  const names = ["김민준", "이서연", "박도윤", "최하린", "정우진", "한지아", "오현우", "서지훈", "문가은", "신유나"];
  return names[index % names.length];
}

function createStoreEmail(name: string, index: number) {
  const slug = name.replace(/[^0-9a-zA-Z가-힣]/g, "").slice(0, 10) || `store${index + 1}`;
  return `${slug.toLowerCase()}${index + 1}@example.com`;
}

function createSampleDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getSampleIndustry(index: number) {
  const industries = ["한식", "일식", "중식", "분식", "카페", "베이커리", "급식", "정육", "반찬", "주점"];
  return industries[index % industries.length];
}

function countGrades(stores: StoreRow[]) {
  return stores.reduce(
    (counts, store) => ({
      ...counts,
      [store.grade]: counts[store.grade] + 1
    }),
    { A: 0, B: 0, C: 0 } as Record<RevenueGrade, number>
  );
}

function applyStoreEdits(stores: StoreRow[], edits: Record<string, StoreEdit>) {
  return stores.map((store) => {
    const edit = edits[store.id];
    const expectedRevenue = edit?.expectedRevenue ?? store.expectedRevenue;
    return {
      ...store,
      ...edit,
      expectedRevenue,
      grade: edit?.grade || getRevenueGrade(expectedRevenue)
    };
  });
}

function applyVehicleEdits(vehicles: DeliveryVehicle[], edits: Record<string, VehicleEdit>) {
  return vehicles.map((vehicle) => ({
    ...vehicle,
    ...edits[vehicle.id]
  }));
}

function getDeliveryDefaults(vehicles: DeliveryVehicle[]) {
  const drivers = Array.from(new Set(vehicles.map((vehicle) => vehicle.driver).filter(Boolean))).sort();
  const areas = Array.from(new Set(vehicles.map((vehicle) => vehicle.area).filter(Boolean))).sort();
  return { areas, drivers };
}

function readLocalJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveLocalJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Attachments can be large because previews are stored as data URLs in the browser.
  }
}

function getStoreTotals(stores: StoreRow[]) {
  return {
    distanceKm: roundToOneDecimal(stores.reduce((total, store) => total + Number(store.distanceKm || 0), 0)),
    durationMinutes: stores.reduce((total, store) => total + Number(store.durationMinutes || 0), 0),
    expectedRevenue: stores.reduce((total, store) => total + Number(store.expectedRevenue || 0), 0)
  };
}

function formatMinutes(minutes: number) {
  if (!minutes) return "-";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}시간 ${rest}분` : `${rest}분`;
}

function getProviderLabel(provider?: RoutePlanStop["routeProvider"]) {
  if (provider === "cached") return "티맵 캐시";
  if (provider === "tmap") return "티맵";
  if (provider === "estimated") return "추정";
  return "기준 데이터";
}

function getBusinessStatusLabel(status: StoreRow["businessStatus"]) {
  if (status === "active") return "정상";
  if (status === "closed") return "폐업";
  return "확인필요";
}

function getDocumentStatusLabel(status: StoreRow["businessCertificateStatus"]) {
  return status === "received" ? "수취 완료" : "미수취";
}

function businessStatusClass(status: StoreRow["businessStatus"]) {
  if (status === "active") return "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700";
  if (status === "closed") return "rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-black text-rose-700";
  return "rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-700";
}

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function gradeBadgeClass(grade: RevenueGrade) {
  if (grade === "A") return "rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-black text-white";
  if (grade === "B") return "rounded-full bg-slate-700 px-2.5 py-1 text-xs font-black text-white";
  return "rounded-full bg-slate-500 px-2.5 py-1 text-xs font-black text-white";
}

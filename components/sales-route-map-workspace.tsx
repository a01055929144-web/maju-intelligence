"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Check, Clock, Edit3, MapPin, Navigation, PanelLeftClose, PanelLeftOpen, RefreshCw, Search, Truck, UserRound } from "lucide-react";
import { KakaoAddressMap, KakaoMapMarker } from "@/components/kakao-address-map";
import { createDeliveryVehicles, DeliveryVehicle } from "@/components/route-plan-workspace";
import { RoutePlan, RoutePlanStop } from "@/lib/store";

type RevenueGrade = "A" | "B" | "C";
type GradeFilter = "all" | RevenueGrade;

type StoreRow = RoutePlanStop & {
  businessRegistrationNumber: string;
  businessStatus: "active" | "closed" | "unknown";
  deliveryArea?: string;
  deliveryDriver?: string;
  deliveryVehicleId?: string;
  deliveryVehicleName?: string;
  grade: RevenueGrade;
  markerX: number;
  markerY: number;
};

type StoreEdit = Partial<Pick<StoreRow, "address" | "businessRegistrationNumber" | "businessStatus" | "expectedRevenue" | "grade" | "name">>;
type VehicleEdit = Partial<Pick<DeliveryVehicle, "area" | "driver">>;

type SalesRouteMapWorkspaceProps = {
  readonly mapMarkers: KakaoMapMarker[];
  readonly routePlan: RoutePlan;
};

const gradeFilters: Array<{ label: string; value: GradeFilter }> = [
  { label: "전체", value: "all" },
  { label: "A등급", value: "A" },
  { label: "B등급", value: "B" },
  { label: "C등급", value: "C" }
];

export function SalesRouteMapWorkspace({ mapMarkers, routePlan }: SalesRouteMapWorkspaceProps) {
  const [query, setQuery] = useState("");
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("all");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [storeEdits, setStoreEdits] = useState<Record<string, StoreEdit>>({});
  const [vehicleEdits, setVehicleEdits] = useState<Record<string, VehicleEdit>>({});
  const [vehicleFilterId, setVehicleFilterId] = useState("all");
  const routeSeedStores = useMemo(() => createStoreRows(routePlan, mapMarkers), [mapMarkers, routePlan]);
  const deliveryVehicles = useMemo(() => applyVehicleEdits(createDeliveryVehicles(routeSeedStores), vehicleEdits), [routeSeedStores, vehicleEdits]);
  const allStores = useMemo(() => applyStoreEdits(createDeliveryStoreRows(deliveryVehicles, mapMarkers), storeEdits), [deliveryVehicles, mapMarkers, storeEdits]);
  const visibleStores = useMemo(
    () =>
      allStores.filter((store) => {
        const keyword = query.trim().toLowerCase();
        const matchesQuery =
          !keyword ||
          `${store.name} ${store.region} ${store.address || ""} ${store.businessRegistrationNumber} ${store.deliveryDriver || ""} ${store.deliveryVehicleName || ""}`
            .toLowerCase()
            .includes(keyword);
        const matchesGrade = gradeFilter === "all" || store.grade === gradeFilter;
        const matchesVehicle = vehicleFilterId === "all" || store.deliveryVehicleId === vehicleFilterId;
        return matchesQuery && matchesGrade && matchesVehicle;
      }),
    [allStores, gradeFilter, query, vehicleFilterId]
  );
  const selectedStore = visibleStores.find((store) => store.id === selectedId) || visibleStores[0] || allStores[0];
  const gradeCounts = useMemo(() => countGrades(allStores), [allStores]);
  const routeTotals = useMemo(() => getStoreTotals(allStores), [allStores]);
  const markers = useMemo(() => createMarkers(mapMarkers, visibleStores), [mapMarkers, visibleStores]);

  return (
    <div className="flex h-[calc(100vh-178px)] min-h-[760px] flex-col overflow-hidden rounded-md border border-slate-200 bg-white text-slate-950 shadow-sm">
      <header className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="min-w-0">
          <h2 className="whitespace-nowrap text-lg font-black">영업·배송 통합 지도</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">거래처 위치, 매출 등급, 방문·배송 우선순위를 한 화면에서 확인합니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <nav className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1">
            {["지도", "거래처 목록", "오늘 코스"].map((item) => (
              <button
                className={`h-8 rounded-md px-3 text-sm font-black transition ${item === "지도" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-950"}`}
                key={item}
                type="button"
              >
                {item}
              </button>
            ))}
          </nav>
          <span className="text-xs font-bold text-slate-400">기존 영업·배송 데이터 기준</span>
          <button className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50" type="button">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 border-b border-blue-500 bg-slate-50 md:grid-cols-6">
        <Kpi label="전체 매장" tone="blue" value={`${allStores.length}곳`} />
        <Kpi label="A등급" tone="green" value={`${gradeCounts.A}곳`} />
        <Kpi label="배송차량" tone="blue" value={`${deliveryVehicles.length}대`} />
        <Kpi label="예상매출" tone="green" value={`${routeTotals.expectedRevenue.toLocaleString()}만원`} />
        <Kpi label="금일 총 km" tone="purple" value={`${routeTotals.distanceKm.toLocaleString()}km`} />
        <Kpi label="예상시간" tone="red" value={formatMinutes(routeTotals.durationMinutes)} />
      </section>

      <section className="flex flex-col gap-2 border-b border-slate-200 bg-white px-4 py-2 lg:flex-row lg:items-center">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-bold text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:bg-white"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="거래처명·지역·주소 검색..."
            value={query}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {gradeFilters.map((filter) => (
            <button
              className={`h-10 rounded-md border px-4 text-sm font-black transition ${
                gradeFilter === filter.value ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              key={filter.value}
              onClick={() => setGradeFilter(filter.value)}
              type="button"
            >
              {filter.label}
            </button>
          ))}
          <button className="h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50" type="button">
            이탈 제외
          </button>
          <button className="h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50" type="button">
            내 위치
          </button>
          <span className="ml-2 text-sm font-black text-slate-500">
            {visibleStores.length}/{allStores.length}개
          </span>
        </div>
      </section>

      <section className={`grid min-h-0 flex-1 grid-cols-1 ${leftCollapsed ? "xl:grid-cols-[52px_minmax(0,1fr)_430px]" : "xl:grid-cols-[320px_minmax(0,1fr)_430px]"}`}>
        <DeliveryAssignmentPanel
          collapsed={leftCollapsed}
          onSelectVehicle={setVehicleFilterId}
          onToggleCollapsed={() => setLeftCollapsed((value) => !value)}
          onUpdateVehicle={(vehicleId, edit) => setVehicleEdits((current) => ({ ...current, [vehicleId]: { ...current[vehicleId], ...edit } }))}
          selectedVehicleId={vehicleFilterId}
          totalStores={allStores.length}
          vehicles={deliveryVehicles}
        />

        <div className="min-h-0 min-w-0 bg-slate-100 [&>div]:h-full">
          <KakaoAddressMap mapClassName="h-[720px] min-h-[620px] rounded-none border-0 xl:h-full" markers={markers} showList={false} />
        </div>

        <StoreManagementPanel
          onSelectStore={setSelectedId}
          onUpdateStore={(storeId, edit) => setStoreEdits((current) => ({ ...current, [storeId]: { ...current[storeId], ...edit } }))}
          selectedStore={selectedStore}
          stores={visibleStores}
        />
      </section>
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
      <aside className="flex min-h-0 flex-col items-center gap-3 border-r border-slate-200 bg-white py-3">
        <button
          aria-label="배송 담당자 패널 펼치기"
          className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
          onClick={onToggleCollapsed}
          type="button"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
        <Truck className="h-5 w-5 text-emerald-700" />
        <span className="[writing-mode:vertical-rl] text-xs font-black text-slate-500">배송필터</span>
      </aside>
    );
  }

  return (
    <aside className="min-h-0 border-r border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-slate-950">
            <Truck className="h-4 w-4 text-emerald-700" />
            전체 매장
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">배송담당자별 필터</p>
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
      <div className="space-y-2 border-b border-slate-200 p-3">
        <button
          className={`w-full rounded-md border p-3 text-left transition ${
            selectedVehicleId === "all" ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
          onClick={() => onSelectVehicle("all")}
          type="button"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-black text-slate-950">전체 매장 보기</p>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-blue-700 ring-1 ring-inset ring-blue-200">{totalStores}곳</span>
          </div>
          <p className="mt-1 text-xs font-bold text-slate-500">배송담당자 전체 거래처</p>
        </button>
      </div>
      <div className="max-h-[calc(100vh-520px)] min-h-[420px] space-y-2 overflow-auto p-3">
        {vehicles.map((vehicle) => {
          const selected = vehicle.id === selectedVehicleId;
          const editing = editingVehicleId === vehicle.id;
          return (
            <div
              className={`w-full rounded-md border p-3 text-left transition ${
                selected ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"
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
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-emerald-700 ring-1 ring-inset ring-emerald-200">
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
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-black text-slate-600"
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
      <input className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm font-bold outline-none focus:border-emerald-500" onChange={(event) => setDriver(event.target.value)} value={driver} />
      <input className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm font-bold outline-none focus:border-emerald-500" onChange={(event) => setArea(event.target.value)} value={area} />
      <div className="flex gap-2">
        <button className="h-8 flex-1 rounded-md bg-emerald-700 text-xs font-black text-white" onClick={() => onSave({ area, driver })} type="button">
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
  onUpdateStore,
  selectedStore,
  stores
}: {
  readonly onSelectStore: (storeId: string) => void;
  readonly onUpdateStore: (storeId: string, edit: StoreEdit) => void;
  readonly selectedStore?: StoreRow;
  readonly stores: StoreRow[];
}) {
  return (
    <aside className="grid min-h-0 grid-rows-[minmax(260px,42%)_minmax(0,1fr)] border-l border-slate-200 bg-white">
      <section className="min-h-0 border-b border-slate-200">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-sm font-black text-slate-950">거래처 목록</p>
            <p className="mt-1 text-xs font-bold text-slate-500">매출 등급과 배송거리 기준</p>
          </div>
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{stores.length}곳</span>
        </div>
        <div className="h-full overflow-auto pb-16">
          {stores.length ? (
            stores.map((store) => (
              <button
                className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${
                  store.id === selectedStore?.id ? "bg-blue-50 shadow-[inset_3px_0_0_#2563eb]" : ""
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
      </section>

      <section className="min-h-0 bg-slate-50">{selectedStore ? <StoreDetail key={selectedStore.id} onUpdateStore={onUpdateStore} store={selectedStore} /> : null}</section>
    </aside>
  );
}

function StoreDetail({ onUpdateStore, store }: { readonly onUpdateStore: (storeId: string, edit: StoreEdit) => void; readonly store: StoreRow }) {
  const [editing, setEditing] = useState(false);
  const [draftAddress, setDraftAddress] = useState(store.address || "");
  const [draftBusinessNumber, setDraftBusinessNumber] = useState(store.businessRegistrationNumber);
  const [draftBusinessStatus, setDraftBusinessStatus] = useState(store.businessStatus);
  const [draftGrade, setDraftGrade] = useState<RevenueGrade>(store.grade);
  const [draftName, setDraftName] = useState(store.name);
  const [draftRevenue, setDraftRevenue] = useState(String(store.expectedRevenue));

  return (
    <div className="h-full overflow-auto">
      <div className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-black text-slate-500">거래처 상세</p>
          {editing ? (
            <button
              className="inline-flex h-8 items-center gap-1 rounded-md bg-blue-600 px-2 text-xs font-black text-white"
              onClick={() => {
                onUpdateStore(store.id, {
                  address: draftAddress,
                  businessRegistrationNumber: draftBusinessNumber,
                  businessStatus: draftBusinessStatus,
                  expectedRevenue: Number(draftRevenue) || store.expectedRevenue,
                  grade: draftGrade,
                  name: draftName
                });
                setEditing(false);
              }}
              type="button"
            >
              <Check className="h-3.5 w-3.5" />
              저장
            </button>
          ) : (
            <button className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-black text-slate-600" onClick={() => setEditing(true)} type="button">
              <Edit3 className="h-3.5 w-3.5" />
              매장 편집
            </button>
          )}
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {editing ? (
              <input className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm font-black outline-none focus:border-blue-500" onChange={(event) => setDraftName(event.target.value)} value={draftName} />
            ) : (
              <h3 className="truncate text-lg font-black text-slate-950">{store.name}</h3>
            )}
            <p className="mt-1 text-xs font-bold text-slate-500">
              {store.grade}등급 · {store.deliveryVehicleName || store.region} · {store.deliveryDriver || "담당자 미지정"}
            </p>
          </div>
          <span className={gradeBadgeClass(store.grade)}>{store.grade}</span>
        </div>
      </div>

      <div className="space-y-5 px-4 py-4">
        <PanelTitle title="기본 정보" />
        {editing ? (
          <>
            <EditRow label="사업자번호" onChange={setDraftBusinessNumber} value={draftBusinessNumber} />
            <SelectRow
              label="사업자상태"
              onChange={(value) => setDraftBusinessStatus(value as StoreRow["businessStatus"])}
              options={[
                { label: "정상", value: "active" },
                { label: "폐업", value: "closed" },
                { label: "확인필요", value: "unknown" }
              ]}
              value={draftBusinessStatus}
            />
            <EditRow label="주소" onChange={setDraftAddress} value={draftAddress} />
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
          </>
        ) : (
          <>
            <InfoRow label="사업자번호" value={store.businessRegistrationNumber} />
            <InfoRow label="사업자상태" value={`${getBusinessStatusLabel(store.businessStatus)} · 매일 API 조회 예정`} />
            <InfoRow icon={<MapPin className="h-4 w-4" />} label="주소" value={store.address || "주소 미등록"} />
            <InfoRow label="예상매출" value={`${store.expectedRevenue.toLocaleString()}만원`} />
            <InfoRow label="매출정보" value="거래원장 업로드 기준 업데이트 예정" />
          </>
        )}
        <InfoRow label="담당자" value={store.deliveryDriver || "미지정"} />
        <InfoRow label="배송권역" value={store.deliveryArea || store.region} />
        <InfoRow label="상태" value={getStatusLabel(store.status)} />
        <InfoRow label="계약점수" value={`${store.score}점`} />

        <PanelTitle title="배송·방문 정보" />
        <MetricRow icon={<Navigation className="h-4 w-4" />} label="거리" value={`${store.distanceKm?.toLocaleString() || "-"}km`} />
        <MetricRow icon={<Clock className="h-4 w-4" />} label="예상시간" value={formatMinutes(store.durationMinutes || 0)} />
        <MetricRow icon={<CalendarDays className="h-4 w-4" />} label="방문순서" value={`${store.order}번째`} />
        <MetricRow label="경로출처" value={getProviderLabel(store.routeProvider)} />

        <PanelTitle title="AI 추천 근거" />
        <div className="space-y-2">
          {(store.reasons?.length ? store.reasons : ["배송 반경", "예상 매출", "지역 확장성"]).map((reason) => (
            <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700" key={reason}>
              {reason}
            </p>
          ))}
        </div>

        <PanelTitle title="액션 메모" />
        <textarea
          className="min-h-28 w-full rounded-md border border-slate-200 bg-white p-3 text-sm font-bold text-slate-950 outline-none focus:border-blue-500"
          defaultValue={`${store.region} ${store.name} 방문 후보. 예상 월매출 ${store.expectedRevenue.toLocaleString()}만원 기준 ${store.grade}등급으로 분류됨.`}
        />
      </div>
    </div>
  );
}

function EditRow({ label, onChange, value }: { readonly label: string; readonly onChange: (value: string) => void; readonly value: string }) {
  return (
    <label className="grid grid-cols-[86px_minmax(0,1fr)] items-center gap-3 text-sm">
      <span className="font-bold text-slate-500">{label}</span>
      <input className="h-9 rounded-md border border-slate-200 bg-white px-3 font-bold text-slate-950 outline-none focus:border-blue-500" onChange={(event) => onChange(event.target.value)} value={value} />
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
    <label className="grid grid-cols-[86px_minmax(0,1fr)] items-center gap-3 text-sm">
      <span className="font-bold text-slate-500">{label}</span>
      <select className="h-9 rounded-md border border-slate-200 bg-white px-3 font-bold text-slate-950 outline-none focus:border-blue-500" onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Kpi({ label, tone, value }: { readonly label: string; readonly tone: "blue" | "green" | "purple" | "red"; readonly value: string }) {
  const valueClass = {
    blue: "text-blue-600",
    green: "text-emerald-600",
    purple: "text-violet-600",
    red: "text-rose-600"
  }[tone];

  return (
    <div className="border-r border-slate-200 px-5 py-3 last:border-r-0">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-2xl font-black ${valueClass}`}>{value}</p>
    </div>
  );
}

function PanelTitle({ title }: { readonly title: string }) {
  return <p className="border-b border-slate-200 pb-2 text-xs font-black text-slate-500">{title}</p>;
}

function InfoRow({ icon, label, value }: { readonly icon?: React.ReactNode; readonly label: string; readonly value: string }) {
  return (
    <div className="grid grid-cols-[86px_minmax(0,1fr)] gap-3 text-sm">
      <span className="font-bold text-slate-500">{label}</span>
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
      return {
        ...store,
        businessRegistrationNumber: createBusinessNumber(index),
        businessStatus: getSampleBusinessStatus(index),
        grade: getRevenueGrade(store.expectedRevenue),
        markerX: marker?.x ?? 18 + ((index * 13) % 68),
        markerY: marker?.y ?? 20 + ((index * 17) % 58)
      };
    });
}

function createDeliveryStoreRows(vehicles: DeliveryVehicle[], existingMarkers: KakaoMapMarker[]): StoreRow[] {
  return vehicles.flatMap((vehicle, vehicleIndex) =>
    vehicle.stops.map((store, storeIndex) => {
      const marker = existingMarkers.find((item) => item.address === store.address || item.name === store.name);
      const globalIndex = vehicleIndex * 15 + storeIndex;
      return {
        ...store,
        businessRegistrationNumber: createBusinessNumber(globalIndex),
        businessStatus: getSampleBusinessStatus(globalIndex),
        deliveryArea: vehicle.area,
        deliveryDriver: vehicle.driver,
        deliveryVehicleId: vehicle.id,
        deliveryVehicleName: vehicle.name,
        grade: getRevenueGrade(store.expectedRevenue),
        markerX: marker?.x ?? 16 + (((vehicleIndex * 15 + storeIndex) * 7) % 70),
        markerY: marker?.y ?? 18 + (((vehicleIndex * 15 + storeIndex) * 11) % 58)
      };
    })
  );
}

function createMarkers(existingMarkers: KakaoMapMarker[], stores: StoreRow[]): KakaoMapMarker[] {
  const origin = existingMarkers.find((marker) => marker.tone === "origin");
  const storeMarkers = stores.map((store, index) => ({
    address: store.address || `${store.region} ${store.name}`,
    grade: store.grade,
    label: store.grade,
    name: store.name,
    tone: "lead" as const,
    x: store.markerX,
    y: store.markerY
  }));

  return mergeMarkers(origin ? [origin, ...storeMarkers] : storeMarkers);
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
  const serial = String(10000 + ((index * 7919) % 89999)).padStart(5, "0");
  return `123-${middle}-${serial}`;
}

function getSampleBusinessStatus(index: number): StoreRow["businessStatus"] {
  if (index % 37 === 0) return "closed";
  if (index % 11 === 0) return "unknown";
  return "active";
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

function getStatusLabel(status: string) {
  if (status === "today") return "오늘 추천";
  if (status === "visit-planned") return "방문 예정";
  if (status === "high-probability") return "계약 가능성 높음";
  if (status === "this-week") return "이번주 추천";
  if (status === "excluded") return "제외";
  return status || "미분류";
}

function getProviderLabel(provider?: RoutePlanStop["routeProvider"]) {
  if (provider === "cached") return "티맵 캐시";
  if (provider === "tmap") return "티맵";
  if (provider === "estimated") return "추정";
  return "샘플";
}

function getBusinessStatusLabel(status: StoreRow["businessStatus"]) {
  if (status === "active") return "정상";
  if (status === "closed") return "폐업";
  return "확인필요";
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
  if (grade === "B") return "rounded-full bg-blue-500 px-2.5 py-1 text-xs font-black text-white";
  return "rounded-full bg-slate-500 px-2.5 py-1 text-xs font-black text-white";
}

"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CalendarDays, Check, ChevronDown, Clock, Edit3, FileImage, MapPin, Navigation, PanelLeftClose, PanelLeftOpen, RefreshCw, Search, Truck, UserRound, X } from "lucide-react";
import { KakaoAddressMap, KakaoMapMarker } from "@/components/kakao-address-map";
import { createDeliveryVehicles, DeliveryVehicle } from "@/components/route-plan-workspace";
import { RoutePlan, RoutePlanStop } from "@/lib/store";

type RevenueGrade = "A" | "B" | "C";
type GradeFilter = "all" | RevenueGrade;

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
  const [storeAttachments, setStoreAttachments] = useState<Record<string, StoreAttachment>>({});
  const [storeEdits, setStoreEdits] = useState<Record<string, StoreEdit>>({});
  const [storeHistories, setStoreHistories] = useState<Record<string, StoreHistoryItem[]>>({});
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
  const selectedStore = allStores.find((store) => store.id === selectedId);
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

      <section className={`grid min-h-0 flex-1 grid-cols-1 ${leftCollapsed ? "xl:grid-cols-[52px_minmax(0,1fr)_360px]" : "xl:grid-cols-[300px_minmax(0,1fr)_360px]"}`}>
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
          <KakaoAddressMap focusedMarkerId={selectedId || undefined} mapClassName="h-[720px] min-h-[620px] rounded-none border-0 xl:h-full" markers={markers} showList={false} />
        </div>

        <StoreManagementPanel
          onSelectStore={setSelectedId}
          selectedStoreId={selectedId}
          stores={visibleStores}
        />
      </section>
      {selectedStore ? (
        <StoreDetail
          attachments={storeAttachments[selectedStore.id] || {}}
          history={storeHistories[selectedStore.id] || []}
          key={selectedStore.id}
          onClose={() => setSelectedId("")}
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
          onUpdateStore={(storeId, edit) => setStoreEdits((current) => ({ ...current, [storeId]: { ...current[storeId], ...edit } }))}
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
            배송 담당자
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">차량별 담당 거래처 필터</p>
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
          <p className="mt-1 text-xs font-bold text-slate-500">차량 필터 없이 전체 거래처 표시</p>
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
  selectedStoreId,
  stores
}: {
  readonly onSelectStore: (storeId: string) => void;
  readonly selectedStoreId: string;
  readonly stores: StoreRow[];
}) {
  return (
    <aside className="min-h-0 border-l border-slate-200 bg-white">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-950">거래처 목록</p>
            <p className="mt-1 truncate text-xs font-bold text-slate-500">매장을 누르면 상세 패널이 열립니다.</p>
          </div>
          <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{stores.length}곳</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {stores.length ? (
            stores.map((store) => (
              <button
                className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${
                  store.id === selectedStoreId ? "bg-blue-50 shadow-[inset_3px_0_0_#2563eb]" : ""
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

function StoreDetail({
  attachments,
  history,
  onClose,
  onSaveAttachment,
  onSaveLoadingMedia,
  onUpdateStore,
  onWriteHistory,
  store
}: {
  readonly attachments: StoreAttachment;
  readonly history: StoreHistoryItem[];
  readonly onClose: () => void;
  readonly onSaveAttachment: (slot: "bankbookCopy" | "businessCertificate", file: AttachmentFile) => void;
  readonly onSaveLoadingMedia: (files: AttachmentFile[]) => void;
  readonly onUpdateStore: (storeId: string, edit: StoreEdit) => void;
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

  return (
    <>
      <button aria-label="거래처 상세 닫기" className="fixed inset-0 z-30 bg-slate-950/20" onClick={onClose} type="button" />
      <aside className="fixed right-0 top-0 z-40 flex h-screen w-full max-w-[960px] flex-col border-l border-slate-200 bg-white shadow-2xl">
        <header className="border-b border-slate-200 bg-white px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-black text-blue-700">거래처 상세</p>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                <h3 className="truncate text-2xl font-black text-slate-950">{store.name}</h3>
                <span className={gradeBadgeClass(store.grade)}>{store.grade}</span>
                <span className={businessStatusClass(store.businessStatus)}>{getBusinessStatusLabel(store.businessStatus)}</span>
              </div>
              <p className="mt-2 text-sm font-bold text-slate-500">
                {store.deliveryVehicleName || store.region} · {store.deliveryDriver || "담당자 미지정"} · {store.address || "주소 미등록"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-black text-white hover:bg-blue-700"
                onClick={() =>
                  onUpdateStore(store.id, {
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
                  })
                }
                type="button"
              >
                <Check className="h-4 w-4" />
                변경 저장
              </button>
              <button className="grid h-9 w-9 place-items-center rounded-md bg-slate-950 text-white hover:bg-slate-800" onClick={onClose} type="button">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-50 px-6 py-5">
          <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-5">
              <CollapsibleSection defaultOpen title="기본 정보">
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <EditRow label="매장명" onChange={setDraftName} value={draftName} />
                  <EditRow label="사업자번호" onChange={setDraftBusinessNumber} value={draftBusinessNumber} />
                  <EditRow label="대표자명" onChange={setDraftRepresentativeName} value={draftRepresentativeName} />
                  <EditRow label="연락처" onChange={setDraftPhone} value={draftPhone} />
                  <EditRow label="이메일" onChange={setDraftEmail} value={draftEmail} />
                  <EditRow label="개업일" onChange={setDraftOpeningDate} type="date" value={draftOpeningDate} />
                  <EditRow label="생년월일" onChange={setDraftBirthDate} type="date" value={draftBirthDate} />
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
                  <EditRow label="담당자" onChange={setDraftDeliveryDriver} value={draftDeliveryDriver} />
                  <EditRow label="배송권역" onChange={setDraftDeliveryArea} value={draftDeliveryArea} />
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
                      setOcrSuggestion(createBusinessOcrSuggestion(store, file.name));
                    }}
                  />
                  {ocrSuggestion ? (
                    <BusinessOcrPanel
                      current={{
                        businessRegistrationNumber: draftBusinessNumber,
                        companyName: draftName,
                        openingDate: draftOpeningDate,
                        representativeName: draftRepresentativeName
                      }}
                      onApply={() => {
                        setDraftBusinessNumber(ocrSuggestion.businessRegistrationNumber);
                        setDraftBusinessStatus(ocrSuggestion.businessStatus);
                        setDraftName(ocrSuggestion.companyName);
                        setDraftOpeningDate(ocrSuggestion.openingDate);
                        setDraftRepresentativeName(ocrSuggestion.representativeName);
                      }}
                      suggestion={ocrSuggestion}
                    />
                  ) : null}
                  <AttachmentBox description="정산과 결제 확인용 자료입니다." file={attachments.bankbookCopy} label="통장사본" onSave={(file) => onSaveAttachment("bankbookCopy", file)} />
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="메모 히스토리">
                <textarea
                  className="mt-4 min-h-28 w-full rounded-md border border-slate-200 bg-white p-3 text-sm font-bold text-slate-950 outline-none focus:border-blue-500"
                  onChange={(event) => setHistoryMemo(event.target.value)}
                  placeholder="상담, 배송 특이사항, 대표 요청사항 등을 기록하세요."
                  value={historyMemo}
                />
                <button
                  className="mt-2 h-9 w-full rounded-md bg-slate-950 text-sm font-black text-white transition hover:bg-slate-800"
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
                <div className="mt-4 space-y-2">
                  {history.length ? (
                    history.map((item) => (
                      <div className="rounded-md border border-slate-200 bg-white p-3" key={item.id}>
                        <p className="text-xs font-black text-slate-400">{item.recordedAt}</p>
                        <p className="mt-1 text-sm font-bold leading-5 text-slate-700">{item.memo}</p>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-md border border-dashed border-slate-200 bg-white p-3 text-sm font-bold text-slate-400">아직 기록된 메모가 없습니다.</p>
                  )}
                </div>
              </CollapsibleSection>
            </div>

            <div className="space-y-5">
              <CollapsibleSection defaultOpen title="배송·방문 정보">
                <div className="mt-4 space-y-3">
                  <MetricRow icon={<Navigation className="h-4 w-4" />} label="거리" value={`${store.distanceKm?.toLocaleString() || "-"}km`} />
                  <MetricRow icon={<Clock className="h-4 w-4" />} label="예상시간" value={formatMinutes(store.durationMinutes || 0)} />
                  <MetricRow icon={<CalendarDays className="h-4 w-4" />} label="방문순서" value={`${store.order}번째`} />
                  <MetricRow label="경로출처" value={getProviderLabel(store.routeProvider)} />
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="AI 추천 근거">
                <div className="mt-4 space-y-2">
                  {(store.reasons?.length ? store.reasons : ["배송 반경", "예상 매출", "지역 확장성"]).map((reason) => (
                    <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700" key={reason}>
                      {reason}
                    </p>
                  ))}
                </div>
              </CollapsibleSection>
            </div>
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
    <label className="block cursor-pointer rounded-md border border-blue-300 bg-blue-50/60 p-4 transition hover:border-blue-400 hover:bg-blue-50">
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
      <div className="grid gap-4">
        <div className="flex min-w-0 items-start gap-3">
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
            <p className="mt-2 text-xs font-black text-blue-700">사진/영상 추가</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {files.length ? (
            files.slice(0, 4).map((file, index) =>
              file.mediaType === "video" ? (
                <video className="h-24 w-full rounded-md border border-slate-200 bg-white object-cover" controls key={`${file.name}-${index}`} src={file.dataUrl} />
              ) : (
                <img alt={file.name} className="h-24 w-full rounded-md border border-slate-200 bg-white object-cover" key={`${file.name}-${index}`} src={file.dataUrl} />
              )
            )
          ) : (
            <div className="col-span-full grid h-24 place-items-center rounded-md border border-slate-200 bg-white text-center">
              <div>
                <p className="text-xs font-black text-slate-600">자료 업로드</p>
                <p className="mt-1 text-[11px] font-bold text-slate-400">이미지/동영상 여러 개</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </label>
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
    { current: current.businessRegistrationNumber, label: "사업자번호", value: suggestion.businessRegistrationNumber },
    { current: current.representativeName, label: "대표자명", value: suggestion.representativeName },
    { current: current.openingDate, label: "개업일", value: suggestion.openingDate }
  ];

  return (
    <div className="rounded-md border border-blue-200 bg-blue-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-900">OCR 인식 결과 확인</p>
          <p className="mt-1 text-xs font-bold text-slate-500">사업자등록증에서 읽은 후보값입니다. 기존 값과 비교 후 반영하세요.</p>
        </div>
        <button className="h-9 rounded-md bg-blue-600 px-3 text-xs font-black text-white hover:bg-blue-700" onClick={onApply} type="button">
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
    <label className={`grid cursor-pointer gap-4 rounded-md border p-4 transition hover:border-blue-300 hover:bg-blue-50 ${important ? "border-blue-300 bg-blue-50/60" : "border-dashed border-slate-300 bg-slate-50"}`}>
      <input
        accept="image/*,.pdf"
        className="sr-only"
        onChange={(event) => {
          const selectedFile = event.target.files?.[0];
          if (!selectedFile) return;
          if (!selectedFile.type.startsWith("image/")) {
            onSave({ name: selectedFile.name });
            return;
          }
          const reader = new FileReader();
          reader.onload = () => onSave({ dataUrl: String(reader.result || ""), name: selectedFile.name });
          reader.readAsDataURL(selectedFile);
        }}
        type="file"
      />
      <div className="flex min-w-0 items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${important ? "bg-blue-600 text-white" : "bg-white text-slate-400"}`}>
          <FileImage className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-black text-slate-900">{label}</p>
            {important ? <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-black text-white">중요</span> : null}
          </div>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{description}</p>
          <p className="mt-2 text-xs font-black text-blue-700">파일 선택</p>
        </div>
      </div>
      {file ? (
        <div>
          {file.dataUrl ? (
            <img alt={label} className="h-24 w-full rounded-md border border-slate-200 bg-white object-cover" src={file.dataUrl} />
          ) : (
            <div className="grid h-24 place-items-center rounded-md border border-slate-200 bg-white text-xs font-black text-slate-500">파일 저장됨</div>
          )}
          <p className="mt-2 truncate text-xs font-bold text-slate-500">{file.name}</p>
        </div>
      ) : (
        <div className="grid h-24 place-items-center rounded-md border border-slate-200 bg-white text-center">
          <div>
            <p className="text-xs font-black text-slate-600">파일 업로드</p>
            <p className="mt-1 text-[11px] font-bold text-slate-400">이미지/PDF</p>
          </div>
        </div>
      )}
    </label>
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
      return {
        ...store,
        accountCopyStatus: getSampleDocumentStatus(index + 3),
        bankAccount: createBankAccount(index),
        birthDate: createSampleDate(1974 + (index % 18), (index % 12) + 1, (index % 27) + 1),
        businessCertificateStatus: getSampleDocumentStatus(index),
        businessRegistrationNumber: createBusinessNumber(index),
        businessStatus: getSampleBusinessStatus(index),
        email: createStoreEmail(store.name, index),
        grade: getRevenueGrade(store.expectedRevenue),
        industry: getSampleIndustry(index),
        markerX: marker?.x ?? 18 + ((index * 13) % 68),
        markerY: marker?.y ?? 20 + ((index * 17) % 58),
        memo: "정기 납품 조건 확인 필요",
        openingDate: createSampleDate(2015 + (index % 9), (index % 12) + 1, (index % 27) + 1),
        phone: createPhoneNumber(index),
        representativeName: createRepresentativeName(index)
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
        accountCopyStatus: getSampleDocumentStatus(globalIndex + 3),
        bankAccount: createBankAccount(globalIndex),
        birthDate: createSampleDate(1974 + (globalIndex % 18), (globalIndex % 12) + 1, (globalIndex % 27) + 1),
        businessCertificateStatus: getSampleDocumentStatus(globalIndex),
        businessRegistrationNumber: createBusinessNumber(globalIndex),
        businessStatus: getSampleBusinessStatus(globalIndex),
        deliveryArea: vehicle.area,
        deliveryDriver: vehicle.driver,
        deliveryVehicleId: vehicle.id,
        deliveryVehicleName: vehicle.name,
        email: createStoreEmail(store.name, globalIndex),
        grade: getRevenueGrade(store.expectedRevenue),
        industry: getSampleIndustry(globalIndex),
        markerX: marker?.x ?? 16 + (((vehicleIndex * 15 + storeIndex) * 7) % 70),
        markerY: marker?.y ?? 18 + (((vehicleIndex * 15 + storeIndex) * 11) % 58),
        memo: "배송 시간대와 결제 조건 확인 필요",
        openingDate: createSampleDate(2015 + (globalIndex % 9), (globalIndex % 12) + 1, (globalIndex % 27) + 1),
        phone: createPhoneNumber(globalIndex),
        representativeName: createRepresentativeName(globalIndex)
      };
    })
  );
}

function createMarkers(existingMarkers: KakaoMapMarker[], stores: StoreRow[]): KakaoMapMarker[] {
  const origin = existingMarkers.find((marker) => marker.tone === "origin");
  const storeMarkers = spreadMarkers(
    stores.map((store) => ({
      address: store.address || `${store.region} ${store.name}`,
      grade: store.grade,
      id: store.id,
      label: store.grade,
      name: store.name,
      tone: "lead" as const,
      x: store.markerX,
      y: store.markerY
    }))
  );

  return mergeMarkers(origin ? [origin, ...storeMarkers] : storeMarkers);
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
  const currentNumber = store.businessRegistrationNumber;
  const generatedNumber = currentNumber || createBusinessNumber(seed);
  return {
    businessRegistrationNumber: generatedNumber,
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
  const serial = String(10000 + ((index * 7919) % 89999)).padStart(5, "0");
  return `123-${middle}-${serial}`;
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
  return "샘플";
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
  if (grade === "B") return "rounded-full bg-blue-500 px-2.5 py-1 text-xs font-black text-white";
  return "rounded-full bg-slate-500 px-2.5 py-1 text-xs font-black text-white";
}

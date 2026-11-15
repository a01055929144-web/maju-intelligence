"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  
  
  
  
  
  
  ChevronDown,
  
  
  
  
  Edit3,
  
  
  
  
  
  
  
  
  Loader2,
  
  
  
  
  
  
  
  
  
  PanelRightClose,
  PanelRightOpen,
  
  Plus,
  
  
  
  Search,
  
  
  
  
  Trash2,
  Truck,
  UserPlus,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { KakaoAddressMap, KakaoMapMarker } from "@/components/kakao-address-map";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { operationalMarkerPersonIcon } from "@/lib/route-map-markers";
import { STAFF_LOCATION_FRESHNESS_MINUTES } from "@/lib/staff-location";
import type {
  
  DeliveryCompletionEvent,
  DeliveryVehicle,
  
  
  
  
  
  
  StaffInvitation,
  StaffLocationEvent,
  StaffVehicleLocation
} from "@/lib/store";
import type { VehicleFuelType, VehicleMaster, VehicleOperationalStatus } from "@/domains/delivery/vehicle-master";
import { getTmsServiceDateKey } from "@/domains/delivery/service-date";
import {
  
  
  formatMinutes,
} from "@/lib/route-map-utils";
import { type StoreRow } from "@/components/map/map-row-helpers";
import { RouteMetric, VehicleEdit, createLocationRoutePath, formatVehicleLocationAge, getCompletionOrderClass, getCompletionOrderLabel, getVehicleStatusLabel, liveVehicleMatchesDeliveryGroup, summarizeCompletionOrder, summarizeLocationEvents, vehicleColorForId } from "@/components/map/vehicle-helpers";
// M6(45-3e): 담당자·차량 패널(DeliveryAssignmentPanel)과 라이브 차량·분석·편집 부품. 워크스페이스를 import하지 않는다(순환 import·TDZ 방지) — 워크스페이스는 열 때만 내려받는다.
export function DeliveryAssignmentPanel({
  canManageStaff,
  collapsed,
  fuelTypeConfiguredByVehicleId,
  liveVehicleDetails,
  liveVehicleError,
  liveVehicles,
  todayCompletions,
  onAddDriver,
  onDeleteVehicle,
  onSelectLiveVehicle,
  onSelectVehicle,
  onToggleCollapsed,
  onUpdateVehicle,
  onVehicleMasterChange,
  selectedVehicleId,
  staffInvitations,
  totalStores,
  vehicleMasterAvailable,
  vehicleMasterVehicles,
  vehicles
}: {
  readonly canManageStaff: boolean;
  readonly collapsed: boolean;
  readonly fuelTypeConfiguredByVehicleId: Map<string, boolean>;
  readonly liveVehicleDetails: ReactNode;
  readonly liveVehicleError: string;
  readonly liveVehicles: StaffVehicleLocation[];
  readonly todayCompletions: DeliveryCompletionEvent[];
  readonly onAddDriver: (driverName: string, fuelType?: "gasoline" | "diesel") => Promise<{ ok: boolean; message?: string }>;
  readonly onDeleteVehicle: (vehicle: DeliveryVehicle) => Promise<{ ok: boolean; message?: string }>;
  readonly onSelectLiveVehicle: (vehicle: StaffVehicleLocation) => void;
  readonly onSelectVehicle: (vehicleId: string) => void;
  readonly onToggleCollapsed: () => void;
  readonly onUpdateVehicle: (vehicleId: string, edit: VehicleEdit) => Promise<{ ok: boolean; message?: string }>;
  readonly onVehicleMasterChange: (vehicles: VehicleMaster[]) => void;
  readonly selectedVehicleId: string;
  readonly staffInvitations: StaffInvitation[];
  readonly totalStores: number;
  readonly vehicleMasterAvailable: boolean;
  readonly vehicleMasterVehicles: VehicleMaster[];
  readonly vehicles: DeliveryVehicle[];
}) {
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deletingVehicleId, setDeletingVehicleId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ vehicleId: string; message: string } | null>(null);
  const [pendingDeleteVehicle, setPendingDeleteVehicle] = useState<DeliveryVehicle | null>(null);
  const [liveSearch, setLiveSearch] = useState("");
  const [liveStatusFilter, setLiveStatusFilter] = useState<"all" | "active" | "stale" | "last_operation" | "offline">("all");
  const [assignmentRows, setAssignmentRows] = useState(staffInvitations);
  const [connectionDrafts, setConnectionDrafts] = useState<Record<string, string>>({});
  const [connectingLiveId, setConnectingLiveId] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [unassignedLiveOpen, setUnassignedLiveOpen] = useState(false);
  useEffect(() => setAssignmentRows(staffInvitations), [staffInvitations]);
  const normalizedLiveSearch = liveSearch.trim().toLowerCase();
  const findVehicleForLiveLocation = (location: StaffVehicleLocation) => {
    const invitation = assignmentRows.find((item) => item.acceptedBy === location.userId);
    const assignmentKeys = [invitation?.assignedManagerName, invitation?.assignedVehicle].map((value) => value?.trim().toLowerCase()).filter(Boolean);
    const assignedVehicle = assignmentKeys.length
      ? vehicles.find((vehicle) => [vehicle.driver, vehicle.name].map((value) => value?.trim().toLowerCase()).some((value) => value && assignmentKeys.includes(value)))
      : undefined;
    return assignedVehicle || vehicles.find((vehicle) => liveVehicleMatchesDeliveryGroup(location, vehicle));
  };
  const liveVehicleByDeliveryGroup = new Map<string, StaffVehicleLocation>();
  liveVehicles.forEach((location) => {
    const vehicle = findVehicleForLiveLocation(location);
    if (vehicle && !liveVehicleByDeliveryGroup.has(vehicle.id)) liveVehicleByDeliveryGroup.set(vehicle.id, location);
  });
  const unassignedLiveVehicles = liveVehicles.filter((location) => !findVehicleForLiveLocation(location));
  const registeredVehicleCount = vehicleMasterAvailable
    ? vehicleMasterVehicles.filter((vehicle) => vehicle.status === "active").length
    : vehicles.filter((vehicle) => !vehicle.isUnassigned).length;
  const filteredVehicles = vehicles.filter((vehicle) => {
    const live = liveVehicleByDeliveryGroup.get(vehicle.id);
    const matchesSearch = !normalizedLiveSearch || `${vehicle.name} ${vehicle.driver} ${vehicle.area} ${live?.displayName || ""}`.toLowerCase().includes(normalizedLiveSearch);
    if (!matchesSearch) return false;
    if (liveStatusFilter === "active") return live?.displayState === "realtime";
    if (liveStatusFilter === "stale") return live?.displayState === "delayed";
    if (liveStatusFilter === "last_operation") return live?.displayState === "last_operation";
    if (liveStatusFilter === "offline") return !live;
    return true;
  });
  const completedCustomerIds = new Set(todayCompletions.map((completion) => completion.customerId));
  const deliverySummary = vehicles.reduce(
    (summary, vehicle) => {
      const scheduled = vehicle.stops.length;
      const completed = vehicle.stops.filter((stop) => completedCustomerIds.has(stop.id)).length;
      summary.scheduled += scheduled;
      summary.completed += completed;
      summary.pending += Math.max(0, scheduled - completed);
      if (!scheduled && !vehicle.isUnassigned) summary.noDelivery += 1;
      return summary;
    },
    { completed: 0, noDelivery: 0, pending: 0, scheduled: 0 }
  );

  async function connectLiveVehicle(location: StaffVehicleLocation) {
    const invitation = assignmentRows.find((item) => item.acceptedBy === location.userId);
    const vehicle = vehicles.find((item) => item.id === connectionDrafts[location.id]);
    if (!invitation || !vehicle || connectingLiveId) return;
    setConnectingLiveId(location.id);
    setConnectionError("");
    const response = await fetch("/api/customer/staff-invitations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitationId: invitation.id, assignedManagerName: vehicle.driver, assignedVehicle: vehicle.name })
    }).catch(() => null);
    const payload = await response?.json().catch(() => null);
    setConnectingLiveId("");
    if (!response?.ok || !payload?.invitation) {
      setConnectionError(payload?.message || "담당자·차량 연결을 저장하지 못했습니다.");
      return;
    }
    setAssignmentRows((current) => current.map((item) => item.id === invitation.id ? { ...item, ...payload.invitation } : item));
    setConnectionDrafts((current) => {
      const next = { ...current };
      delete next[location.id];
      return next;
    });
  }

  // 2026-08-24 재피드백("배송담당자 삭제가 잘 안되는 것 같아") 대응: 삭제 버튼을 누르면 바로
  // window.confirm()을 띄우던 예전 방식 대신, 화면 안에 확인 모달(ConfirmDialog)을 띄우도록 2단계로
  // 나눴습니다. 실제 삭제 동작은 사용자가 모달 안의 "삭제" 버튼을 눌렀을 때(runDelete)만 실행됩니다.
  function handleDelete(vehicle: DeliveryVehicle) {
    setPendingDeleteVehicle(vehicle);
  }

  async function runPendingDelete() {
    const vehicle = pendingDeleteVehicle;
    if (!vehicle) return;
    setPendingDeleteVehicle(null);
    setDeletingVehicleId(vehicle.id);
    setDeleteError(null);
    const result = await onDeleteVehicle(vehicle);
    setDeletingVehicleId(null);
    if (!result.ok) setDeleteError({ vehicleId: vehicle.id, message: result.message || "삭제에 실패했습니다." });
  }

  if (collapsed) {
    return (
      <aside className="flex min-h-0 items-center justify-center gap-1.5 bg-white px-1.5 py-2 lg:h-full lg:flex-col lg:justify-start lg:gap-2 lg:overflow-y-auto lg:px-1.5">
        <button
          aria-label="담당자 펼치기"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 lg:w-10"
          onClick={onToggleCollapsed}
          title="펼치기"
          type="button"
        >
          <PanelRightOpen className="h-3.5 w-3.5" />
        </button>
        {/* 시안 ⑫: 접힌 왼쪽 칸은 담당자·차량을 44px 아이콘 버튼으로 세로로 보여줍니다. */}
        {[{ id: "all", label: "전체", short: "전체" }, ...vehicles.filter((vehicle) => !vehicle.isUnassigned).map((vehicle) => ({ id: vehicle.id, label: `${vehicle.name} · ${vehicle.driver}`, short: vehicle.name.replace(/호차$/, "") }))].map((item) => (
          <button
            aria-label={item.label}
            aria-pressed={selectedVehicleId === item.id}
            className={`hidden h-11 w-11 shrink-0 flex-col items-center justify-center rounded-[10px] text-xs lg:flex ${
              selectedVehicleId === item.id ? "border-2 border-teal-700 bg-teal-50 text-teal-800" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            key={item.id}
            onClick={() => onSelectVehicle(item.id)}
            title={item.label}
            type="button"
          >
            {item.id === "all" ? <UserRound className="h-[18px] w-[18px]" /> : <Truck className="h-[18px] w-[18px]" />}
            <span className="max-w-[40px] truncate">{item.short}</span>
          </button>
        ))}
        <span className="relative inline-flex shrink-0 lg:hidden" title="배송담당자 필터">
          <Truck className="h-4 w-4 text-slate-500" />
          <span className="absolute -right-2 -top-2 grid h-4 min-w-[16px] place-items-center rounded-full bg-teal-700 px-1 text-xs font-semibold leading-none text-white">
            {registeredVehicleCount}
          </span>
        </span>
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col bg-white">
      {/* 시안 ⑫: ‹ 접기 · 제목 · 담당자/차량 추가 아이콘 */}
      <div className="flex items-center gap-1.5 border-b border-slate-200/80 px-3 py-2.5">
        <button
          aria-label="담당자 접기"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          onClick={onToggleCollapsed}
          title="접기"
          type="button"
        >
          <PanelRightClose className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-slate-950">담당자 · 차량</p>
          <p className="truncate text-[11px] text-slate-500">차량 {registeredVehicleCount}대{unassignedLiveVehicles.length ? ` · 미연결 GPS ${unassignedLiveVehicles.length}` : ""}</p>
        </div>
        <button
          aria-label="담당자·차량 추가"
          className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          onClick={() => setIsAdding(true)}
          title="담당자·차량 추가"
          type="button"
        >
          <UserPlus className="h-4 w-4" />
        </button>
      </div>
      <div className="shrink-0 space-y-1.5 border-b border-slate-200 bg-slate-50/70 px-3 py-2">
        {liveVehicleError ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs font-medium leading-5 text-amber-800" role="status">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>라이브 연결 지연 · 마지막 정상 위치를 표시 중입니다. {liveVehicleError}</span>
          </div>
        ) : null}
        <div className="space-y-1.5">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
          <input
            className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-2 text-xs font-medium text-slate-800 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
            onChange={(event) => setLiveSearch(event.target.value)}
            placeholder="담당자·차량 검색"
            value={liveSearch}
          />
        </label>
        <div className="flex flex-wrap gap-1" aria-label="담당자·차량 상태 필터">
          {(["all", "active", "stale", "last_operation", "offline"] as const).map((status) => {
            const count = status === "all"
              ? vehicles.length
              : vehicles.filter((vehicle) => {
                  const live = liveVehicleByDeliveryGroup.get(vehicle.id);
                  if (status === "active") return live?.displayState === "realtime";
                  if (status === "stale") return live?.displayState === "delayed";
                  if (status === "last_operation") return live?.displayState === "last_operation";
                  return !live;
                }).length;
            const label = status === "all" ? "전체" : status === "active" ? "실시간" : status === "stale" ? "지연" : status === "last_operation" ? "마지막" : "오프라인";
            return (
              <button
                aria-label={`${label} ${count}대`}
                aria-pressed={liveStatusFilter === status}
                className={`h-7 min-w-0 whitespace-nowrap rounded-md px-1 text-[11px] font-semibold ${liveStatusFilter === status ? "bg-teal-700 text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"}`}
                key={status}
                onClick={() => setLiveStatusFilter(status)}
                type="button"
              >
                {label}<span className="ml-0.5 opacity-80">{count}</span>
              </button>
            );
          })}
        </div>
        </div>
        <div className="flex items-center gap-2 overflow-hidden px-0.5 text-[11px]" aria-label="오늘 배송 현황">
          <span className="font-semibold text-slate-400">오늘</span>
          <span className="font-semibold text-sky-800">예정 {deliverySummary.scheduled}</span>
          <span className="font-semibold text-emerald-700">완료 {deliverySummary.completed}</span>
          <span className="font-semibold text-amber-700">대기 {deliverySummary.pending}</span>
          <span className="font-medium text-slate-500">없음 {deliverySummary.noDelivery}</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {liveVehicleDetails}
      <div className="border-b border-slate-100 px-3 py-1.5">
        <button
          className={`flex w-full items-center justify-between gap-3 rounded-[10px] p-2.5 text-left transition ${
            selectedVehicleId === "all" ? "border-2 border-teal-700 bg-teal-50/60" : "border border-slate-200 bg-white hover:border-slate-300"
          }`}
          onClick={() => onSelectVehicle("all")}
          type="button"
        >
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-950">전체 담당자</p>
            <p className="truncate text-[11px] font-medium text-slate-500">거래처 {totalStores}곳 · 모두 표시</p>
          </div>
          <span className="shrink-0 rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">{totalStores}곳</span>
        </button>
      </div>
      <section aria-labelledby="registered-assignment-heading">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-3 py-1.5">
          <h3 className="text-xs font-bold text-slate-800" id="registered-assignment-heading">등록 담당자 · 차량</h3>
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">{filteredVehicles.length}개</span>
        </div>
      <div className="space-y-1.5 p-2">
        {filteredVehicles.map((vehicle) => {
          const selected = vehicle.id === selectedVehicleId;
          const editing = editingVehicleId === vehicle.id;
          const liveVehicle = liveVehicleByDeliveryGroup.get(vehicle.id);
          const completedCount = vehicle.stops.filter((stop) => completedCustomerIds.has(stop.id)).length;
          const pendingCount = Math.max(0, vehicle.stops.length - completedCount);
          return (
            <div
              className={`w-full rounded-[10px] p-2.5 text-left transition ${
                selected ? "border-2 border-teal-700 bg-teal-50/60" : "border border-slate-200 bg-white hover:border-slate-300"
              }`}
              key={vehicle.id}
            >
              {editing ? (
                <VehicleEditForm
                  fuelTypeConfigured={fuelTypeConfiguredByVehicleId.get(vehicle.id) ?? false}
                  onCancel={() => setEditingVehicleId(null)}
                  onSave={async (edit) => {
                    const result = await onUpdateVehicle(vehicle.id, edit);
                    if (result.ok) setEditingVehicleId(null);
                    return result;
                  }}
                  vehicle={vehicle}
                />
              ) : (
                <button className="block w-full text-left" onClick={() => onSelectVehicle(vehicle.id)} type="button">
                  {/* 대표 요청(10-29): 담당자·차량 카드는 2줄 — 1줄 이름·담당자·곳수·편집, 2줄 상태·오늘 배송·연료·지역·삭제 */}
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Truck aria-hidden="true" className={`h-4 w-4 shrink-0 ${selected ? "text-teal-700" : "text-slate-500"}`} />
                    <p className={`min-w-0 flex-1 truncate text-[13px] font-bold ${selected ? "text-teal-950" : "text-slate-950"}`} title={[vehicle.name, vehicle.isUnassigned ? "담당자·배송차 미지정 거래처 모음" : vehicle.driver].filter(Boolean).join(" · ")}>
                      {vehicle.name}
                      <span className="ml-1 text-xs font-medium text-slate-500">{vehicle.isUnassigned ? "자동 그룹" : vehicle.driver}</span>
                    </p>
                    <span className="shrink-0 text-[11px] font-semibold text-slate-600">{vehicle.stops.length}곳</span>
                    {vehicle.isUnassigned ? null : (
                      <span
                          aria-label="담당자·배송차 편집"
                          className="maju-button-secondary inline-flex h-6 w-6 shrink-0 items-center justify-center px-0"
                          onClick={(event) => {
                            event.stopPropagation();
                            setEditingVehicleId(vehicle.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            event.stopPropagation();
                            setEditingVehicleId(vehicle.id);
                          }}
                          role="button"
                          tabIndex={0}
                          title="편집"
                        >
                          <Edit3 className="h-3 w-3" />
                        </span>
                    )}
                  </div>
                  <div className="mt-1 flex min-w-0 items-center gap-1.5 pl-[22px]">
                    <p className="min-w-0 flex-1 truncate text-[11px] text-slate-500" aria-label={`${vehicle.driver || vehicle.name} 오늘 배송 현황`}>
                      <span className={`font-semibold ${liveVehicle ? (liveVehicle.displayState === "last_operation" ? "text-slate-500" : liveVehicle.isStale ? "text-amber-700" : "text-emerald-700") : "text-slate-400"}`}>
                        {liveVehicle ? getVehicleStatusLabel(liveVehicle) : "오프라인"}
                      </span>
                      {" · "}
                      {vehicle.stops.length ? (
                        <>
                          <span className="font-semibold text-sky-800">예정 {vehicle.stops.length}</span>
                          {" "}<span className="font-semibold text-emerald-700">완료 {completedCount}</span>
                          {" "}<span className="font-semibold text-amber-700">대기 {pendingCount}</span>
                        </>
                      ) : (
                        <span>오늘 배송 없음</span>
                      )}
                      {vehicle.isUnassigned ? null : ` · ${vehicle.fuelType === "gasoline" ? "휘발유" : "경유"}${fuelTypeConfiguredByVehicleId.get(vehicle.id) ? "" : "(기본)"}`}
                      {vehicle.area ? ` · ${vehicle.area}` : ""}
                      {liveVehicle ? ` · ${formatVehicleLocationAge(liveVehicle.lastLocationAt) || "수신 전"}` : ""}
                    </p>
                    {vehicle.isUnassigned ? null : (
                      <span
                          aria-label="담당자·배송차 삭제"
                          className="maju-button-secondary inline-flex h-6 w-6 shrink-0 items-center justify-center px-0 text-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (deletingVehicleId) return;
                            void handleDelete(vehicle);
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            event.stopPropagation();
                            if (deletingVehicleId) return;
                            void handleDelete(vehicle);
                          }}
                          role="button"
                          tabIndex={0}
                          title={
                            vehicle.stops.length === 0
                              ? "삭제 · 배정된 거래처가 없어 바로 삭제할 수 있습니다"
                              : `삭제 · 배정된 거래처 ${vehicle.stops.length}곳은 담당자 미지정 상태로 바뀝니다`
                          }
                        >
                          {deletingVehicleId === vehicle.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        </span>
                    )}
                  </div>
                  {deleteError?.vehicleId === vehicle.id ? (
                    <p className="mt-1 text-[11px] font-bold leading-4 text-rose-600">{deleteError.message}</p>
                  ) : null}
                </button>
              )}
            </div>
          );
        })}
        {!filteredVehicles.length ? <p className="p-4 text-center text-xs font-bold text-slate-500">조건에 맞는 담당자·차량이 없습니다.</p> : null}
      </div>
      </section>
      {unassignedLiveVehicles.length ? (
        <section aria-labelledby="unassigned-live-heading" className="border-t-4 border-amber-100 bg-amber-50/70">
          <button aria-expanded={unassignedLiveOpen} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left" onClick={() => setUnassignedLiveOpen((value) => !value)} type="button">
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-amber-900" id="unassigned-live-heading">미연결 라이브 신호 · {unassignedLiveVehicles.length}건</span>
              <span className="block truncate text-[11px] font-medium text-amber-700">등록 담당자·차량과 아직 연결되지 않은 모바일 위치입니다.</span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-amber-700 transition ${unassignedLiveOpen ? "rotate-180" : ""}`} />
          </button>
          {unassignedLiveOpen ? <div className="space-y-2 border-t border-amber-200 px-3 py-2">
            {unassignedLiveVehicles.map((location) => {
              const invitation = assignmentRows.find((item) => item.acceptedBy === location.userId);
              return (
                <div className="rounded-md border border-amber-200 bg-white p-2.5" key={location.id}>
                  <button className="flex w-full items-center gap-2 text-left" onClick={() => onSelectLiveVehicle(location)} type="button">
                    <span className={`h-2.5 w-2.5 rounded-full ${location.isStale ? "bg-amber-400" : "bg-teal-500"}`} />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-900">{location.displayName}</span>
                    <span className="text-xs font-medium text-slate-500">{formatVehicleLocationAge(location.lastLocationAt) || "수신 전"}</span>
                  </button>
                  {canManageStaff && invitation ? (
                    <div className="mt-2 grid grid-cols-[1fr_auto] gap-1.5">
                      <select
                        aria-label={`${location.displayName} 담당자·차량 연결`}
                        className="h-9 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700"
                        onChange={(event) => setConnectionDrafts((current) => ({ ...current, [location.id]: event.target.value }))}
                        value={connectionDrafts[location.id] || ""}
                      >
                        <option value="">연결할 담당자·차량</option>
                        {vehicles.filter((vehicle) => !vehicle.isUnassigned).map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.driver || vehicle.name} · {vehicle.name}</option>)}
                      </select>
                      <button
                        className="maju-button-primary h-9 px-2.5 text-xs disabled:opacity-50"
                        disabled={!connectionDrafts[location.id] || Boolean(connectingLiveId)}
                        onClick={() => void connectLiveVehicle(location)}
                        type="button"
                      >
                        {connectingLiveId === location.id ? "저장 중" : "연결"}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs font-bold text-amber-800">{canManageStaff ? "가입 직원 연결 정보가 없어 회사 설정에서 확인이 필요합니다." : "대표·관리자가 연결할 수 있습니다."}</p>
                  )}
                </div>
              );
            })}
          </div> : null}
          {connectionError ? <p className="px-3 pb-2 text-[11px] font-bold text-rose-700">{connectionError}</p> : null}
        </section>
      ) : null}
      <VehicleMasterManager
        available={vehicleMasterAvailable}
        canManage={canManageStaff}
        onChange={onVehicleMasterChange}
        vehicles={vehicleMasterVehicles}
      />
      </div>
      <div className="shrink-0 border-t border-slate-200/80 p-2">
        {isAdding ? (
          <AddDriverForm
            onCancel={() => setIsAdding(false)}
            onSave={async (driverName, fuelType) => {
              const result = await onAddDriver(driverName, fuelType);
              if (result.ok) setIsAdding(false);
              return result;
            }}
          />
        ) : (
          <button className="maju-button-primary flex h-9 w-full items-center justify-center gap-1.5 text-xs" onClick={() => setIsAdding(true)} type="button">
            <Plus className="h-3.5 w-3.5" />
            새 담당자·배송차 추가
          </button>
        )}
      </div>
      {pendingDeleteVehicle ? (
        <ConfirmDialog
          confirmLabel="삭제"
          message={
            pendingDeleteVehicle.stops.length > 0
              ? `"${pendingDeleteVehicle.name}" 배송차를 삭제할까요? 배정된 거래처 ${pendingDeleteVehicle.stops.length}곳은 담당자 미지정 상태로 바뀝니다. 이 작업은 되돌릴 수 없습니다.`
              : `"${pendingDeleteVehicle.name}" 배송차를 삭제할까요? 이 작업은 되돌릴 수 없습니다.`
          }
          onCancel={() => setPendingDeleteVehicle(null)}
          onConfirm={runPendingDelete}
        />
      ) : null}
    </aside>
  );
}

const vehicleFuelLabels: Record<VehicleFuelType, string> = {
  diesel: "경유",
  electric: "전기",
  gasoline: "휘발유",
  hybrid: "하이브리드",
  lpg: "LPG"
};

const vehicleStatusLabels: Record<VehicleOperationalStatus, string> = {
  active: "운행",
  inactive: "미사용",
  maintenance: "정비"
};

export function VehicleMasterManager({
  available,
  canManage,
  onChange,
  vehicles
}: {
  readonly available: boolean;
  readonly canManage: boolean;
  readonly onChange: (vehicles: VehicleMaster[]) => void;
  readonly vehicles: VehicleMaster[];
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<{ fuelType: VehicleFuelType; memo: string; name: string; plateNumber: string }>({
    fuelType: "diesel",
    memo: "",
    name: "",
    plateNumber: ""
  });

  async function saveVehicle() {
    const targetId = editingId;
    setSavingId(targetId || "new");
    setError("");
    try {
      const response = await fetch("/api/delivery-vehicle-master", {
        body: JSON.stringify(targetId ? { ...draft, id: targetId } : draft),
        headers: { "Content-Type": "application/json" },
        method: targetId ? "PATCH" : "POST"
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string; vehicle?: VehicleMaster };
      if (!response.ok || !payload.vehicle) throw new Error(payload.message || "차량 저장에 실패했습니다.");
      onChange((targetId ? vehicles.map((vehicle) => (vehicle.id === targetId ? payload.vehicle! : vehicle)) : [...vehicles, payload.vehicle]).sort((left, right) => left.name.localeCompare(right.name, "ko")));
      setDraft({ fuelType: "diesel", memo: "", name: "", plateNumber: "" });
      setAdding(false);
      setEditingId("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "차량 저장에 실패했습니다.");
    } finally {
      setSavingId("");
    }
  }

  function beginEdit(vehicle: VehicleMaster) {
    setError("");
    setAdding(false);
    setEditingId(vehicle.id);
    setDraft({ fuelType: vehicle.fuelType, memo: vehicle.memo || "", name: vehicle.name, plateNumber: vehicle.plateNumber });
  }

  function cancelForm() {
    setAdding(false);
    setEditingId("");
    setDraft({ fuelType: "diesel", memo: "", name: "", plateNumber: "" });
    setError("");
  }

  async function changeStatus(vehicle: VehicleMaster, status: VehicleOperationalStatus) {
    setSavingId(vehicle.id);
    setError("");
    try {
      const response = await fetch("/api/delivery-vehicle-master", {
        body: JSON.stringify({ id: vehicle.id, status }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH"
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string; vehicle?: VehicleMaster };
      if (!response.ok || !payload.vehicle) throw new Error(payload.message || "차량 상태 변경에 실패했습니다.");
      onChange(vehicles.map((item) => (item.id === vehicle.id ? payload.vehicle! : item)));
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "차량 상태 변경에 실패했습니다.");
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="shrink-0 border-t border-slate-200 bg-slate-50/70 p-3">
      <button className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpen((value) => !value)} type="button">
        <span>
          <span className="block text-xs font-black text-slate-900">차량 마스터</span>
          <span className="mt-0.5 block text-[11px] font-bold text-slate-500">차량번호·연료·운행 상태 · {vehicles.length}대</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-500 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="mt-3 space-y-2">
          {!available ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[11px] font-bold leading-4 text-amber-800">
              차량 마스터 DB 준비가 필요합니다. <code>20260920b_delivery_vehicle_master.sql</code> 적용 후 사용할 수 있습니다.
            </div>
          ) : null}
          {vehicles.map((vehicle) => (
            <div className="rounded-md border border-slate-200 bg-white p-2.5" key={vehicle.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-slate-900">{vehicle.name}</p>
                  <p className="mt-0.5 text-[11px] font-bold text-slate-500">{vehicle.plateNumber} · {vehicleFuelLabels[vehicle.fuelType]}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-black ${vehicle.status === "active" ? "bg-teal-100 text-teal-800" : vehicle.status === "maintenance" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>
                  {vehicleStatusLabels[vehicle.status]}
                </span>
              </div>
              {vehicle.memo ? <p className="mt-1 truncate text-xs font-bold text-slate-400">{vehicle.memo}</p> : null}
              {canManage ? (
                <div className="mt-2 grid grid-cols-4 gap-1">
                  <button
                    className="h-7 rounded border border-slate-200 bg-white text-xs font-black text-slate-600"
                    disabled={Boolean(savingId)}
                    onClick={() => beginEdit(vehicle)}
                    type="button"
                  >
                    수정
                  </button>
                  {(["active", "maintenance", "inactive"] as const).map((status) => (
                    <button
                      className={`h-7 rounded border text-xs font-black ${vehicle.status === status ? "border-teal-600 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-500"}`}
                      disabled={savingId === vehicle.id || vehicle.status === status}
                      key={status}
                      onClick={() => void changeStatus(vehicle, status)}
                      type="button"
                    >
                      {savingId === vehicle.id && vehicle.status !== status ? "저장 중" : vehicleStatusLabels[status]}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {available && !vehicles.length ? <p className="py-2 text-center text-[11px] font-bold text-slate-500">등록된 차량이 없습니다.</p> : null}
          {canManage && available ? (
            adding || editingId ? (
              <div className="space-y-2 rounded-md border border-teal-200 bg-white p-2.5">
                <p className="text-[11px] font-black text-slate-800">{editingId ? "차량 정보 수정" : "새 차량 등록"}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <input className="h-8 rounded-md border border-slate-200 px-2 text-xs font-bold" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="차량명" value={draft.name} />
                  <input className="h-8 rounded-md border border-slate-200 px-2 text-xs font-bold" onChange={(event) => setDraft((current) => ({ ...current, plateNumber: event.target.value }))} placeholder="차량번호" value={draft.plateNumber} />
                </div>
                <select className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold" onChange={(event) => setDraft((current) => ({ ...current, fuelType: event.target.value as VehicleFuelType }))} value={draft.fuelType}>
                  {Object.entries(vehicleFuelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input className="h-8 w-full rounded-md border border-slate-200 px-2 text-xs font-bold" onChange={(event) => setDraft((current) => ({ ...current, memo: event.target.value }))} placeholder="메모 (선택)" value={draft.memo} />
                <div className="flex justify-end gap-1.5">
                  <button className="maju-button-secondary h-8 px-3 text-xs" disabled={Boolean(savingId)} onClick={cancelForm} type="button">취소</button>
                  <button className="maju-button-primary h-8 px-3 text-xs disabled:opacity-50" disabled={Boolean(savingId) || !draft.name.trim() || !draft.plateNumber.trim()} onClick={() => void saveVehicle()} type="button">{savingId ? "저장 중" : editingId ? "수정 저장" : "등록"}</button>
                </div>
              </div>
            ) : (
              <button className="maju-button-secondary flex h-8 w-full items-center justify-center gap-1 text-xs" onClick={() => { setAdding(true); setEditingId(""); }} type="button"><Plus className="h-3.5 w-3.5" /> 차량 등록</button>
            )
          ) : null}
          {error ? <p className="text-[11px] font-bold leading-4 text-rose-600">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function AddDriverForm({
  onCancel,
  onSave
}: {
  readonly onCancel: () => void;
  readonly onSave: (driverName: string, fuelType: "gasoline" | "diesel") => Promise<{ ok: boolean; message?: string }>;
}) {
  const [driverName, setDriverName] = useState("");
  const [fuelType, setFuelType] = useState<"gasoline" | "diesel">("diesel");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    const result = await onSave(driverName, fuelType);
    setSaving(false);
    if (!result.ok) setError(result.message || "저장에 실패했습니다.");
  }

  return (
    <div className="space-y-2 rounded-md border border-teal-200 bg-teal-50/40 p-2.5">
      <p className="text-xs font-black text-slate-950">새 담당자·배송차 추가</p>
      <input
        autoFocus
        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
        onChange={(event) => setDriverName(event.target.value)}
        placeholder="담당자 이름 (예: 김배송 매니저)"
        value={driverName}
      />
      <div className="grid grid-cols-2 gap-1.5">
        {[
          { label: "경유", value: "diesel" as const },
          { label: "휘발유", value: "gasoline" as const }
        ].map((item) => (
          <button
            className={`h-8 rounded-md border px-2 text-xs font-black transition ${
              fuelType === item.value ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-600"
            }`}
            key={item.value}
            onClick={() => setFuelType(item.value)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      {error ? <p className="text-[11px] font-bold leading-4 text-rose-600">{error}</p> : null}
      <p className="text-[11px] font-bold leading-4 text-slate-400">거래처 배정은 거래처 관리에서 담당자를 지정하면 이 배송차에 자동으로 묶입니다.</p>
      <div className="flex items-center justify-end gap-1.5">
        <button className="maju-button-secondary h-8 px-3 text-xs" disabled={saving} onClick={onCancel} type="button">
          취소
        </button>
        <button className="maju-button-primary h-8 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-60" disabled={saving || !driverName.trim()} onClick={handleSave} type="button">
          {saving ? "저장 중" : "추가"}
        </button>
      </div>
    </div>
  );
}

export function VehicleEditForm({
  fuelTypeConfigured,
  onCancel,
  onSave,
  vehicle
}: {
  readonly fuelTypeConfigured: boolean;
  readonly onCancel: () => void;
  readonly onSave: (edit: VehicleEdit) => Promise<{ ok: boolean; message?: string }>;
  readonly vehicle: DeliveryVehicle;
}) {
  const [name, setName] = useState(vehicle.name);
  const [driver, setDriver] = useState(vehicle.driver);
  const [area, setArea] = useState(vehicle.area);
  const [fuelType, setFuelType] = useState<"gasoline" | "diesel">(vehicle.fuelType || "diesel");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    const result = await onSave({ area, driver, fuelType, name: name.trim() || vehicle.name });
    setSaving(false);
    if (!result.ok) setError(result.message || "저장에 실패했습니다.");
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-black text-slate-950">{vehicle.name} 편집</p>
      <label className="grid gap-1 text-xs">
        <span className="font-black text-slate-500">호차명</span>
        <input className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm font-bold outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100" onChange={(event) => setName(event.target.value)} value={name} />
      </label>
      <label className="grid gap-1 text-xs">
        <span className="font-black text-slate-500">담당자</span>
        <input className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm font-bold outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100" onChange={(event) => setDriver(event.target.value)} value={driver} />
      </label>
      <label className="grid gap-1 text-xs">
        <span className="font-black text-slate-500">구역</span>
        <input className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm font-bold outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100" onChange={(event) => setArea(event.target.value)} value={area} />
      </label>
      <p className="text-[11px] font-bold leading-4 text-slate-400">
        호차명은 이 배송차에 배정된 거래처 전체에 반영되어 저장됩니다. 담당자·구역은 화면 표시값만 바뀝니다.
      </p>
      {!fuelTypeConfigured ? (
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] font-bold leading-4 text-amber-800">
          연료 타입 기본값은 경유입니다.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-1.5">
        {[
          { label: "경유", value: "diesel" as const },
          { label: "휘발유", value: "gasoline" as const }
        ].map((item) => (
          <button
            className={`h-8 rounded-md border px-2 text-xs font-black transition ${
              fuelType === item.value ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-600"
            }`}
            key={item.value}
            onClick={() => setFuelType(item.value)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button className="maju-button-primary h-8 flex-1 text-xs disabled:cursor-not-allowed disabled:opacity-60" disabled={saving} onClick={handleSave} type="button">
          {saving ? "저장 중..." : "저장"}
        </button>
        <button className="maju-button-secondary h-8 flex-1 text-xs" disabled={saving} onClick={onCancel} type="button">
          취소
        </button>
      </div>
      {error ? <p className="text-xs font-bold text-rose-600">{error}</p> : null}
    </div>
  );
}

export function LiveVehicleStatusPanel({
  activeRouteVehicleId,
  completions,
  onAnalyze,
  onFocusVehicle,
  onPreviewStore,
  onToggleRoute,
  routeLoading,
  selectedVehicle,
  storeById,
  vehicles
}: {
  readonly activeRouteVehicleId?: string;
  // 2026-09-07 피드백("배송이완료되면 완료가 표시되었으면 해") 대응: 오늘 배송완료 기록 전체(회사
  // 전체, 특정 차량으로 좁히지 않음)를 받아 아래에서 차량별 담당자·배송차 이름으로 매칭해 셉니다.
  readonly completions: DeliveryCompletionEvent[];
  readonly onAnalyze: (vehicle: StaffVehicleLocation) => void;
  readonly onFocusVehicle: (vehicleId: string) => void;
  readonly onPreviewStore: (storeId: string) => void;
  readonly onToggleRoute?: (vehicle: StaffVehicleLocation) => void;
  readonly routeLoading?: boolean;
  readonly selectedVehicle?: StaffVehicleLocation;
  readonly storeById: Map<string, StoreRow>;
  readonly vehicles: StaffVehicleLocation[];
}) {
  const sorted = [...vehicles].sort((a, b) => {
    const staleDiff = Number(a.isStale) - Number(b.isStale);
    if (staleDiff !== 0) return staleDiff;
    const aTime = a.lastLocationAt ? new Date(a.lastLocationAt).getTime() : 0;
    const bTime = b.lastLocationAt ? new Date(b.lastLocationAt).getTime() : 0;
    return bTime - aTime;
  });
  const activeCount = sorted.filter((vehicle) => !vehicle.isStale).length;
  const filtered = selectedVehicle ? [selectedVehicle] : [];
  // 담당자 목록 위의 라이브 요약은 상단 상태 필터와 정보가 겹칩니다. 차량을 선택하지 않은
  // 평상시에는 목록 공간을 온전히 사용하고, 선택한 차량의 실행 버튼이 필요할 때만 상세를 엽니다.
  if (!selectedVehicle) return null;
  return (
    <section className="border-b border-slate-200/80 bg-white">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
            <Truck className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            {/* 병합 노트(2026-09-12): origin(Codex)은 displayName 필드가 없는 옛 버전이 계속 이어지고 있어
                pull할 때마다 이 지점에서 conflict가 납니다. lib/store.ts의
                StaffVehicleLocation.displayName(로컬 전용 기능)을 유지하는 쪽으로 계속 해소해야 합니다. */}
            <p className="truncate text-xs font-semibold text-slate-950">{selectedVehicle ? selectedVehicle.displayName : "라이브 차량 요약"}</p>
            <p className="truncate text-xs font-medium text-slate-500">활성 {activeCount}대 · 지연 {Math.max(0, sorted.length - activeCount)}대 · {STAFF_LOCATION_FRESHNESS_MINUTES}분 기준</p>
          </div>
        </div>
        <Badge className="shrink-0 bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">{sorted.length}대</Badge>
      </div>
      <div className="max-h-64 space-y-1 overflow-auto px-3 pb-2">
        {!sorted.length ? (
          <div className="rounded-md border border-amber-100 bg-amber-50 px-2 py-2">
            <p className="text-xs font-semibold text-amber-800">수신 차량 없음</p>
            <p className="mt-1 text-xs font-medium leading-5 text-amber-700">기사 모바일에서 위치 권한을 허용하면 지도에 표시됩니다.</p>
          </div>
        ) : null}
        {sorted.length && !selectedVehicle ? (
          <p className="rounded-md bg-slate-50 px-2 py-2 text-xs font-medium leading-5 text-slate-500">왼쪽 담당자·차량에서 차량을 선택하면 위치와 운행 상세가 표시됩니다.</p>
        ) : null}
        {filtered.map((vehicle) => {
          const checkedAt = vehicle.lastLocationAt ? new Date(vehicle.lastLocationAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "수신 전";
          const ageText = formatVehicleLocationAge(vehicle.lastLocationAt);
          const currentStore = vehicle.currentCustomerId ? storeById.get(vehicle.currentCustomerId) : undefined;
          const isActiveRoute = activeRouteVehicleId === vehicle.id;
          const dotColor = vehicle.isStale ? "#94a3b8" : vehicleColorForId(vehicle.id);
          const completedCount = completions.filter(
            (completion) =>
              (vehicle.driverName && completion.deliveryDriver === vehicle.driverName) || (vehicle.deliveryVehicle && completion.deliveryVehicle === vehicle.deliveryVehicle)
          ).length;
          return (
            <div
              className={`rounded-md border px-2 py-1.5 ${isActiveRoute ? "border-teal-300 bg-teal-50/70 ring-1 ring-inset ring-teal-200" : "border-slate-100 bg-slate-50"}`}
              key={vehicle.id}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-black text-slate-900">{vehicle.displayName}</p>
                    <p className="mt-0.5 truncate text-xs font-bold text-slate-500">
                      {vehicle.deliveryVehicle || "차량 미배정"} · {currentStore ? `작업 ${currentStore.name}` : "현재 작업 없음"} · {checkedAt}
                      {ageText ? ` · ${ageText}` : ""}
                    </p>
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-black ${vehicle.isStale ? "bg-slate-200 text-slate-700" : "bg-teal-100 text-teal-800"}`}>
                  {getVehicleStatusLabel(vehicle)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-xs font-bold text-slate-400">
                  {checkedAt} · 가까운 장소 {currentStore?.name || "확인 중"} · {getVehicleStatusLabel(vehicle)}
                  {completedCount ? <span className="font-black text-emerald-600"> · 완료 {completedCount}곳</span> : null}
                </p>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    className="rounded-full bg-teal-700 px-2 py-0.5 text-xs font-black text-white ring-1 ring-inset ring-teal-700 transition hover:bg-teal-800"
                    onClick={() => onFocusVehicle(vehicle.id)}
                    type="button"
                  >
                    지도
                  </button>
                  {onToggleRoute ? (
                    <button
                      className={`rounded-full px-2 py-0.5 text-xs font-black ring-1 ring-inset transition ${
                        isActiveRoute
                          ? "bg-slate-900 text-white ring-slate-900 hover:bg-slate-700"
                          : "bg-white text-slate-600 ring-slate-200 hover:text-teal-700 hover:ring-teal-200"
                      }`}
                      onClick={() => onToggleRoute(vehicle)}
                      type="button"
                    >
                      {isActiveRoute && routeLoading ? "불러오는 중" : isActiveRoute ? "경로 끄기" : "경로"}
                    </button>
                  ) : null}
                  <button
                    className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:text-teal-700 hover:ring-teal-200"
                    onClick={() => onAnalyze(vehicle)}
                    type="button"
                  >
                    분석
                  </button>
                  {currentStore ? (
                    <button
                      className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-teal-700 ring-1 ring-inset ring-teal-100 transition hover:bg-teal-50"
                      onClick={() => onPreviewStore(currentStore.id)}
                      type="button"
                    >
                      거래처
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function VehicleAnalysisModal({
  completions,
  currentStore,
  date,
  error,
  events,
  loading,
  onClose,
  onDateChange,
  onOpenHistory,
  onOpenStore,
  vehicle
}: {
  readonly completions: DeliveryCompletionEvent[];
  readonly currentStore?: StoreRow;
  readonly date: string;
  readonly error: string;
  readonly events: StaffLocationEvent[];
  readonly loading: boolean;
  readonly onClose: () => void;
  readonly onDateChange: (date: string) => void;
  readonly onOpenHistory: () => void;
  readonly onOpenStore: (storeId: string) => void;
  readonly vehicle: StaffVehicleLocation;
}) {
  const metrics = useMemo(() => summarizeLocationEvents(events), [events]);
  const completionSummary = useMemo(() => summarizeCompletionOrder(completions), [completions]);
  const routePath = useMemo(() => createLocationRoutePath(events), [events]);
  const markers = useMemo<KakaoMapMarker[]>(() => {
    const last = events[events.length - 1] || null;
    if (!last) return [];
    const vehicleMarker: KakaoMapMarker = {
      address: "최근 수신 위치",
      id: `analysis-${vehicle.id}`,
      label: vehicle.deliveryVehicle || vehicle.driverName,
      lat: last.lat,
      lng: last.lng,
      markerColor: vehicle.isStale ? "#64748b" : "#0f766e",
      name: `${vehicle.driverName} · 최근 수신 ${new Date(last.recordedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`,
      tone: "vehicle" as const,
      vehicleIcon: operationalMarkerPersonIcon(vehicle.deliveryVehicle),
      x: 50,
      y: 50
    };
    const currentStoreMarker: KakaoMapMarker | null = currentStore?.address
      ? {
          address: currentStore.address,
          grade: currentStore.grade,
          id: `analysis-store-${currentStore.id}`,
          label: "작업",
          name: currentStore.name,
          tone: "customer" as const,
          x: 52,
          y: 52
        }
      : null;
    return currentStoreMarker ? [vehicleMarker, currentStoreMarker] : [vehicleMarker];
  }, [currentStore, events, vehicle]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4" onClick={onClose}>
      <section className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-teal-700">운행 기록 분석</p>
            <h2 className="mt-1 truncate text-xl font-black text-slate-950">{vehicle.deliveryVehicle || vehicle.driverName}</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">
              {vehicle.driverName} · {date} 날짜별 GPS·배송 기록
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <input aria-label="운행 기록 날짜" className="h-9 rounded-md border border-slate-200 px-2 text-xs font-black text-slate-700" max={getTmsServiceDateKey()} onChange={(event) => onDateChange(event.target.value)} type="date" value={date} />
            <button className="maju-button-secondary h-9 px-3 text-xs" onClick={onOpenHistory} type="button">전체 기간 기록</button>
            <button className="maju-button-secondary h-9 px-3 text-xs" onClick={onClose} type="button">닫기</button>
          </div>
        </header>
        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[1fr_280px]">
          <div className="min-h-[420px] bg-slate-100">
            {loading ? (
              <div className="grid h-full min-h-[420px] place-items-center text-sm font-black text-slate-500">GPS 기록을 불러오는 중입니다.</div>
            ) : error ? (
              <div className="grid h-full min-h-[420px] place-items-center p-6 text-center text-sm font-bold text-rose-600">{error}</div>
            ) : events.length ? (
              <KakaoAddressMap mapClassName="h-full min-h-[420px] rounded-none border-0" markers={markers} routePath={routePath} showList={false} />
            ) : (
              <div className="grid h-full min-h-[420px] place-items-center p-6 text-center text-sm font-bold text-slate-500">선택한 날짜에 저장된 GPS 기록이 없습니다.</div>
            )}
          </div>
          <aside className="min-h-0 overflow-auto border-l border-slate-200 bg-white p-4">
            <div className="grid grid-cols-2 gap-2">
              <RouteMetric label="실제 이동" value={`${metrics.distanceKm.toLocaleString()}km`} />
              <RouteMetric label="운행 시간" value={formatMinutes(metrics.durationMinutes)} />
              <RouteMetric label="GPS 기록" value={`${events.length.toLocaleString()}건`} />
              <RouteMetric label="누락 구간" value={`${metrics.gapCount.toLocaleString()}구간`} />
              <RouteMetric label="완료 매장" value={`${completions.length.toLocaleString()}곳`} />
              <RouteMetric label="보정 제외" value={`${metrics.ignoredCount.toLocaleString()}건`} />
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-black text-slate-950">판단 기준</p>
              <p className="mt-1 text-[11px] font-bold leading-5 text-slate-500">연속 위치 기록이 5분 이상 비거나, GPS 오차가 150m를 넘거나, 비정상 속도로 튄 좌표는 실제 경로에서 제외합니다.</p>
              <p className="mt-1 text-[11px] font-bold leading-5 text-slate-500">배송 완료 메모는 실제 방문 순서로 표시하며 계획 순서 일치율은 {completionSummary.label}입니다.</p>
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                <p className="text-xs font-black text-slate-950">실제 방문 순서</p>
                <Badge className="bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-100">{completions.length}건</Badge>
              </div>
              <div className="max-h-44 overflow-auto p-2">
                {loading ? (
                  <p className="rounded-md bg-slate-50 p-3 text-[11px] font-bold text-slate-500">완료 기록을 불러오는 중입니다.</p>
                ) : completions.length ? (
                  <div className="space-y-1.5">
                    {completions.map((completion) => (
                      <div className="rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5" key={completion.id || `${completion.customerId}-${completion.completedAt}`}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="min-w-0 truncate text-[11px] font-black text-slate-900">
                            {completion.actualOrder}. {completion.customerName}
                          </p>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-black ring-1 ring-inset ${getCompletionOrderClass(completion)}`}>
                            {getCompletionOrderLabel(completion)}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs font-bold text-slate-500">
                          {new Date(completion.completedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                          {completion.statusLabel ? ` · ${completion.statusLabel}` : ""}
                        </p>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <p className="min-w-0 truncate text-xs font-bold text-slate-400">{completion.memoSnippet || "완료 메모 없음"}</p>
                          <button
                            className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-black text-teal-700 ring-1 ring-inset ring-teal-100 transition hover:bg-teal-50"
                            onClick={() => onOpenStore(completion.customerId)}
                            type="button"
                          >
                            열기
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md bg-slate-50 p-3 text-[11px] font-bold text-slate-500">선택한 날짜의 배송 완료 기록이 없습니다.</p>
                )}
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <p className="text-xs font-black text-slate-950">최근 GPS 기록</p>
              {events.slice(-8).reverse().map((event) => (
                <div className="rounded-lg border border-slate-100 bg-white p-2" key={event.id}>
                  <p className="text-[11px] font-black text-slate-900">{new Date(event.recordedAt).toLocaleString("ko-KR")}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    가까운 장소 {event.currentCustomerId && event.currentCustomerId === currentStore?.id ? currentStore.name : "운행 경로"} · {event.currentCustomerId ? "배송 업무 중" : "이동 기록"}
                  </p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}


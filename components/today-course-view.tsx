"use client";

import { useEffect, useState } from "react";
import {
  Camera,
  Copy,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search
} from "lucide-react";
import { KakaoAddressMap, KakaoMapMarker } from "@/components/kakao-address-map";
import { RouteSequence, RouteSequenceAction } from "@/components/route-sequence-action";
import type { GeoPoint } from "@/lib/navigation-links";
import type { DeliveryVehicle } from "@/lib/store";
import {
  clamp,
  CourseSummary,
  DeliveryProof,
  DeliveryProofInput,
  estimateFuelCostWon,
  formatDistanceKmLabel,
  formatMinutes,
  FullRouteNavigateAction,
  FuelPriceByType,
  getRouteStopAddress,
  getStoreTotals,
  gradeBadgeClass,
  localStoreKeys,
  NavigateMenu,
  OperationalEmptyState,
  readLocalJson,
  roundToSix,
  RouteMetric,
  RouteWorkStep,
  saveLocalJson,
  StoreQuickCard,
  StoreRow,
  tmapWaypointLimit
} from "./sales-route-map-workspace";

export function TodayCourseView({
  dataRegistrationHref,
  fuelPrices,
  markers,
  onConsumePendingAddStore,
  onPreviewStore,
  onSummaryChange,
  onSelectStore,
  onSelectVehicle,
  pendingAddStoreId,
  routeTotals,
  selectedStoreId,
  selectedVehicle,
  selectedVehicleId,
  sourceReady,
  stores,
  vehicles
}: {
  readonly dataRegistrationHref: string;
  /** 2026-08-24 피드백: "출발지에서 거래처, 거래처에서의 경유지까지 예상 유류비 나와야할 텐데" — 구간별
   * 예상 유류비 계산에 씁니다. */
  readonly fuelPrices: FuelPriceByType;
  readonly markers: KakaoMapMarker[];
  /** 지도 홈 퀵카드의 "경유지 추가"로 넘어온 경우, pendingAddStoreId를 소비했음을 알립니다. */
  readonly onConsumePendingAddStore?: () => void;
  readonly onPreviewStore: (storeId: string) => void;
  readonly onSummaryChange: (summary: CourseSummary) => void;
  readonly onSelectStore: (storeId: string) => void;
  readonly onSelectVehicle: (vehicleId: string) => void;
  /** 지도 홈에서 "경유지 추가"를 눌러 이 탭으로 넘어온 거래처 id — 마운트/변경 시 오늘 경유 선택에 자동 포함시킵니다. */
  readonly pendingAddStoreId?: string;
  readonly routeTotals: { distanceKm: number; durationMinutes: number; expectedRevenue: number };
  readonly selectedStoreId: string;
  readonly selectedVehicle?: DeliveryVehicle;
  readonly selectedVehicleId: string;
  readonly sourceReady: boolean;
  readonly stores: StoreRow[];
  readonly vehicles: DeliveryVehicle[];
}) {
  const [routeSequence, setRouteSequence] = useState<RouteSequence | null>(null);
  const [routeBatchIndex, setRouteBatchIndex] = useState(0);
  const [routePanelCollapsed, setRoutePanelCollapsed] = useState(false);
  const [routeLeftPanelCollapsed, setRouteLeftPanelCollapsed] = useState(false);
  // 우측 패널 기본 탭을 "거래처"로 둬서, 실제 작업 순서(차량 선택 → 경유 거래처 고르기)에 맞게
  // 전체 거래처 목록과 경유 추가/해제가 계산 요약보다 먼저 눈에 들어오게 합니다.
  const [routeRightPanelTab, setRouteRightPanelTab] = useState<"list" | "summary">("list");
  const [routeQuery, setRouteQuery] = useState("");
  const [routeSelectedStoreId, setRouteSelectedStoreId] = useState("");
  const [selectedRouteStoreIds, setSelectedRouteStoreIds] = useState<string[]>([]);
  const [routeOriginMode, setRouteOriginMode] = useState<"company" | "current">("company");
  const [currentLocationOrigin, setCurrentLocationOrigin] = useState("");
  const [currentLocationMessage, setCurrentLocationMessage] = useState("");
  const [deliveryProofs, setDeliveryProofs] = useState<Record<string, DeliveryProof[]>>(() => readLocalJson(localStoreKeys.deliveryProofs, {}));
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
  // 2026-08-24 피드백: "출발지에서 거래처, 거래처에서의 경유지까지 예상 유류비 나와야할 텐데" — 티맵으로
  // 경유 순서를 계산하면 legs 배열에 구간별(출발지→1번째, 1번째→2번째, ...) 거리가 이미 들어있으므로,
  // 상단 KPI의 하루 전체 합산 유류비와 별개로 구간마다 예상 유류비를 따로 보여줄 수 있습니다.
  const courseFuelType = selectedVehicle?.fuelType || "diesel";
  const courseFuelPricePerLiter = fuelPrices[courseFuelType]?.pricePerLiter || 0;
  const courseFuelPriceReady = Boolean(fuelPrices[courseFuelType]);
  const routeSequenceLegFuelCosts = routeSequence?.legs.map((leg) => estimateFuelCostWon(leg.distanceKm, courseFuelPricePerLiter)) || [];
  const routeSequenceFuelCostWon = routeSequenceLegFuelCosts.reduce((total, cost) => total + cost, 0);
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
  const routeOriginAddress = routeOriginMode === "current" && currentLocationOrigin ? currentLocationOrigin : originMarker?.address || "";
  const routeOriginLabel = routeOriginMode === "current" && currentLocationOrigin ? "현위치 출발" : "회사 출발지";
  // 티맵 계산이 이미 좌표를 구했다면(routeSequence.stopPoints) 매장별 길찾기가 다시 지오코딩하지
  // 않고 그 좌표를 그대로 재사용하도록 주소 -> 좌표 맵을 만들어둡니다.
  const routeStopPointByAddress = new Map<string, GeoPoint | null>(
    (routeSequence?.stops || []).map((address, index) => [address, routeSequence?.stopPoints?.[index] || null])
  );
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
            name: routeOriginLabel
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

  useEffect(() => saveLocalJson(localStoreKeys.deliveryProofs, deliveryProofs), [deliveryProofs]);

  // 지도 홈에서 "경유지 추가"로 넘어온 거래처를 오늘 경유 선택에 자동으로 포함시킵니다.
  useEffect(() => {
    if (!pendingAddStoreId) return;
    setSelectedRouteStoreIds((current) => (current.includes(pendingAddStoreId) ? current : [...current, pendingAddStoreId]));
    onConsumePendingAddStore?.();
  }, [pendingAddStoreId, onConsumePendingAddStore]);

  if (!sourceReady) {
    return (
      <section className="min-h-[620px] rounded-b-xl bg-[#f6f8fb] p-4">
        <OperationalEmptyState
          actionHref={dataRegistrationHref}
          actionLabel="거래처 등록"
          description="거래처 주소와 배송차 배정값을 등록하세요."
          title="경유 코스 계산 대기"
        />
      </section>
    );
  }

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
  const useCurrentLocationAsOrigin = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setCurrentLocationMessage("이 브라우저에서는 현위치 기능을 사용할 수 없습니다.");
      return;
    }

    setCurrentLocationMessage("현위치를 확인 중입니다.");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = roundToSix(position.coords.latitude);
        const lng = roundToSix(position.coords.longitude);
        setCurrentLocationOrigin(`${lat},${lng}`);
        setRouteOriginMode("current");
        setRouteSequence(null);
        setCurrentLocationMessage("현위치를 출발 기준으로 설정했습니다.");
      },
      () => {
        setRouteOriginMode("company");
        setCurrentLocationMessage("현위치 권한을 받을 수 없어 회사 출발지를 사용합니다.");
      },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 8000 }
    );
  };
  const saveDeliveryProof = async (storeId: string, proof: DeliveryProofInput) => {
    let persisted = false;
    const memo = `${proof.memo}\n\n배송 상태: ${deliveryStatusLabel(proof.deliveryStatus)}\n알림 방식: ${proof.messageChannel === "kakao" ? "카톡 발송 대기" : "문자 발송 대기"}${proof.fileName ? `\n증빙 파일: ${proof.fileName}` : ""}`;

    try {
      const noteRequest = fetch("/api/customer-operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "note",
          customerId: storeId,
          memo,
          nextAction: proof.messageChannel === "kakao" ? "카카오 알림톡 발송" : "문자 발송",
          noteType: "delivery"
        })
      });
      const attachmentRequest = proof.file
        ? uploadDeliveryProofFile(storeId, proof.file, proof.fileName || "배송완료 증빙")
        : fetch("/api/customer-operations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "attachment",
              attachmentType: "delivery_proof",
              customerId: storeId,
              fileUrl: "",
              mimeType: proof.fileName.toLowerCase().match(/\.(mp4|mov|webm)$/) ? "video/*" : "image/*",
              title: proof.fileName || "배송완료 증빙"
            })
          });
      const [noteResponse, attachmentResponse] = await Promise.all([noteRequest, attachmentRequest]);

      persisted = noteResponse.ok && attachmentResponse.ok;
    } catch {
      persisted = false;
    }

    setDeliveryProofs((current) => ({
      ...current,
      [storeId]: [
        {
          ...proof,
          persisted,
          recordedAt: new Date().toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" }),
          storeId
        },
        ...(current[storeId] || [])
      ]
    }));
  };

  // 좌측(경유 코스 목록)·우측(경유 순서) 패널을 각각 독립적으로 접었다 펼 수 있어 4가지 조합이 나옵니다.
  // Tailwind가 클래스를 정적으로 스캔할 수 있도록 조합별 전체 클래스 문자열을 그대로 나열합니다.
  const routeGridColsClassName = routeLeftPanelCollapsed
    ? routePanelCollapsed
      ? "xl:grid-cols-[56px_minmax(0,1fr)_56px]"
      : "xl:grid-cols-[56px_minmax(0,1fr)_400px]"
    : routePanelCollapsed
      ? "xl:grid-cols-[280px_minmax(0,1fr)_56px]"
      : "xl:grid-cols-[280px_minmax(0,1fr)_400px]";

  return (
    <section className={`grid min-h-[480px] flex-1 grid-cols-1 overflow-hidden rounded-b-xl bg-[#f6f8fb] xl:min-h-0 ${routeGridColsClassName}`}>
      <aside className="flex h-full min-h-0 flex-col border-r border-slate-200/80 bg-white">
        {routeLeftPanelCollapsed ? (
          <div className="flex h-full flex-col items-center gap-3 px-2 py-3">
            <button
              aria-label="경유 코스 목록 패널 열기"
              className="maju-button-secondary h-10 w-10 px-0"
              onClick={() => setRouteLeftPanelCollapsed(false)}
              type="button"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
            <div className="[writing-mode:vertical-rl] text-xs font-black text-slate-500">경유 코스</div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{vehicles.length}</span>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-950">경유 코스</p>
                <p className="mt-1 text-xs font-bold text-slate-500">차량을 고른 뒤 경유 거래처를 계산합니다.</p>
              </div>
              <button
                aria-label="경유 코스 목록 패널 접기"
                className="maju-button-secondary h-9 w-9 shrink-0 px-0"
                onClick={() => setRouteLeftPanelCollapsed(true)}
                type="button"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 border-b border-slate-200/80 bg-white p-3">
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-900 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100"
                onChange={(event) => onSelectVehicle(event.target.value)}
                value={selectedVehicleId}
              >
                <option value="all">전체 거래처 보기</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {[vehicle.name, vehicle.driver].filter(Boolean).join(" · ")} · {vehicle.stops.length}곳
                  </option>
                ))}
              </select>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="maju-search-field h-10 w-full bg-slate-50 pl-9 pr-3"
                  onChange={(event) => setRouteQuery(event.target.value)}
                  placeholder="거래처명·주소·담당자 검색"
                  value={routeQuery}
                />
              </label>
            </div>
            <div className="border-b border-slate-200/80 p-3">
              <div className="maju-panel bg-slate-50 p-3">
                <p className="text-xs font-black text-slate-500">실사용 순서</p>
                <div className="mt-3 grid gap-2">
                  <RouteWorkStep active={!isVehicleScoped} done={isVehicleScoped} label="배송차 선택" />
                  <RouteWorkStep active={isVehicleScoped && selectedRouteStores.length > 0} done={isVehicleScoped && selectedRouteStores.length > 0} label="경유 거래처 선택" />
                  <RouteWorkStep active={isVehicleScoped && selectedRouteStores.length > 0 && !routeSequence} done={Boolean(routeSequence)} label="티맵 도로 계산" />
                  <RouteWorkStep active={Boolean(routeSequence)} done={Boolean(routeSequence)} label="코스 확인" />
                </div>
              </div>
            </div>
            <div className="max-h-[calc(100vh-260px)] min-h-0 flex-1 space-y-2 overflow-auto p-3 xl:max-h-none">
              <button
                className={`w-full rounded-md border p-3 text-left transition ${selectedVehicleId === "all" ? "border-teal-300 bg-teal-50 ring-1 ring-teal-100" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                onClick={() => onSelectVehicle("all")}
                type="button"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-black text-slate-950">전체 거래처 보기</p>
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
                  <p className="mt-1 text-xs font-bold text-slate-500">{[vehicle.driver, vehicle.area].filter(Boolean).join(" · ")}</p>
                </button>
              ))}
            </div>
          </>
        )}
      </aside>

      <div className="relative h-[620px] min-h-0 min-w-0 bg-slate-100 xl:h-full">
        <div className="h-full min-h-0 [&>div]:h-full">
          <KakaoAddressMap
            focusedMarkerId={routeSelectedStoreId || selectedStoreId || undefined}
            mapClassName="h-full min-h-[620px] rounded-none border-0 xl:min-h-0"
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
            isInRoute={selectedRouteIdSet.has(routeSelectedStore.id)}
            onAddToRoute={() => toggleRouteStore(routeSelectedStore.id)}
            onClose={() => setRouteSelectedStoreId("")}
            onOpenDetail={() => onSelectStore(routeSelectedStore.id)}
            originAddress={routeOriginAddress}
            store={routeSelectedStore}
            variant="grid"
          />
        ) : null}
      </div>

      <aside className="min-h-0 border-l border-slate-200/80 bg-white">
        {routePanelCollapsed ? (
          <div className="flex h-full flex-col items-center gap-3 px-2 py-3">
            <button
              aria-label="경유 코스 패널 열기"
              className="maju-button-secondary h-10 w-10 px-0"
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
                className="maju-button-secondary h-9 w-9 shrink-0 px-0"
                onClick={() => setRoutePanelCollapsed(true)}
                type="button"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-1.5 border-b border-slate-200/80 bg-slate-50/60 p-2">
              <button
                className={`h-8 flex-1 rounded-md text-xs font-black transition ${
                  routeRightPanelTab === "list" ? "bg-white text-slate-950 shadow-sm ring-1 ring-inset ring-slate-200" : "text-slate-500 hover:text-slate-700"
                }`}
                onClick={() => setRouteRightPanelTab("list")}
                type="button"
              >
                거래처 · 경유 {selectedRouteStoresAll.length}곳
              </button>
              <button
                className={`h-8 flex-1 rounded-md text-xs font-black transition ${
                  routeRightPanelTab === "summary" ? "bg-white text-slate-950 shadow-sm ring-1 ring-inset ring-slate-200" : "text-slate-500 hover:text-slate-700"
                }`}
                onClick={() => setRouteRightPanelTab("summary")}
                type="button"
              >
                요약 · 티맵 계산
              </button>
            </div>
            <div className="max-h-[calc(100vh-260px)] min-h-0 flex-1 overflow-auto xl:max-h-none">
              {routeRightPanelTab === "summary" ? (
              <div className="border-b border-slate-200/80 p-3">
                <div className="maju-panel mb-3 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-950">출발 기준</p>
                      <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                        회사 출발지 또는 현재 위치에서 바로 경유 계산을 시작할 수 있습니다.
                      </p>
                    </div>
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{routeOriginLabel}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      className={`h-9 rounded-md border px-3 text-xs font-black transition ${
                        routeOriginMode === "company" ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
                      }`}
                      onClick={() => {
                        setRouteOriginMode("company");
                        setRouteSequence(null);
                      }}
                      type="button"
                    >
                      회사 출발지
                    </button>
                    <button
                      className={`h-9 rounded-md border px-3 text-xs font-black transition ${
                        routeOriginMode === "current" ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                      onClick={useCurrentLocationAsOrigin}
                      type="button"
                    >
                      현위치 출발
                    </button>
                  </div>
                  <p className="mt-2 truncate text-xs font-bold text-slate-500" title={routeOriginAddress || currentLocationMessage}>
                    {currentLocationMessage || (routeOriginMode === "current" ? routeOriginAddress || "현위치를 먼저 확인하세요." : originMarker?.address || "회사 출발지 확인 필요")}
                  </p>
                </div>
                <div className="mb-3 grid grid-cols-3 gap-2">
                  <RouteMetric label="계산 대상" value={`${selectedRouteStores.length}곳`} />
                  <RouteMetric label={routeSequence ? "티맵 경유 거리" : "출발지-거래처 거리합"} value={`${routeDistanceKm.toLocaleString()}km`} />
                  <RouteMetric label={routeSequence ? "티맵 경유 시간" : "출발지 기준 시간합"} value={formatMinutes(routeDurationMinutes)} />
                </div>
                <div className={`mb-3 rounded-md border p-3 ${routeSequence ? "border-emerald-200 bg-emerald-50" : isVehicleScoped && selectedRouteStores.length ? "border-slate-200 bg-slate-50" : "border-amber-200 bg-amber-50"}`}>
                  <p className={`text-sm font-black ${routeSequence ? "text-emerald-800" : isVehicleScoped && selectedRouteStores.length ? "text-slate-900" : "text-amber-800"}`}>
                    {routeSequence ? "티맵 계산 완료" : isVehicleScoped && selectedRouteStores.length ? "티맵 계산 대기" : isVehicleScoped ? "경유지 선택 필요" : "배송차 선택 필요"}
                  </p>
                  <p className={`mt-1 text-xs font-bold leading-5 ${routeSequence ? "text-emerald-700" : isVehicleScoped && selectedRouteStores.length ? "text-slate-600" : "text-amber-800"}`}>
                    {routeSequence
                      ? `현재 묶음 ${selectedRouteStores.length}곳의 도로 경로를 지도에 반영했습니다.`
                      : isVehicleScoped && selectedRouteStores.length
                        ? `${activeRouteBatchIndex + 1}묶음 ${selectedRouteStores.length}곳을 계산할 준비가 됐습니다. 버튼을 눌러 도로 기준 경유 거리와 시간을 갱신하세요.`
                        : isVehicleScoped
                          ? "아래 거래처 목록에서 경유지를 추가하세요."
                          : "왼쪽에서 배송차를 선택하면 해당 차량의 거래처만 경유 계산 대상으로 표시됩니다."}
                  </p>
                </div>
                {isVehicleScoped ? (
                  <RouteSequenceAction
                    buttonLabel={`${activeRouteBatchIndex + 1}묶음 티맵 계산`}
                    destinations={selectedRouteStores.map((store) => getRouteStopAddress(store)).filter(Boolean)}
                    onSequenceChange={setRouteSequence}
                    originAddress={routeOriginAddress}
                    showMap={false}
                  />
                ) : null}
                {routeSequence && sequencedRouteStores.length ? (
                  <FullRouteNavigateAction originLabel={routeOriginLabel} originPoint={routeSequence.originPoint} stores={sequencedRouteStores} stopPointByAddress={routeStopPointByAddress} />
                ) : null}
                {routeSelectedStore ? (
                  <DeliveryProofPanel
                    onSave={(proof) => saveDeliveryProof(routeSelectedStore.id, proof)}
                    proofs={deliveryProofs[routeSelectedStore.id] || []}
                    store={routeSelectedStore}
                  />
                ) : null}
              </div>
              ) : null}
              {routeRightPanelTab === "list" ? (
              <>
              <div className="space-y-2 border-b border-slate-200/80 p-3">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    className="maju-search-field h-10 w-full bg-slate-50 pl-9 pr-3"
                    onChange={(event) => setRouteQuery(event.target.value)}
                    placeholder="경유 거래처 검색..."
                    value={routeQuery}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button className="maju-button-primary h-8 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!isVehicleScoped} onClick={selectDefaultRouteStores} type="button">
                    기본 15곳 선택
                  </button>
                  <button className="maju-button-secondary h-8 disabled:cursor-not-allowed disabled:opacity-40" disabled={!isVehicleScoped} onClick={selectAllRouteStores} type="button">
                    전체 선택
                  </button>
                  <button className="maju-button-secondary h-8 text-slate-600 disabled:cursor-not-allowed disabled:opacity-40" disabled={!isVehicleScoped} onClick={clearRouteStores} type="button">
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
                      className="maju-button-secondary h-8 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={activeRouteBatchIndex === 0}
                      onClick={goToPreviousRouteBatch}
                      type="button"
                    >
                      이전 15곳
                    </button>
                    <button
                      className="maju-button-secondary h-8 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={activeRouteBatchIndex >= routeBatchCount - 1}
                      onClick={goToNextRouteBatch}
                      type="button"
                    >
                      다음 15곳
                    </button>
                  </div>
                ) : null}
                <div className="maju-filter-box bg-slate-50 px-3 py-2 text-xs font-bold leading-5 text-slate-500">
                  티맵 경유지 제한 때문에 실제 도로 계산은 최대 {tmapWaypointLimit}곳씩 나눠 처리합니다.
                </div>
              </div>
              <div className="border-b border-slate-200 bg-slate-50/80 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-slate-950">선택한 경유지</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">현재 묶음 {selectedRouteStores.length}곳을 티맵 계산에 사용합니다.</p>
                  </div>
                  <span className="rounded-md bg-white px-2 py-1 text-xs font-black text-slate-700 ring-1 ring-inset ring-slate-200">
                    {activeRouteBatchIndex + 1}/{routeBatchCount}
                  </span>
                </div>
                {selectedRouteStores.length ? (
                  <div className="max-h-[260px] space-y-2 overflow-auto pr-1">
                    {selectedRouteStores.map((store, index) => (
                      <button
                        className={`w-full rounded-md border p-3 text-left transition hover:bg-white ${
                          store.id === routeSelectedStore?.id ? "border-teal-300 bg-teal-50 shadow-sm ring-1 ring-teal-100" : "border-slate-200 bg-white/80"
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
                              출발지 기준 {formatDistanceKmLabel(store.distanceKm)} · {formatMinutes(store.durationMinutes || 0)} · 매출 {store.expectedRevenue.toLocaleString()}만원
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-2">
                            <span className={gradeBadgeClass(store.grade)}>{store.grade}</span>
                            <span className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                              <NavigateMenu
                                compact
                                destinationAddress={getRouteStopAddress(store)}
                                destinationName={store.name}
                                knownDestinationPoint={routeStopPointByAddress.get(getRouteStopAddress(store))}
                                knownOriginPoint={routeSequence?.originPoint}
                                originAddress={routeOriginAddress}
                              />
                              <span
                                className="maju-button-secondary px-2 py-1 text-[11px]"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleRouteStore(store.id);
                                }}
                              >
                                해제
                              </span>
                            </span>
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="maju-empty-state bg-white p-4">
                    <p className="text-sm font-black text-slate-700">선택한 경유지가 없습니다.</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">아래 거래처 목록에서 추가 버튼을 누르세요.</p>
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
                {routeSequence?.legs.length ? (
                  <div className="mb-3 rounded-md border border-slate-200 bg-white p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-black text-slate-950">구간별 예상 유류비</p>
                      <span className="text-[11px] font-bold text-slate-500">
                        {courseFuelPriceReady ? `${courseFuelType === "gasoline" ? "휘발유" : "경유"} ${courseFuelPricePerLiter.toLocaleString()}원/L 기준` : "유가 정보를 불러오는 중"}
                      </span>
                    </div>
                    <div className="max-h-[220px] space-y-1.5 overflow-auto pr-1">
                      {routeSequence.legs.map((leg, index) => {
                        const fromLabel = index === 0 ? routeOriginLabel : sequencedRouteStores[index - 1]?.name || "이전 경유지";
                        const toLabel = sequencedRouteStores[index]?.name || `경유지 ${index + 1}`;
                        return (
                          <div className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1.5" key={`${leg.order}-${leg.toAddress}`}>
                            <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-700" title={`${fromLabel} → ${toLabel}`}>
                              {fromLabel} → {toLabel}
                            </span>
                            <span className="shrink-0 text-xs font-bold text-slate-500">{leg.distanceKm.toLocaleString()}km</span>
                            <span className="shrink-0 text-xs font-black text-teal-700">
                              {courseFuelPriceReady ? `${routeSequenceLegFuelCosts[index]?.toLocaleString() || 0}원` : "-"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
                      <span className="text-xs font-black text-slate-950">구간 합계</span>
                      <span className="text-xs font-black text-teal-700">
                        {courseFuelPriceReady ? `${routeSequenceFuelCostWon.toLocaleString()}원` : "유가 정보를 불러오는 중"}
                      </span>
                    </div>
                  </div>
                ) : null}
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-slate-950">{isVehicleScoped ? "거래처 선택" : "배송차 선택 필요"}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      {isVehicleScoped ? "거래처를 누르면 지도 위치가 이동하고, 추가 버튼으로 경유지에 넣습니다." : "왼쪽에서 배송차를 선택하면 해당 차량의 거래처가 표시됩니다."}
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
                          ? "border-teal-300 bg-teal-50 ring-1 ring-teal-100"
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
                            activeForRoute ? "bg-teal-700 text-white" : selectedForRoute ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {selectedForRoute ? selectedOrder : index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black text-slate-950">{store.name}</span>
                          <span className="mt-1 block truncate text-xs font-bold text-slate-500">{store.address || store.region}</span>
                          <span className="mt-2 block text-xs font-bold text-slate-400">출발지 기준 {formatDistanceKmLabel(store.distanceKm)} · {formatMinutes(store.durationMinutes || 0)} · 매출 {store.expectedRevenue.toLocaleString()}만원</span>
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
                              selectedForRoute ? "bg-teal-600 text-white" : "bg-teal-700 text-white hover:bg-teal-800"
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
                    <div className="maju-empty-state bg-white p-4">
                      <p className="text-sm font-black text-slate-700">{isVehicleScoped ? "조건에 맞는 거래처가 없습니다." : "배송차를 먼저 선택하세요."}</p>
                      <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                        {isVehicleScoped ? "검색어를 조정하거나 다른 배송차를 선택하세요." : "왼쪽 배송차 목록에서 1호차, 2호차처럼 실제 차량을 선택하면 경유지를 고를 수 있습니다."}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              </>
              ) : null}
            </div>
          </div>
        )}
      </aside>
    </section>
  );
}

function DeliveryProofPanel({
  onSave,
  proofs,
  store
}: {
  readonly onSave: (proof: DeliveryProofInput) => Promise<void>;
  readonly proofs: DeliveryProof[];
  readonly store: StoreRow;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryProof["deliveryStatus"]>("arrived");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [memo, setMemo] = useState("");
  const [messageChannel, setMessageChannel] = useState<DeliveryProof["messageChannel"]>("kakao");
  const [copyMessage, setCopyMessage] = useState("");
  const ownerMessage = createDeliveryOwnerMessage(store, memo, deliveryStatus, fileName);

  const saveProof = async () => {
    setIsSaving(true);
    setSaveMessage("");
    await onSave({
      deliveryStatus,
      file,
      fileName: fileName || "현장 사진 미첨부",
      memo: ownerMessage,
      messageChannel
    });
    setSaveMessage(file ? "배송완료 사진/영상과 메모를 저장했습니다." : "배송완료 메모를 저장했습니다. 사진은 나중에 추가할 수 있습니다.");
    setFile(null);
    setFileName("");
    setIsSaving(false);
    setMemo("");
  };
  const copyOwnerMessage = async () => {
    try {
      await navigator.clipboard.writeText(ownerMessage);
      setCopyMessage("점주 발송 문구를 복사했습니다.");
    } catch {
      setCopyMessage("복사 권한을 받을 수 없습니다. 문구를 직접 선택해 복사하세요.");
    }
  };

  return (
      <div className="maju-panel mt-3 border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-slate-950">
            <Camera className="h-4 w-4 text-slate-700" />
            배송완료 증빙
          </p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-600">
            {store.name} 도착 후 사진을 남기고 점주님께 발송할 알림을 준비합니다.
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-slate-700 ring-1 ring-inset ring-slate-200">{proofs.length}건</span>
      </div>
        <label className="mt-3 flex min-h-16 cursor-pointer items-center gap-3 rounded-md border border-dashed border-slate-300 bg-white px-3 py-3 text-left transition hover:border-slate-400 hover:bg-slate-50">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-teal-700 text-white">
          <Plus className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-black text-slate-900">{fileName || "도착 사진/영상 선택"}</span>
          <span className="mt-1 block text-xs font-bold text-slate-500">파일명과 발송 상태를 기록합니다.</span>
        </span>
        <input
          accept="image/*,video/*"
          className="hidden"
          onChange={(event) => {
            const nextFile = event.target.files?.[0] || null;
            setFile(nextFile);
            setFileName(nextFile?.name || "");
          }}
          type="file"
        />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {[
          { label: "카톡 발송 대기", value: "kakao" },
          { label: "문자 발송 대기", value: "sms" }
        ].map((item) => (
          <button
            className={`h-9 rounded-md border px-3 text-xs font-black transition ${
              messageChannel === item.value ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            key={item.value}
            onClick={() => setMessageChannel(item.value as DeliveryProof["messageChannel"])}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { label: "도착완료", value: "arrived" },
          { label: "부분배송", value: "partial" },
          { label: "이슈발생", value: "issue" }
        ].map((item) => (
          <button
            className={`h-9 rounded-md border px-2 text-xs font-black transition ${
              deliveryStatus === item.value ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            key={item.value}
            onClick={() => setDeliveryStatus(item.value as DeliveryProof["deliveryStatus"])}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <textarea
        className="mt-3 min-h-20 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
        onChange={(event) => setMemo(event.target.value)}
        placeholder="추가 메모 예: 요청하신 냉장고 앞에 적재했습니다."
        value={memo}
      />
      <div className="maju-panel mt-3 border-slate-200 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-black text-slate-500">점주 발송 문구</p>
          <button
            className="maju-button-secondary h-8 px-2.5"
            onClick={copyOwnerMessage}
            type="button"
          >
            <Copy className="h-3.5 w-3.5" />
            복사
          </button>
        </div>
        <p className="mt-2 whitespace-pre-line rounded-md bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-700">{ownerMessage}</p>
        {copyMessage ? <p className="mt-2 text-xs font-bold text-slate-700">{copyMessage}</p> : null}
      </div>
      <button
        className="maju-button-primary mt-2 w-full disabled:cursor-not-allowed disabled:bg-slate-300"
        disabled={isSaving}
        onClick={saveProof}
        type="button"
      >
        <MessageSquareText className="h-3.5 w-3.5" />
        {isSaving ? "저장 중" : "배송완료 기록 저장"}
      </button>
      {saveMessage ? <p className="mt-2 text-xs font-bold leading-5 text-slate-700">{saveMessage}</p> : null}
      {proofs.length ? (
        <div className="mt-3 space-y-2">
          {proofs.slice(0, 3).map((proof) => (
            <div className="rounded-md border border-slate-200 bg-white p-2" key={`${proof.recordedAt}-${proof.fileName}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-black text-slate-900">{proof.fileName}</p>
                <span className={`rounded px-2 py-0.5 text-[11px] font-black ${proof.persisted ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {proof.persisted ? "저장 완료" : "로컬 기록"} · {proof.messageChannel === "kakao" ? "카톡" : "문자"}
                </span>
              </div>
              <p className="mt-1 text-[11px] font-black text-slate-700">{deliveryStatusLabel(proof.deliveryStatus)}</p>
              <p className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-slate-500">{proof.memo}</p>
              <p className="mt-1 text-[11px] font-bold text-slate-400">{proof.recordedAt}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

async function uploadDeliveryProofFile(storeId: string, file: File, title: string) {
  const formData = new FormData();
  formData.append("attachmentType", "delivery_proof");
  formData.append("customerId", storeId);
  formData.append("file", file);
  formData.append("title", title);

  return fetch("/api/customer-attachments/upload", {
    method: "POST",
    body: formData
  });
}

function createDeliveryOwnerMessage(store: StoreRow, memo: string, status: DeliveryProof["deliveryStatus"], fileName: string) {
  const statusText = deliveryStatusLabel(status);
  const baseMemo = memo.trim() || (status === "arrived" ? "요청하신 위치에 배송 적재 완료했습니다." : status === "partial" ? "일부 품목은 현장 상황 확인 후 별도 안내드리겠습니다." : "배송 중 확인이 필요한 사항이 있어 안내드립니다.");
  const proofText = fileName ? `\n증빙자료: ${fileName}` : "";

  return `[MAJU 배송 안내]\n${store.name} ${statusText}\n${baseMemo}${proofText}`;
}

function deliveryStatusLabel(status: DeliveryProof["deliveryStatus"]) {
  if (status === "partial") return "부분배송";
  if (status === "issue") return "이슈발생";
  return "도착완료";
}

function countFiniteRoutePoints(path: RouteSequence["path"]) {
  return path.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)).length;
}

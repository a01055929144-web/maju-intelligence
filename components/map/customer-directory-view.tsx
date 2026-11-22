"use client";
// D-6 ④: 지도 파일에서 분리한 거래처 목록 보기(화면·동작 변화 0).
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Copy, Lock, Store } from "lucide-react";
import Link from "next/link";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { estimateFuelCostWon, gradeBadgeClass, type RevenueGrade } from "@/lib/route-map-utils";
import { businessStatusClass, getBusinessStatusLabel, type StoreRow } from "@/components/map/map-row-helpers";
import { FuelPriceByType } from "@/components/map/map-place-helpers";

export function CustomerDirectoryView({
  dataRegistrationHref,
  driverOptions,
  fuelPrices,
  onSelectStore,
  selectedStoreId,
  sourceReady,
  stores,
  vehicleOptions
}: {
  readonly dataRegistrationHref: string;
  readonly driverOptions: string[];
  readonly fuelPrices: FuelPriceByType;
  readonly onSelectStore: (storeId: string) => void;
  readonly selectedStoreId: string;
  readonly sourceReady: boolean;
  readonly stores: StoreRow[];
  readonly vehicleOptions: string[];
}) {
  const router = useRouter();
  const deliveryPricePerLiter = fuelPrices.diesel?.pricePerLiter || fuelPrices.gasoline?.pricePerLiter || 0;
  const gradeCounts = countGrades(stores);
  const unknownCount = stores.filter((store) => store.businessStatus === "unknown").length;
  // 2026-08-31 피드백 대응: "물류비 합계" KPI. 거래처 하나하나가 출발지에서 각자 왕복한다고
  // 가정해 전부 더하면(=지금 표의 "예산 물류비" 열을 단순 합산) 실제 배송보다 훨씬 부풀려집니다 —
  // 실제로는 배송차 한 대가 담당 거래처를 한 번의 경로로 순회합니다. 배송차별 실제 순회 경로를
  // 매번 계산하려면 배송차마다 티맵 API를 호출해야 해 비용·속도 부담이 크므로, 그 배송차가 맡은
  // 거래처 중 가장 먼 거리를 "이 배송차가 한 번 나가서 도는 왕복 거리"의 근사치로 삼습니다(가장 먼
  // 곳까지 갔다 오는 길에 나머지 거래처를 들른다고 가정 — 실제 순회 경로보다는 다소 넉넉한 편이지만,
  // 거래처별 왕복을 전부 더하는 것보다는 훨씬 현실에 가깝습니다).
  const totalLogisticsCostWon = useMemo(() => {
    const farthestDistanceByVehicle = new Map<string, number>();
    stores.forEach((store) => {
      const vehicleKey = store.deliveryVehicleName || store.deliveryDriver || `__unassigned_${store.id}`;
      const distanceKm = store.distanceKm || 0;
      const current = farthestDistanceByVehicle.get(vehicleKey) ?? 0;
      if (distanceKm > current) farthestDistanceByVehicle.set(vehicleKey, distanceKm);
    });
    let total = 0;
    farthestDistanceByVehicle.forEach((distanceKm) => {
      total += estimateFuelCostWon(distanceKm, deliveryPricePerLiter) * 2;
    });
    return total;
  }, [stores, deliveryPricePerLiter]);
  type DirectorySortKey = "businessStatus" | "deliveryDriver" | "deliveryVehicleName" | "distanceKm" | "expectedRevenue" | "grade" | "industry" | "logisticsCost" | "name";
  const [sortKey, setSortKey] = useState<DirectorySortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [showMoreDirectoryColumns, setShowMoreDirectoryColumns] = useState(false);
  function toggleSort(key: DirectorySortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }
  const gradeSortWeight: Record<string, number> = { A: 3, B: 2, C: 1 };
  // 2026-09-07 피드백("담당자 또는 배송차가 거래처를 일괄 또는 선택해서 이동할 수 있는게 필요할
  // 것 같아. 하나하나 옮기려니까 너무 힘드네") 대응: 담당자/배송차로 목록을 좁혀두면 "전체 선택"
  // 만으로 그 그룹 전체를 한 번에 고를 수 있습니다(체크박스로 부분 선택도 그대로 가능).
  const [directoryManagerFilter, setDirectoryManagerFilter] = useState("");
  const [directoryVehicleFilter, setDirectoryVehicleFilter] = useState("");
  const filteredStores = useMemo(() => {
    return stores.filter((store) => {
      if (directoryManagerFilter && (store.deliveryDriver || "") !== directoryManagerFilter) return false;
      if (directoryVehicleFilter && (store.deliveryVehicleName || "") !== directoryVehicleFilter) return false;
      return true;
    });
  }, [stores, directoryManagerFilter, directoryVehicleFilter]);
  const sortedStores = useMemo(() => {
    if (!sortKey) return filteredStores;
    const decorated = filteredStores.map((store) => ({
      logisticsCost: estimateFuelCostWon(store.distanceKm || 0, deliveryPricePerLiter) * 2,
      store
    }));
    decorated.sort((a, b) => {
      let diff = 0;
      if (sortKey === "name") diff = a.store.name.localeCompare(b.store.name, "ko");
      else if (sortKey === "industry") diff = (a.store.industry || "").localeCompare(b.store.industry || "", "ko");
      else if (sortKey === "grade") diff = (gradeSortWeight[a.store.grade] || 0) - (gradeSortWeight[b.store.grade] || 0);
      else if (sortKey === "deliveryDriver") diff = (a.store.deliveryDriver || "").localeCompare(b.store.deliveryDriver || "", "ko");
      else if (sortKey === "deliveryVehicleName") diff = (a.store.deliveryVehicleName || "").localeCompare(b.store.deliveryVehicleName || "", "ko");
      else if (sortKey === "expectedRevenue") diff = a.store.expectedRevenue - b.store.expectedRevenue;
      else if (sortKey === "distanceKm") diff = (a.store.distanceKm || 0) - (b.store.distanceKm || 0);
      else if (sortKey === "logisticsCost") diff = a.logisticsCost - b.logisticsCost;
      else if (sortKey === "businessStatus") diff = getBusinessStatusLabel(a.store.businessStatus).localeCompare(getBusinessStatusLabel(b.store.businessStatus), "ko");
      return sortDirection === "asc" ? diff : -diff;
    });
    return decorated.map((item) => item.store);
  }, [filteredStores, sortKey, sortDirection, deliveryPricePerLiter]);
  function SortableHeader({
    className = "",
    label,
    sortKeyValue,
    helpText
  }: {
    className?: string;
    label: string;
    sortKeyValue: DirectorySortKey;
    helpText?: string;
  }) {
    const isActive = sortKey === sortKeyValue;
    return (
      <th className={`border-r border-slate-200 px-4 py-3 ${className}`}>
        <span className="inline-flex items-center gap-1">
          <button
            className={`inline-flex items-center gap-1 hover:text-slate-900 ${isActive ? "text-slate-900" : ""}`}
            onClick={() => toggleSort(sortKeyValue)}
            type="button"
          >
            {label}
            {isActive ? sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 text-slate-300" />}
          </button>
          {helpText ? (
            <details className="group relative" onClick={(event) => event.stopPropagation()}>
              <summary aria-label={`${label} 설명`} className="grid h-5 w-5 cursor-pointer list-none place-items-center rounded-full text-[11px] font-black text-slate-400 hover:bg-slate-200 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">ⓘ</summary>
              <span className="absolute left-0 top-6 z-30 block w-64 rounded-lg border border-slate-200 bg-white p-3 text-left text-[11px] font-semibold leading-5 text-slate-600 shadow-xl">{helpText}</span>
            </details>
          ) : null}
        </span>
      </th>
    );
  }
  // 2026-08-27 피드백("거래처가 중복되어 있는게 있어") 대응: 상호명+주소가 동일한 거래처를 화면에서
  // 바로 찾아 병합할 수 있게 합니다. 서버에는 이미 병합 API(mergeDuplicateCustomers)가 있었지만 이를
  // 부를 UI가 없어서 사용자가 중복을 직접 발견해도 정리할 방법이 없었습니다.
  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, StoreRow[]>();
    stores.forEach((store) => {
      const key = `${store.name}`.trim().toLowerCase().replace(/\s/g, "") + "|" + `${store.address || ""}`.trim().toLowerCase().replace(/\s/g, "");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(store);
    });
    return Array.from(groups.values()).filter((group) => group.length > 1);
  }, [stores]);
  const [mergingKey, setMergingKey] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState("");
  const [pendingMergeGroup, setPendingMergeGroup] = useState<StoreRow[] | null>(null);

  // 2026-09-07 피드백("담당자 또는 배송차가 거래처를 일괄 또는 선택해서 이동할 수 있는게 필요할
  // 것 같아. 하나하나 옮기려니까 너무 힘드네") 대응: 지금까지는 거래처를 한 곳씩 열어 담당자/배송차를
  // 고쳐야 했습니다. 위 directoryManagerFilter/directoryVehicleFilter로 목록을 좁힌 뒤 "전체 선택"으로
  // 그 그룹 전체를 한 번에, 또는 체크박스로 원하는 거래처만 골라, 다른 담당자/배송차로 한 번에
  // 옮길 수 있게 합니다.
  const [selectedStoreIds, setSelectedStoreIds] = useState<Set<string>>(new Set());
  const [bulkTargetManager, setBulkTargetManager] = useState("");
  const [bulkTargetVehicle, setBulkTargetVehicle] = useState("");
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkError, setBulkError] = useState("");

  function toggleSelectStore(storeId: string) {
    setSelectedStoreIds((current) => {
      const next = new Set(current);
      if (next.has(storeId)) next.delete(storeId);
      else next.add(storeId);
      return next;
    });
  }

  async function runBulkReassign() {
    const targetManager = bulkTargetManager.trim();
    const targetVehicle = bulkTargetVehicle.trim();
    const customerIds = Array.from(selectedStoreIds);
    if (!customerIds.length || (!targetManager && !targetVehicle)) return;
    setBulkApplying(true);
    setBulkError("");
    setBulkMessage("");
    try {
      const companyId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("companyId") : null;
      if (targetManager) {
        const response = await fetch("/api/customers/bulk-manager", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId: companyId || undefined, customerIds, deliveryManager: targetManager })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || "담당자 일괄 변경에 실패했습니다.");
      }
      if (targetVehicle) {
        const response = await fetch("/api/customers/bulk-vehicle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId: companyId || undefined, customerIds, deliveryVehicle: targetVehicle })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || "배송차 일괄 변경에 실패했습니다.");
      }
      setBulkMessage(`${customerIds.length.toLocaleString()}곳을 이동했습니다.`);
      setSelectedStoreIds(new Set());
      setBulkTargetManager("");
      setBulkTargetVehicle("");
      router.refresh();
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : "일괄 이동에 실패했습니다.");
    } finally {
      setBulkApplying(false);
    }
  }

  function completenessScore(store: StoreRow) {
    return [store.businessRegistrationNumber, store.deliveryDriver, store.deliveryVehicleName, store.phone, store.representativeName, store.accessMethodType, store.loadingPosition].filter(
      Boolean
    ).length;
  }

  async function runMerge(group: StoreRow[]) {
    const sorted = [...group].sort((a, b) => completenessScore(b) - completenessScore(a));
    const primary = sorted[0];
    const duplicates = sorted.slice(1);
    const groupKey = group.map((store) => store.id).join(",");
    setMergingKey(groupKey);
    setMergeError("");
    try {
      const companyId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("companyId") : null;
      const response = await fetch("/api/customers/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: companyId || undefined,
          primaryCustomerId: primary.id,
          duplicateCustomerIds: duplicates.map((store) => store.id)
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "중복 거래처 병합에 실패했습니다.");
      setPendingMergeGroup(null);
      router.refresh();
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : "중복 거래처 병합에 실패했습니다.");
    } finally {
      setMergingKey(null);
    }
  }

  return (
    <section className="flex min-h-[480px] flex-1 flex-col overflow-visible rounded-b-xl bg-[#f6f8fb] p-4 pb-6">
      <div className="grid shrink-0 gap-3 lg:grid-cols-3">
        <DirectoryStat label="거래처" value={`${stores.length}곳`} />
        <DirectoryStat label="A등급" value={`${gradeCounts.A}곳`} />
        <DirectoryStat
          label="물류비 합계"
          title="배송차별로, 그 배송차가 맡은 거래처 중 가장 먼 곳까지의 왕복 유류비를 더한 값입니다(참고용 추정치). 거래처 각각의 왕복을 단순 합산하지 않고 배송차 한 대가 한 번에 순회한다고 가정합니다."
          value={`${Math.round(totalLogisticsCostWon / 10000).toLocaleString()}만원`}
        />
      </div>

      {sourceReady && duplicateGroups.length ? (
        <div className="mt-3 flex shrink-0 flex-col gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Copy className="h-4 w-4 shrink-0 text-rose-700" />
            <p className="text-xs font-bold leading-5 text-rose-900">
              상호명·주소가 같은 중복 의심 거래처가 <span className="font-black">{duplicateGroups.length}건</span> 있습니다. 매출·거래내역이 나뉘어
              집계될 수 있어 병합을 권장합니다.
            </p>
          </div>
          {mergeError ? <p className="text-xs font-bold text-rose-700">{mergeError}</p> : null}
          <div className="flex flex-col gap-2">
            {duplicateGroups.map((group) => {
              const groupKey = group.map((store) => store.id).join(",");
              const sorted = [...group].sort((a, b) => completenessScore(b) - completenessScore(a));
              return (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-100 bg-white px-3 py-2" key={groupKey}>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-slate-950">{sorted[0].name}</p>
                    <p className="truncate text-[11px] font-bold text-slate-500">
                      {sorted[0].address || sorted[0].region} · {group.length}건 중복 · 기준 레코드는 자동으로 정보가 더 많은 쪽을 선택합니다
                    </p>
                  </div>
                  <button
                    className="maju-button-secondary h-8 shrink-0 px-3 text-[11px]"
                    disabled={mergingKey === groupKey}
                    onClick={() => setPendingMergeGroup(group)}
                    type="button"
                  >
                    {mergingKey === groupKey ? "병합 중..." : "병합"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {sourceReady && unknownCount ? (
        <div className="mt-3 flex shrink-0 items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
          <p className="text-xs font-bold leading-5 text-amber-900">
            사업자 상태가 아직 확인되지 않은 거래처가 <span className="font-black">{unknownCount}곳</span> 있습니다. 아래 목록에서 거래처를 눌러 상세
            패널의 &quot;사업자 상태 조회&quot;를 실행하세요.
          </p>
        </div>
      ) : null}

      {/* 2026-09-07 피드백("담당자 또는 배송차가 거래처를 일괄 또는 선택해서 이동할 수 있는게
          필요할 것 같아. 하나하나 옮기려니까 너무 힘드네"): 담당자/배송차로 목록을 좁힌 뒤 "전체
          선택"으로 그 그룹 전체를, 또는 표의 체크박스로 원하는 거래처만 골라 다른 담당자·배송차로
          한 번에 옮길 수 있습니다. */}
      {sourceReady && stores.length ? (
        <div className="mt-3 flex shrink-0 flex-col gap-2.5 rounded-lg border border-teal-200 bg-teal-50/60 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="shrink-0 text-xs font-black text-teal-900">담당자/배송차 일괄 이동</p>
            <select
              className="h-8 rounded-md border border-teal-200 bg-white px-2 text-xs font-bold text-slate-900 outline-none focus:border-teal-400"
              onChange={(event) => setDirectoryManagerFilter(event.target.value)}
              value={directoryManagerFilter}
            >
              <option value="">담당자 전체</option>
              {driverOptions.map((driver) => (
                <option key={driver} value={driver}>
                  {driver}
                </option>
              ))}
            </select>
            <select
              className="h-8 rounded-md border border-teal-200 bg-white px-2 text-xs font-bold text-slate-900 outline-none focus:border-teal-400"
              onChange={(event) => setDirectoryVehicleFilter(event.target.value)}
              value={directoryVehicleFilter}
            >
              <option value="">배송차 전체</option>
              {vehicleOptions.map((vehicle) => (
                <option key={vehicle} value={vehicle}>
                  {vehicle}
                </option>
              ))}
            </select>
            <button
              className="maju-button-secondary h-8 shrink-0 px-3 text-[11px]"
              onClick={() => {
                const allVisibleSelected = sortedStores.length > 0 && sortedStores.every((store) => selectedStoreIds.has(store.id));
                setSelectedStoreIds(allVisibleSelected ? new Set() : new Set(sortedStores.map((store) => store.id)));
              }}
              type="button"
            >
              {sortedStores.length > 0 && sortedStores.every((store) => selectedStoreIds.has(store.id)) ? "전체 해제" : `보이는 ${sortedStores.length.toLocaleString()}곳 전체 선택`}
            </button>
            {selectedStoreIds.size ? <span className="text-xs font-black text-teal-900">{selectedStoreIds.size.toLocaleString()}곳 선택됨</span> : null}
          </div>
          {selectedStoreIds.size ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-teal-200 pt-2.5">
              <span className="shrink-0 text-xs font-bold text-teal-900">이동할 곳:</span>
              <select
                className="h-8 rounded-md border border-teal-200 bg-white px-2 text-xs font-bold text-slate-900 outline-none focus:border-teal-400"
                onChange={(event) => setBulkTargetManager(event.target.value)}
                value={bulkTargetManager}
              >
                <option value="">담당자 변경 안 함</option>
                {driverOptions.map((driver) => (
                  <option key={driver} value={driver}>
                    {driver}
                  </option>
                ))}
              </select>
              <select
                className="h-8 rounded-md border border-teal-200 bg-white px-2 text-xs font-bold text-slate-900 outline-none focus:border-teal-400"
                onChange={(event) => setBulkTargetVehicle(event.target.value)}
                value={bulkTargetVehicle}
              >
                <option value="">배송차 변경 안 함</option>
                {vehicleOptions.map((vehicle) => (
                  <option key={vehicle} value={vehicle}>
                    {vehicle}
                  </option>
                ))}
              </select>
              <button
                className="maju-button-primary h-8 shrink-0 px-3 text-[11px] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={bulkApplying || (!bulkTargetManager.trim() && !bulkTargetVehicle.trim())}
                onClick={runBulkReassign}
                type="button"
              >
                {bulkApplying ? "이동 중..." : `${selectedStoreIds.size.toLocaleString()}곳 이동`}
              </button>
              <button
                className="maju-button-secondary h-8 shrink-0 px-3 text-[11px]"
                disabled={bulkApplying}
                onClick={() => {
                  setSelectedStoreIds(new Set());
                  setBulkTargetManager("");
                  setBulkTargetVehicle("");
                }}
                type="button"
              >
                선택 해제
              </button>
            </div>
          ) : null}
          {bulkError ? <p className="text-xs font-bold text-rose-700">{bulkError}</p> : null}
          {bulkMessage ? <p className="text-xs font-bold text-emerald-700">{bulkMessage}</p> : null}
        </div>
      ) : null}

      <div className="maju-section-card mt-4 !overflow-visible">
        {sourceReady && stores.length ? (
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
            <p className="text-xs font-semibold text-slate-500">기본 화면은 업무에 필요한 핵심 정보만 표시합니다.</p>
            <button className="maju-button-secondary h-8 px-3 text-xs" onClick={() => setShowMoreDirectoryColumns((current) => !current)} type="button">
              {showMoreDirectoryColumns ? "핵심 컬럼만" : "컬럼 더보기"}
            </button>
          </div>
        ) : null}
        {!sourceReady ? (
          <OperationalEmptyState
            actionHref={dataRegistrationHref}
            actionLabel="거래처 등록"
            description="사업자번호, 주소, 담당자, 매출등급을 등록하세요."
            title="거래처 원장 필요"
          />
        ) : null}
        {sourceReady ? (
          stores.length ? (
            <div className="overflow-x-auto">
              <table className={`w-full border-separate border-spacing-0 text-left text-sm ${showMoreDirectoryColumns ? "min-w-[1520px]" : "min-w-[760px]"}`}>
                <thead className="sticky top-0 z-10 bg-slate-50/95 text-xs font-black text-slate-500 shadow-[0_1px_0_#e2e8f0] backdrop-blur">
                  <tr>
                    <th className="w-[36px] border-r border-slate-200 px-3 py-3">
                      <input
                        aria-label="현재 보이는 거래처 전체 선택"
                        checked={sortedStores.length > 0 && sortedStores.every((store) => selectedStoreIds.has(store.id))}
                        className="h-3.5 w-3.5 accent-teal-700"
                        onChange={() => {
                          const allVisibleSelected = sortedStores.length > 0 && sortedStores.every((store) => selectedStoreIds.has(store.id));
                          setSelectedStoreIds(allVisibleSelected ? new Set() : new Set(sortedStores.map((store) => store.id)));
                        }}
                        type="checkbox"
                      />
                    </th>
                    <SortableHeader className="w-[28%]" label="거래처" sortKeyValue="name" />
                    {showMoreDirectoryColumns ? <SortableHeader className="w-[96px]" label="업종" sortKeyValue="industry" /> : null}
                    <SortableHeader className="w-[96px]" helpText="거래처의 매출 규모와 중요도를 기준으로 관리하는 등급입니다." label="매출등급" sortKeyValue="grade" />
                    <SortableHeader className="w-[130px]" label="담당자" sortKeyValue="deliveryDriver" />
                    {showMoreDirectoryColumns ? <SortableHeader
                      className="w-[130px]"
                      helpText="담당자와 배송차는 독립적으로 지정할 수 있으며 같은 배송차를 여러 담당자가 나눠 쓰는 경우도 포함합니다. 지도 필터는 이 값을 기준으로 동작합니다."
                      label="배송차"
                      sortKeyValue="deliveryVehicleName"
                    /> : null}
                    {showMoreDirectoryColumns ? <SortableHeader className="w-[120px] text-right" label="예상매출" sortKeyValue="expectedRevenue" /> : null}
                    {showMoreDirectoryColumns ? <SortableHeader className="w-[120px] text-right" label="출발지 거리" sortKeyValue="distanceKm" /> : null}
                    {showMoreDirectoryColumns ? <SortableHeader
                      className="w-[150px] text-right"
                      helpText="출발지에서 이 거래처까지 왕복했을 때의 예상 유류비로, 참고용 추정치입니다."
                      label="예산 물류비"
                      sortKeyValue="logisticsCost"
                    /> : null}
                    <SortableHeader className="w-[120px]" label="사업자 상태" sortKeyValue="businessStatus" />
                    {showMoreDirectoryColumns ? <th className="w-[110px] border-r border-slate-200 px-4 py-3">출입 방법</th> : null}
                    {showMoreDirectoryColumns ? <th
                      className="w-[90px] border-r border-slate-200 px-4 py-3"
                      title="보안을 위해 실제 비밀번호 값은 목록에 노출하지 않습니다. 거래처를 눌러 상세 패널에서 확인하세요."
                    >
                      비밀번호
                    </th> : null}
                    {showMoreDirectoryColumns ? <th className="w-[150px] px-4 py-3">적재 위치</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedStores.map((store) => (
                    <tr
                      data-selected={store.id === selectedStoreId ? "true" : "false"}
                      className={`cursor-pointer transition hover:bg-slate-50 ${store.id === selectedStoreId ? "bg-teal-50/70 shadow-[inset_3px_0_0_#0f766e]" : "bg-white"}`}
                      key={store.id}
                      onClick={() => onSelectStore(store.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") onSelectStore(store.id);
                      }}
                    >
                      <td className="border-r border-slate-100 px-3 py-3" onClick={(event) => event.stopPropagation()}>
                        <input
                          aria-label={`${store.name} 선택`}
                          checked={selectedStoreIds.has(store.id)}
                          className="h-3.5 w-3.5 accent-teal-700"
                          onChange={() => toggleSelectStore(store.id)}
                          type="checkbox"
                        />
                      </td>
                      <td className="min-w-0 border-r border-slate-100 px-4 py-3">
                        <p className="truncate font-black text-slate-950">{store.name}</p>
                        <p className="mt-1 truncate text-xs font-bold text-slate-500">{store.address || store.region}</p>
                      </td>
                      {showMoreDirectoryColumns ? <td className="max-w-[96px] truncate border-r border-slate-100 px-4 py-3 font-bold text-slate-500">{store.industry || "미분류"}</td> : null}
                      <td className="border-r border-slate-100 px-4 py-3">
                        <span className={gradeBadgeClass(store.grade)}>{store.grade}</span>
                      </td>
                      <td className="max-w-[130px] truncate border-r border-slate-100 px-4 py-3 font-bold text-slate-700">{store.deliveryDriver || "미지정"}</td>
                      {showMoreDirectoryColumns ? <td className="max-w-[130px] truncate border-r border-slate-100 px-4 py-3 font-bold text-slate-700">{store.deliveryVehicleName || "미지정"}</td> : null}
                      {showMoreDirectoryColumns ? <td className="border-r border-slate-100 px-4 py-3 text-right font-black text-slate-950">{store.expectedRevenue.toLocaleString()}만원</td> : null}
                      {showMoreDirectoryColumns ? <td className="border-r border-slate-100 px-4 py-3 text-right font-bold text-slate-500">{store.distanceKm?.toLocaleString() || "-"}km</td> : null}
                      {showMoreDirectoryColumns ? <td className="border-r border-slate-100 px-4 py-3 text-right font-bold text-slate-500">
                        {(() => {
                          const roundTripCost = estimateFuelCostWon(store.distanceKm || 0, deliveryPricePerLiter) * 2;
                          return roundTripCost ? `왕복 ${roundTripCost.toLocaleString()}원` : <span className="text-slate-400">확인 필요</span>;
                        })()}
                      </td> : null}
                      <td className="border-r border-slate-100 px-4 py-3">
                        <span className={businessStatusClass(store.businessStatus)}>{getBusinessStatusLabel(store.businessStatus)}</span>
                        {store.relationshipStatus === "거래종료" ? (
                          <span className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-black text-slate-700">거래 종료</span>
                        ) : null}
                      </td>
                      {showMoreDirectoryColumns ? <td className="max-w-[110px] truncate border-r border-slate-100 px-4 py-3 font-bold text-slate-500">{store.accessMethodType || "미등록"}</td> : null}
                      {showMoreDirectoryColumns ? <td className="border-r border-slate-100 px-4 py-3">
                        {store.hasAccessPassword ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700">
                            <Lock className="h-3 w-3" /> 등록됨
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">미등록</span>
                        )}
                      </td> : null}
                      {showMoreDirectoryColumns ? <td className="max-w-[150px] truncate px-4 py-3 font-bold text-slate-500">{store.loadingPosition || "미등록"}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <OperationalEmptyState
              actionHref={dataRegistrationHref}
              actionLabel="거래처 관리 확인"
              description="필터를 초기화하거나 거래처 값을 확인하세요."
              title="조건에 맞는 거래처 없음"
            />
          )
        ) : null}
      </div>

      {pendingMergeGroup ? (
        <ConfirmDialog
          confirmLabel="병합"
          message={`"${pendingMergeGroup[0].name}" ${pendingMergeGroup.length}건을 하나로 병합합니다. 정보가 더 많은 레코드를 기준으로 남기고 나머지는 거래내역·메모·첨부자료를 옮긴 뒤 삭제합니다. 되돌릴 수 없습니다.`}
          onCancel={() => setPendingMergeGroup(null)}
          onConfirm={() => runMerge(pendingMergeGroup)}
          title="중복 거래처 병합"
        />
      ) : null}
    </section>
  );
}

export function DirectoryStat({
  active = false,
  label,
  onClick,
  title,
  tone = "slate",
  value
}: {
  readonly active?: boolean;
  readonly label: string;
  readonly onClick?: () => void;
  readonly title?: string;
  readonly tone?: "rose" | "slate";
  readonly value: string;
}) {
  const content = (
    <>
      <p className="maju-muted-label">{label}</p>
      <p className={`mt-1 text-[24px] font-black leading-none ${tone === "rose" ? "text-rose-600" : "text-slate-950"}`}>{value}</p>
    </>
  );
  // 2026-09-01 피드백: "해당 카드를 누르면, 아래 거래처들이 필터가 되면 좋을 것 같아" — KPI 카드를
  // 눌러 바로 아래 목록을 그 조건으로 필터링할 수 있게 클릭 가능한 버튼 형태를 추가로 지원합니다.
  if (onClick) {
    return (
      <button
        className={`maju-stat-card w-full px-4 py-3 text-left transition hover:border-teal-300 hover:shadow-sm ${
          active ? "border-teal-400 ring-1 ring-inset ring-teal-300" : ""
        }`}
        onClick={onClick}
        title={title}
        type="button"
      >
        {content}
      </button>
    );
  }
  return (
    <div className="maju-stat-card px-4 py-3" title={title}>
      {content}
    </div>
  );
}

export function OperationalEmptyState({
  actionHref,
  actionLabel,
  description,
  title
}: {
  readonly actionHref: string;
  readonly actionLabel: string;
  readonly description: string;
  readonly title: string;
}) {
  return (
    <div className="grid h-full min-h-[520px] place-items-center px-4 text-center">
      <div className="max-w-xl rounded-xl border border-dashed border-teal-200 bg-teal-50/60 px-4 py-8 shadow-[0_8px_22px_rgba(15,118,110,0.08)]">
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-white text-teal-700 shadow-sm ring-1 ring-inset ring-teal-100">
          <Store className="h-5 w-5" />
        </div>
        <h3 className="mt-4 text-lg font-black text-slate-950">{title}</h3>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-600">{description}</p>
        <Link className="maju-button-primary mt-5 h-10 px-4 text-sm" href={actionHref}>
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}

export function countGrades(stores: StoreRow[]) {
  return stores.reduce(
    (counts, store) => ({
      ...counts,
      [store.grade]: counts[store.grade] + 1
    }),
    { A: 0, B: 0, C: 0 } as Record<RevenueGrade, number>
  );
}

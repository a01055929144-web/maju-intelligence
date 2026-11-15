"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Loader2,
  Navigation,
  PanelRightClose,
  PanelRightOpen,
  Radar,
  Store,
  ArrowLeft,
} from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { MapLeadChannelIcons, resolvePlaceUrls } from "@/components/map-lead-channel-icons";
import { MapListRow } from "@/components/map/map-list-row";
import { LIST_CHUNK, visibleCount } from "@/domains/route/list-chunk";
import {
  getPermitLeadOpenDate,
} from "@/domains/lead/map-filters";
import { getMapLeadReminderLabel, runMapLeadStageBulk } from "@/lib/map-lead-workflow";
import type {
  PermitLeadItem,
} from "@/lib/store";
import { LEAD_STAGE_OPTIONS, toLeadStageValue } from "@/domains/lead/lead-status";
import { formatStoreAreaPyeong } from "@/domains/lead/store-area";
import {
  formatDistanceKmLabel,
  formatMinutes,
  gradeBadgeClass,
} from "@/lib/route-map-utils";
import { businessStatusClass, getBusinessStatusLabel, getLeadConfidence, LEAD_STORE_AREA_FEATURE_ENABLED, permitGradeToneClassName, type StoreRow } from "@/components/map/map-row-helpers";
import { LEAD_LIST_SORT_OPTIONS, sortLeadList, type LeadListSortKey } from "@/components/map/lead-list-sort";

export function StoreManagementPanel({
  collapsed,
  notice,
  dataRegistrationHref,
  distanceRecalcError,
  onEditStore,
  onRecalculateDistances,
  onSelectStore,
  onClearFilter,
  onToggleCollapsed,
  recalculatingDistances,
  selectedStoreId,
  sourceReady,
  stores,
  tabs,
  title
}: {
  readonly collapsed: boolean;
  /** 목록 맨 위 한 줄 안내(거래처 수·위치 못 찾음·추정). 없으면 안 그림. */
  readonly notice?: ReactNode;
  readonly dataRegistrationHref: string;
  readonly distanceRecalcError: string;
  readonly onEditStore: (storeId: string) => void;
  readonly onRecalculateDistances: (missingStores: StoreRow[]) => Promise<{ ok: boolean; message?: string }>;
  readonly onSelectStore: (storeId: string) => void;
  readonly onClearFilter?: () => void;
  readonly onToggleCollapsed: () => void;
  readonly recalculatingDistances: boolean;
  readonly selectedStoreId: string;
  readonly sourceReady: boolean;
  readonly stores: StoreRow[];
  /** 시안 ⑫: 신규·영업·거래처 탭. 있으면 제목 줄 대신 얇은 요약 줄 + 탭 순서로 보여줍니다. */
  readonly tabs?: ReactNode;
  readonly title: string;
}) {
  const storesMissingDistance = stores.filter((store) => !store.distanceKm && store.address);
  // 2026-08-31 피드백("지도 마커를 클릭하면 우측 패널도 동일한 상호명이 나오도록") 대응: 마커를
  // 클릭하면 selectedStoreId는 바뀌어 강조 스타일(bg-teal-50)은 적용되지만, 그 항목이 이미 스크롤
  // 밖에 있으면 화면에는 안 보여서 "우측 패널이 안 맞다"고 느껴집니다. 선택된 항목의 DOM을 ref로
  // 잡아두고 selectedStoreId가 바뀔 때마다 목록 스크롤을 그 항목으로 자동 이동시킵니다.
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // 목록 나눠 그리기: LIST_CHUNK줄씩, 선택한 줄까지는 항상 그린다.
  const [storeLimit, setStoreLimit] = useState(LIST_CHUNK);
  const storeShown = visibleCount(storeLimit, stores.length, stores.findIndex((store) => store.id === selectedStoreId));
  useEffect(() => {
    if (!selectedStoreId) return;
    itemRefs.current[selectedStoreId]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedStoreId]);
  if (collapsed) {
    return (
      <aside className="flex min-h-0 items-center justify-center gap-1.5 border-l border-slate-200/80 bg-white px-1.5 py-2">
        <button
          aria-label="거래처 목록 패널 펼치기"
          className="maju-button-secondary h-8 w-8 shrink-0 px-0"
          onClick={onToggleCollapsed}
          type="button"
        >
          <PanelRightOpen className="h-3.5 w-3.5" />
        </button>
        <span className="relative inline-flex shrink-0" title={title}>
          <Store className="h-4 w-4 text-slate-500" />
          <span className="absolute -right-2 -top-2 grid h-4 min-w-[16px] place-items-center rounded-full bg-teal-700 px-1 text-xs font-black leading-none text-white">
            {stores.length}
          </span>
        </span>
      </aside>
    );
  }

  return (
    <aside className="h-full min-h-0 border-l border-slate-200/80 bg-white">
      <div className="flex h-full min-h-0 flex-col">
        {tabs ? (
          <>
            {tabs}
            <div className="flex shrink-0 items-center gap-2 whitespace-nowrap border-b border-slate-100 bg-slate-50 px-3 py-2 text-[13px]">
              <span className="min-w-0 truncate font-bold text-slate-900">{title}</span>
              <span className="shrink-0 text-xs text-slate-400">{stores.length.toLocaleString()}곳</span>
              {onClearFilter ? (
                <button className="ml-auto h-7 shrink-0 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 hover:bg-slate-50" onClick={onClearFilter} title="담당자 선택을 풀고 전체 거래처 보기" type="button">
                  전체 보기
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 bg-slate-50 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-950">{title}</p>
              <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">목록 {stores.length.toLocaleString()}곳</p>
            </div>
            {onClearFilter ? (
              <button className="maju-button-secondary ml-auto h-8 shrink-0 px-2 text-xs" onClick={onClearFilter} title="담당자 선택을 풀고 전체 거래처 보기" type="button">
                <ArrowLeft className="h-3.5 w-3.5" />
                전체 보기
              </button>
            ) : null}
            <button
              aria-label="거래처 목록 패널 접기"
              className="maju-button-secondary h-8 w-8 shrink-0 px-0"
              onClick={onToggleCollapsed}
              type="button"
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          </div>
        )}
        {storesMissingDistance.length > 0 ? (
          <div className="shrink-0 border-b border-slate-200/80 bg-amber-50 px-3 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold leading-4 text-amber-800">거리 미계산 {storesMissingDistance.length}곳</p>
              <button
                className="maju-button-secondary h-7 shrink-0 px-2 text-[11px] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={recalculatingDistances}
                onClick={() => void onRecalculateDistances(storesMissingDistance)}
                type="button"
              >
                {recalculatingDistances ? <Loader2 className="h-3 w-3 animate-spin" /> : <Navigation className="h-3 w-3" />}
                거리 계산
              </button>
            </div>
            {distanceRecalcError ? <p className="mt-1 text-[11px] font-bold leading-4 text-rose-600">{distanceRecalcError}</p> : null}
          </div>
        ) : null}
        <div className="max-h-[calc(100vh-260px)] min-h-0 flex-1 overflow-auto xl:max-h-none">
          {notice}
          {stores.length ? (
            <>
              {stores.slice(0, storeShown).map((store, storeIndex) => (
                <MapListRow
                  badges={
                    <>
                      <span className={gradeBadgeClass(store.grade)}>{store.grade}</span>
                      <span className={businessStatusClass(store.businessStatus)}>{getBusinessStatusLabel(store.businessStatus)}</span>
                    </>
                  }
                  editLabel={`${store.name} 상세 편집`}
                  index={storeIndex}
                  itemRef={(el) => {
                    itemRefs.current[store.id] = el;
                  }}
                  key={store.id}
                  name={store.name}
                  nameTitle={store.address || store.region}
                  onEdit={() => onEditStore(store.id)}
                  onSelect={() => onSelectStore(store.id)}
                  selected={store.id === selectedStoreId}
                  subText={<>{store.address || store.region}<span className="text-slate-400"> · {formatDistanceKmLabel(store.distanceKm)} · {formatMinutes(store.durationMinutes || 0)} · {store.expectedRevenue.toLocaleString()}만원</span></>}
                  total={stores.length}
                />
              ))}
              {storeShown < stores.length ? (
                <button className="maju-button-secondary m-2 h-9 w-[calc(100%-1rem)] justify-center text-xs" onClick={() => setStoreLimit(storeShown + LIST_CHUNK)} type="button">더 보기 ({(stores.length - storeShown).toLocaleString()}곳 남음)</button>
              ) : null}
            </>
          ) : (
            <div className="grid h-full min-h-[180px] place-items-center px-4">
              <EmptyState
                action={!sourceReady ? <Link className="maju-button-primary h-8" href={dataRegistrationHref}>거래처 등록하기</Link> : undefined}
                bare
                description={sourceReady ? "등급 필터나 검색어를 조정해 주세요." : "거래처를 먼저 등록하면 담당자별 거래처 목록이 표시됩니다."}
                message={sourceReady ? "조건에 맞는 거래처가 없습니다." : "등록된 운영 거래처가 없습니다."}
              />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

/** 2026-08-30 피드백("우측 패널 전체거래처는 거래처,리드목록 구별을 해야함") 대응: StoreManagementPanel과
 * 같은 레이아웃으로 신규 리드 목록을 보여줍니다. 클릭하면 previewLeadId가 바뀌어 지도 카드가 열리고
 * (신규 리드 클릭 시 지도 포커스 버그 수정과 같은 focusedMarkerId 경로를 그대로 씁니다), 우선순위·안정도는
 * 이미 카드에도 쓰는 getLeadConfidence 점수를 그대로 재사용합니다(새 산정 로직 없음). */
export function LeadListPanel({
  collapsed,
  leads,
  loadState,
  onSelectLead,
  onOpenDetail,
  onRetry,
  onOpenTable,
  onToggleCollapsed,
  onUpdateStage,
  selectedLeadId,
  tabs,
  title
}: {
  readonly collapsed: boolean;
  readonly leads: Array<PermitLeadItem & { distanceKm?: number }>;
  readonly loadState: "idle" | "loading" | "ready" | "error";
  readonly onSelectLead: (leadId: string) => void;
  readonly onOpenDetail: (leadId: string) => void;
  readonly onRetry: () => void;
  readonly onOpenTable: () => void;
  readonly onToggleCollapsed: () => void;
  readonly onUpdateStage: (leadId: string, status: string, memo?: string) => Promise<{ ok: boolean; message?: string }>;
  readonly selectedLeadId: string;
  /** 시안 ⑫: 일괄 변경 줄 아래에 놓을 "신규 · 영업 · 거래처" 탭. 있으면 제목 줄을 생략합니다. */
  readonly tabs?: ReactNode;
  readonly title: string;
}) {
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [bulkStage, setBulkStage] = useState("");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  // 대표 요청(10-29): 상호명·업종·개업일·등급 오름차순/내림차순 정렬. "기본"은 지도 필터 결과 순서.
  const [sortKey, setSortKey] = useState<LeadListSortKey>("default");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const sortedLeads = useMemo(() => sortLeadList(leads, sortKey, sortDirection), [leads, sortKey, sortDirection]);
  const [leadLimit, setLeadLimit] = useState(LIST_CHUNK);
  const leadShown = visibleCount(leadLimit, sortedLeads.length, sortedLeads.findIndex((lead) => lead.id === selectedLeadId));
  // 2026-08-31 피드백 대응: StoreManagementPanel과 동일하게, 마커 클릭으로 selectedLeadId가
  // 바뀌면 그 리드 항목이 스크롤 밖에 있어도 자동으로 보이도록 스크롤합니다.
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => {
    if (!selectedLeadId) return;
    itemRefs.current[selectedLeadId]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedLeadId]);
  useEffect(() => {
    const visibleIds = new Set(leads.map((lead) => lead.id));
    setSelectedLeadIds((current) => new Set(Array.from(current).filter((id) => visibleIds.has(id))));
  }, [leads]);

  const allSelected = leads.length > 0 && selectedLeadIds.size === leads.length;
  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeadIds((current) => {
      const next = new Set(current);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };
  const applyBulkStage = async () => {
    if (!bulkStage || !selectedLeadIds.size) return;
    setBulkBusy(true);
    setBulkMessage("");
    const results = await runMapLeadStageBulk(
      Array.from(selectedLeadIds),
      (leadId) => onUpdateStage(leadId, bulkStage, bulkReason || undefined),
      4
    );
    const failed = results.filter((result) => !result.ok);
    const succeeded = results.length - failed.length;
    setBulkMessage(failed.length ? `${succeeded}곳 변경 · ${failed.length}곳 실패` : `${succeeded}곳 단계를 변경했습니다.`);
    setSelectedLeadIds(new Set(failed.map((result) => result.leadId)));
    setRowErrors(Object.fromEntries(failed.map((result) => [result.leadId, result.message || "단계 변경에 실패했습니다."])));
    setBulkBusy(false);
  };
  if (collapsed) {
    return (
      <aside className="flex min-h-0 items-center justify-center gap-1.5 border-l border-slate-200/80 bg-white px-1.5 py-2">
        <button
          aria-label="리드 목록 패널 펼치기"
          className="maju-button-secondary h-8 w-8 shrink-0 px-0"
          onClick={onToggleCollapsed}
          type="button"
        >
          <PanelRightOpen className="h-3.5 w-3.5" />
        </button>
        <span className="relative inline-flex shrink-0" title={title}>
          <Radar className="h-4 w-4 text-teal-700" />
          <span className="absolute -right-2 -top-2 grid h-4 min-w-[16px] place-items-center rounded-full bg-teal-700 px-1 text-xs font-black leading-none text-white">
            {leads.length}
          </span>
        </span>
      </aside>
    );
  }

  return (
    <aside className="h-full min-h-0 bg-white">
      <div className="flex h-full min-h-0 flex-col">
        {tabs ? null : (
          <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 bg-slate-50 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-950">{title}</p>
              <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">목록 {leads.length.toLocaleString()}곳</p>
            </div>
            <button
              aria-label="리드 목록 패널 접기"
              className="maju-button-secondary h-8 w-8 shrink-0 px-0"
              onClick={onToggleCollapsed}
              type="button"
            >
              <PanelRightClose className="h-4 w-4" />
            </button>
          </div>
        )}
        {tabs}
        <div className="flex shrink-0 flex-col gap-1.5 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[13px]">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
              <input
                checked={allSelected}
                className="h-[18px] w-[18px] rounded border-slate-300 text-teal-700"
                onChange={() => setSelectedLeadIds(allSelected ? new Set() : new Set(leads.map((lead) => lead.id)))}
                type="checkbox"
              />
              전체
            </label>
            <span className="min-w-0 truncate text-slate-500">{selectedLeadIds.size ? `${selectedLeadIds.size.toLocaleString()}곳 선택` : "선택 없음"}</span>
            <span className="shrink-0 text-xs text-slate-400">· {leads.length.toLocaleString()}곳</span>
            <span className="ml-auto flex shrink-0 items-center gap-1">
              <select
                aria-label="정렬 기준"
                className="h-7 rounded-md border border-slate-300 bg-white px-1.5 text-xs text-slate-700"
                onChange={(event) => setSortKey(event.target.value as LeadListSortKey)}
                value={sortKey}
              >
                {LEAD_LIST_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <button
                aria-label={sortDirection === "asc" ? "오름차순 (누르면 내림차순)" : "내림차순 (누르면 오름차순)"}
                className="grid h-7 w-7 place-items-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                disabled={sortKey === "default"}
                onClick={() => setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"))}
                title={sortDirection === "asc" ? "오름차순" : "내림차순"}
                type="button"
              >
                {sortDirection === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
              </button>
            </span>
          </div>
          {selectedLeadIds.size ? (
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-1.5">
              <select aria-label="바꿀 단계" className="h-8 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs" onChange={(event) => setBulkStage(event.target.value)} value={bulkStage}>
                <option value="">단계 바꾸기</option>
                {LEAD_STAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select aria-label="변경 사유" className="h-8 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs" onChange={(event) => setBulkReason(event.target.value)} value={bulkReason}>
                <option value="">사유</option>
                {["단가 안 맞음", "기존 거래처 유지", "폐업", "이전", "미수", "결제 문제", "기타"].map((reason) => <option key={reason}>{reason}</option>)}
              </select>
              <button className="h-8 shrink-0 whitespace-nowrap rounded-md bg-teal-700 px-3 text-xs font-bold text-white disabled:opacity-50" disabled={!bulkStage || bulkBusy} onClick={() => void applyBulkStage()} type="button">
                {bulkBusy ? "변경 중" : "적용"}
              </button>
            </div>
          ) : null}
          {bulkMessage ? <p className="text-[11px] font-bold text-slate-600" role="status">{bulkMessage}</p> : null}
        </div>
        <div className="max-h-[calc(100vh-260px)] min-h-0 flex-1 overflow-auto xl:max-h-none">
          {sortedLeads.length ? (
            <>
              {sortedLeads.slice(0, leadShown).map((lead, leadIndex) => {
                const confidence = getLeadConfidence(lead);
                const openDate = getPermitLeadOpenDate(lead);
                const reminder = getMapLeadReminderLabel(lead);
                const openDateShort = openDate ? openDate.slice(5).replace("-", "/") : "";
                const openDays = openDate ? Math.floor((Date.now() - new Date(`${openDate}T00:00:00+09:00`).getTime()) / 86_400_000) : null;
                const openDateBadge = openDateShort ? `개업 ${openDateShort}${openDays !== null && openDays >= 0 ? ` · D+${openDays}` : ""}` : "";
                const storeAreaLabel = LEAD_STORE_AREA_FEATURE_ENABLED ? formatStoreAreaPyeong(lead.storeAreaSqm) : undefined;
                const rating = typeof lead.rating === "number" || typeof lead.reviewCount === "number"
                  ? `★ ${typeof lead.rating === "number" ? lead.rating.toFixed(1) : "-"}${typeof lead.reviewCount === "number" ? ` · ${lead.reviewCount.toLocaleString()}` : ""}`
                  : "";
                const subText = [
                  lead.industryPrimary || "",
                  typeof lead.distanceKm === "number" ? `${lead.distanceKm}km` : "",
                  openDateBadge,
                  storeAreaLabel || "",
                  rating
                ].filter(Boolean).join(" · ") || lead.address || "주소 확인 필요";
                return (
                  <MapListRow
                    badges={
                      <span className={`shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] ${lead.grade ? permitGradeToneClassName(lead.grade, false) : "bg-teal-700 text-white"}`} title={confidence.reasons.join(" · ")}>
                        {lead.grade ? `${lead.grade}등급` : `우선 ${confidence.score}`}
                      </span>
                    }
                    checkbox={<input aria-label={`${lead.businessName} 선택`} checked={selectedLeadIds.has(lead.id)} className="h-[18px] w-[18px] shrink-0 rounded border-slate-300 text-teal-700" onChange={() => toggleLeadSelection(lead.id)} type="checkbox" />}
                    editLabel={`${lead.businessName} 상세 열기`}
                    error={rowErrors[lead.id]}
                    icons={
                      <>
                        {reminder ? <span aria-label={reminder} className="grid h-[26px] w-[26px] place-items-center text-amber-600" role="img" title={reminder}><Clock className="h-3.5 w-3.5" /></span> : null}
                        <MapLeadChannelIcons lead={lead} places={resolvePlaceUrls({ address: lead.address, googleMapUrl: lead.googlePlaceUrl, kakaoPlaceUrl: lead.kakaoPlaceUrl, name: lead.businessName, naverPlaceUrl: lead.naverPlaceUrl })} />
                      </>
                    }
                    index={leadIndex}
                    itemRef={(el) => {
                      itemRefs.current[lead.id] = el;
                    }}
                    key={lead.id}
                    name={lead.businessName}
                    nameTitle={[lead.businessName, lead.address].filter(Boolean).join(" · ")}
                    onEdit={() => onOpenDetail(lead.id)}
                    onSelect={() => onSelectLead(lead.id)}
                    selected={lead.id === selectedLeadId}
                    stage={
                      <select
                        aria-label={`${lead.businessName} 단계`}
                        className="h-6 max-w-[84px] rounded-full border border-slate-300 bg-white px-1.5 text-[11px] font-bold text-slate-800"
                        onChange={async (event) => {
                          const result = await onUpdateStage(lead.id, event.target.value);
                          setRowErrors((current) => {
                            const next = { ...current };
                            if (result.ok) delete next[lead.id];
                            else next[lead.id] = result.message || "단계 변경에 실패했습니다.";
                            return next;
                          });
                        }}
                        value={toLeadStageValue(lead.status)}
                      >
                        {LEAD_STAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    }
                    subText={subText}
                    total={sortedLeads.length}
                  />
                );
              })}
              {leadShown < sortedLeads.length ? (
                <button className="maju-button-secondary m-2 h-9 w-[calc(100%-1rem)] justify-center text-xs" onClick={() => setLeadLimit(leadShown + LIST_CHUNK)} type="button">더 보기 ({(sortedLeads.length - leadShown).toLocaleString()}곳 남음)</button>
              ) : null}
            </>
          ) : loadState === "loading" || loadState === "idle" ? (
            <div className="grid h-full min-h-[180px] place-items-center px-4">
              <LoadingState bare description="지도와 목록을 같은 기준으로 준비하고 있습니다." label="리드를 불러오는 중입니다." />
            </div>
          ) : loadState === "error" ? (
            <div className="grid h-full min-h-[180px] place-items-center px-4">
              <ErrorState bare description="네트워크 상태를 확인한 뒤 다시 시도해 주세요." message="리드를 불러오지 못했습니다." onRetry={onRetry} />
            </div>
          ) : (
            <div className="grid h-full min-h-[180px] place-items-center px-4">
              <EmptyState bare description="업종, 지역, 개시일 필터를 조정해 주세요." message="조건에 맞는 리드가 없습니다." />
            </div>
          )}
        </div>
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
          <button className="maju-button-primary mb-2 h-9 w-full justify-center text-xs" onClick={onOpenTable} type="button">
            표로 보기
          </button>
          <p className="text-xs font-bold leading-5 text-slate-500">우선순위는 사업자 상태·연락처·주소·등급·신선도·리뷰를 합산합니다.</p>
        </div>
      </div>
    </aside>
  );
}

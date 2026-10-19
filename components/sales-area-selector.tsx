"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, Plus, X } from "lucide-react";
import { KakaoAddressMap, type KakaoSalesAreaStat } from "@/components/kakao-address-map";
import { KOREAN_ADMINISTRATIVE_AREAS, KOREAN_PROVINCES } from "@/lib/korean-administrative-areas";

type Region = { id: string; label: string };
type Recommendation = { administrativeArea: string; customerCount: number; existingLeadCount: number; recentLeadCount: number };
type SalesAreaState = {
  defaultAreas: string[];
  effectiveAreas: string[];
  explicitAreas: string[];
  source: "default" | "explicit" | "none";
  unrecognizedRegions: Region[];
};

export type SalesAreaSelectorSnapshot = {
  canManage: boolean;
  recommendations: Recommendation[];
  regions: Region[];
  salesAreaState: SalesAreaState;
};

const EMPTY_STATE: SalesAreaSelectorSnapshot = {
  canManage: false,
  recommendations: [],
  regions: [],
  salesAreaState: { defaultAreas: [], effectiveAreas: [], explicitAreas: [], source: "none", unrecognizedRegions: [] }
};

export function SalesAreaSelector({
  compact = false,
  mapCenterPoint,
  onChanged,
  onSnapshot
}: {
  readonly compact?: boolean;
  readonly mapCenterPoint?: { lat: number; lng: number } | null;
  readonly onChanged?: () => void;
  readonly onSnapshot?: (snapshot: SalesAreaSelectorSnapshot) => void;
}) {
  const [snapshot, setSnapshot] = useState(EMPTY_STATE);
  const [province, setProvince] = useState("서울특별시");
  const [district, setDistrict] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mapMetric, setMapMetric] = useState<"customers" | "recentLeads">("recentLeads");
  const [mapStats, setMapStats] = useState<KakaoSalesAreaStat[]>([]);
  const [mapStatsLoading, setMapStatsLoading] = useState(false);
  const [mapLoadTiming, setMapLoadTiming] = useState<number | null>(null);
  const districts = KOREAN_ADMINISTRATIVE_AREAS[province] || [];

  const previewCompanyId = useCallback(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("companyId") || "";
  }, []);

  const withPreviewCompany = useCallback((path: string) => {
    const companyId = previewCompanyId();
    if (!companyId) return path;
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}companyId=${encodeURIComponent(companyId)}`;
  }, [previewCompanyId]);

  const load = useCallback(async () => {
    const response = await fetch(withPreviewCompany("/api/leads/permits/keyword-search-regions"), { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload) return;
    const next = { ...EMPTY_STATE, ...payload } as SalesAreaSelectorSnapshot;
    setSnapshot(next);
    onSnapshot?.(next);
  }, [onSnapshot, withPreviewCompany]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setDistrict(""); }, [province]);
  useEffect(() => {
    let active = true;
    setMapStatsLoading(true);
    fetch(withPreviewCompany(`/api/leads/permits/sales-area-stats?province=${encodeURIComponent(province)}`), { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (active) setMapStats(Array.isArray(payload?.stats) ? payload.stats : []);
      })
      .catch(() => {
        if (active) setMapStats([]);
      })
      .finally(() => {
        if (active) setMapStatsLoading(false);
      });
    return () => { active = false; };
  }, [province, withPreviewCompany]);

  const unrecognizedIds = useMemo(() => new Set(snapshot.salesAreaState.unrecognizedRegions.map((item) => item.id)), [snapshot.salesAreaState.unrecognizedRegions]);

  async function addArea(administrativeArea: string) {
    if (!snapshot.canManage || !administrativeArea) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(withPreviewCompany("/api/leads/permits/keyword-search-regions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: previewCompanyId() || undefined, label: administrativeArea })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.message || "영업 지역을 저장하지 못했습니다.");
        return;
      }
      await load();
      onChanged?.();
      setMessage(`저장했습니다. 기존 ${administrativeArea} 리드 ${(payload?.existingLeadCount || 0).toLocaleString()}건을 바로 표시하고, 내일 아침부터 새 매장이 들어옵니다.`);
    } finally {
      setBusy(false);
    }
  }

  async function removeArea(id: string) {
    if (!snapshot.canManage) return;
    setBusy(true);
    const response = await fetch(withPreviewCompany(`/api/leads/permits/keyword-search-regions?id=${encodeURIComponent(id)}`), { method: "DELETE" });
    if (response.ok) {
      await load();
      onChanged?.();
      setMessage("영업 지역을 해제했습니다.");
    }
    setBusy(false);
  }

  async function toggleBoundaryArea(administrativeArea: string) {
    const explicitRegion = snapshot.regions.find((region) => region.label === administrativeArea);
    if (explicitRegion) {
      await removeArea(explicitRegion.id);
      return;
    }
    if (snapshot.salesAreaState.effectiveAreas.includes(administrativeArea)) {
      setMessage("출발지·배송 권역에서 적용된 기본 지역은 회사 정보 또는 권역 설정에서 변경해주세요.");
      return;
    }
    await addArea(administrativeArea);
  }

  async function addMapCenter() {
    if (!mapCenterPoint) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(withPreviewCompany(`/api/address-search/reverse?lat=${encodeURIComponent(mapCenterPoint.lat)}&lng=${encodeURIComponent(mapCenterPoint.lng)}`), { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.administrativeArea) {
        setMessage(payload?.message || "지도 중심 지역을 확인하지 못했습니다.");
        return;
      }
      await addArea(payload.administrativeArea);
    } finally {
      setBusy(false);
    }
  }

  const sourceLabel = snapshot.salesAreaState.source === "explicit"
    ? "직접 지정"
    : snapshot.salesAreaState.source === "default"
      ? "출발지·배송 권역 기본값"
      : "미설정";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div>
        <p className="text-xs font-black text-slate-700">현재 적용 중 · {sourceLabel}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {snapshot.regions.map((region) => {
            const unrecognized = unrecognizedIds.has(region.id);
            return (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${unrecognized ? "bg-amber-50 text-amber-800" : "bg-teal-50 text-teal-800"}`} key={region.id}>
                {region.label}{unrecognized ? " · 인식 안 됨" : ""}
                {snapshot.canManage ? <button aria-label={`${region.label} 해제`} disabled={busy} onClick={() => void removeArea(region.id)} type="button"><X className="h-3 w-3" /></button> : null}
              </span>
            );
          })}
          {!snapshot.regions.length ? snapshot.salesAreaState.effectiveAreas.map((area) => <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700" key={area}>{area}</span>) : null}
          {!snapshot.salesAreaState.effectiveAreas.length && !snapshot.regions.length ? <span className="text-xs font-semibold text-amber-700">영업할 지역을 골라 주세요.</span> : null}
        </div>
      </div>

      {snapshot.recommendations.length ? (
        <div>
          <p className="text-xs font-black text-slate-700">거래처 기준 추천</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {snapshot.recommendations.map((item) => (
              <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-bold text-slate-700 hover:border-teal-300 hover:bg-teal-50 disabled:opacity-50" disabled={!snapshot.canManage || busy || snapshot.salesAreaState.effectiveAreas.includes(item.administrativeArea)} key={item.administrativeArea} onClick={() => void addArea(item.administrativeArea)} type="button">
                <span className="block text-slate-950">{item.administrativeArea}</span>
                <span className="mt-0.5 block text-[11px] text-slate-500">거래처 {item.customerCount.toLocaleString()}곳 · 최근 30일 신규 리드 {item.recentLeadCount.toLocaleString()}건</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
        <select className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold" disabled={!snapshot.canManage || busy} onChange={(event) => setProvince(event.target.value)} value={province}>
          {KOREAN_PROVINCES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold" disabled={!snapshot.canManage || busy} onChange={(event) => setDistrict(event.target.value)} value={district}>
          <option value="">시·군·구 선택</option>
          {districts.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button className="maju-button-primary" disabled={!snapshot.canManage || !district || busy} onClick={() => void addArea(`${province} ${district}`)} type="button"><Plus className="h-4 w-4" />추가</button>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5">
          <div>
            <p className="text-xs font-black text-slate-900">지도에서 지역 선택</p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">경계를 누르면 지역 정보와 추가·해제 버튼이 열립니다.</p>
          </div>
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            <button className={`rounded-md px-2.5 py-1.5 text-[11px] font-black ${mapMetric === "recentLeads" ? "bg-white text-teal-800 shadow-sm" : "text-slate-500"}`} onClick={() => setMapMetric("recentLeads")} type="button">최근 30일 신규</button>
            <button className={`rounded-md px-2.5 py-1.5 text-[11px] font-black ${mapMetric === "customers" ? "bg-white text-teal-800 shadow-sm" : "text-slate-500"}`} onClick={() => setMapMetric("customers")} type="button">거래처 수</button>
          </div>
        </div>
        <KakaoAddressMap
          mapClassName="h-[300px] rounded-none border-0 sm:h-[360px]"
          markers={[]}
          salesAreaBoundary={{
            canManage: snapshot.canManage,
            metric: mapMetric,
            onLoadTiming: setMapLoadTiming,
            onToggle: (administrativeArea) => void toggleBoundaryArea(administrativeArea),
            province,
            selectedAreas: snapshot.salesAreaState.effectiveAreas,
            stats: mapStats
          }}
          showList={false}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-500">
          <span>옅음 → 진함: {mapMetric === "recentLeads" ? "신규 리드 수" : "거래처 수"} · 선택 지역은 청록색 테두리</span>
          <span>{mapStatsLoading ? "집계 불러오는 중" : mapLoadTiming == null ? "경계 불러오는 중" : `경계 표시 ${Math.round(mapLoadTiming)}ms`}</span>
        </div>
        <p className="border-t border-slate-100 px-3 py-2 text-[10px] font-semibold text-slate-400">행정경계: 국가데이터처 SGIS (2025.07.01 기준)</p>
      </div>
      {mapCenterPoint ? <button className="maju-button-secondary w-full justify-center" disabled={!snapshot.canManage || busy} onClick={() => void addMapCenter()} type="button"><MapPin className="h-4 w-4" />현재 지도 중심의 시·군·구 추가</button> : null}
      {!snapshot.canManage ? <p className="text-xs font-semibold text-slate-500">영업 지역은 회사 또는 거래처 관리 권한이 있는 사용자만 변경할 수 있습니다.</p> : null}
      {message ? <p className="text-xs font-bold text-slate-700">{message}</p> : null}
    </div>
  );
}

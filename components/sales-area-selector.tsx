"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPin, X } from "lucide-react";
import { KakaoAddressMap, type KakaoSalesAreaStat } from "@/components/kakao-address-map";
import { isSalesAreaCovered, KOREAN_ADMINISTRATIVE_AREAS, KOREAN_GENERAL_GU_AREAS, KOREAN_PROVINCES } from "@/lib/korean-administrative-areas";

type Region = { areaKind?: "assigned" | "expansion_candidate"; id: string; label: string };
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
  expansionCandidateRegions: Region[];
  recommendations: Recommendation[];
  regions: Region[];
  salesAreaState: SalesAreaState;
};

const EMPTY_STATE: SalesAreaSelectorSnapshot = {
  canManage: false,
  expansionCandidateRegions: [],
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [mapMetric, setMapMetric] = useState<"customers" | "recentLeads">("recentLeads");
  const [mapStats, setMapStats] = useState<KakaoSalesAreaStat[]>([]);
  const [mapStatsLoading, setMapStatsLoading] = useState(false);
  const [mapLoadTiming, setMapLoadTiming] = useState<number | null>(null);

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

  async function addArea(administrativeArea: string, areaKind: "assigned" | "expansion_candidate" = "assigned") {
    if (!snapshot.canManage || !administrativeArea) return false;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(withPreviewCompany("/api/leads/permits/keyword-search-regions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areaKind, companyId: previewCompanyId() || undefined, label: administrativeArea })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.message || "영업 지역을 저장하지 못했습니다.");
        return false;
      }
      await load();
      onChanged?.();
      setMessage(areaKind === "assigned"
        ? `저장했습니다. 기존 ${administrativeArea} 리드 ${(payload?.existingLeadCount || 0).toLocaleString()}건을 바로 표시하고, 내일 아침부터 새 매장이 들어옵니다.`
        : `${administrativeArea}을 영업 필요 지역으로 저장했습니다. 수동 탐색에만 사용하며 매일 자동 수집에는 포함하지 않습니다.`);
      return true;
    } catch {
      setMessage("네트워크 연결을 확인한 뒤 다시 시도해주세요.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function removeArea(id: string) {
    if (!snapshot.canManage) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(withPreviewCompany(`/api/leads/permits/keyword-search-regions?id=${encodeURIComponent(id)}`), { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.message || "영업 지역을 해제하지 못했습니다.");
        return;
      }
      await load();
      onChanged?.();
      setMessage("영업 지역을 해제했습니다.");
    } catch {
      setMessage("네트워크 연결을 확인한 뒤 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function setAreaChecked(administrativeArea: string, checked: boolean) {
    if (checked) {
      if (KOREAN_PROVINCES.includes(administrativeArea)) {
        const recent = mapStats
          .filter((item) => item.administrativeArea.split(" ").length === 2)
          .reduce((sum, item) => sum + item.recentLeadCount, 0);
        const daily = Math.round(recent / 30);
        const accepted = window.confirm(
          `${administrativeArea} 전체를 선택하면 최근 30일 신규 약 ${recent.toLocaleString()}건, 하루 평균 약 ${daily.toLocaleString()}건이 들어옵니다. `
          + "현재 자동 작업 상한 기준 카카오 호출은 키워드 탐색 24회와 연락처 보강 30회, 하루 최대 약 54회입니다. 계속할까요?"
        );
        if (!accepted) return;
      }
      const saved = await addArea(administrativeArea);
      if (!saved) return;
      const redundantRegions = snapshot.regions.filter((region) => region.label.startsWith(`${administrativeArea} `));
      if (redundantRegions.length) {
        const results = await Promise.all(redundantRegions.map((region) =>
          fetch(withPreviewCompany(`/api/leads/permits/keyword-search-regions?id=${encodeURIComponent(region.id)}`), { method: "DELETE" })
            .then((response) => response.ok)
            .catch(() => false)
        ));
        if (results.some((ok) => !ok)) {
          setMessage("넓은 지역은 저장했지만 일부 하위 지역 정리에 실패했습니다. 다시 열어 확인해주세요.");
        } else {
          await load();
          onChanged?.();
        }
      }
      return;
    }
    const explicitRegion = snapshot.regions.find((region) => region.label === administrativeArea);
    if (explicitRegion) await removeArea(explicitRegion.id);
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
  const provinceSelected = snapshot.salesAreaState.effectiveAreas.includes(province);
  const statsByArea = useMemo(() => new Map(mapStats.map((item) => [item.administrativeArea, item])), [mapStats]);
  const districtRows = useMemo(() => {
    const selected = snapshot.salesAreaState.effectiveAreas;
    return (KOREAN_ADMINISTRATIVE_AREAS[province] || [])
      .map((districtName) => {
        const parent = `${province} ${districtName}`;
        const generalGus = KOREAN_GENERAL_GU_AREAS[parent] || [];
        return {
          districtName,
          parent,
          generalGus,
          selected: isSalesAreaCovered(parent, selected) || generalGus.some((gu) => selected.includes(`${parent} ${gu}`))
        };
      })
      .sort((left, right) => Number(right.selected) - Number(left.selected) || left.districtName.localeCompare(right.districtName));
  }, [province, snapshot.salesAreaState.effectiveAreas]);

  return (
    <div className={`min-w-0 max-w-full ${compact ? "space-y-3" : "space-y-4"}`}>
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

      <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3">
        <p className="text-xs font-black text-violet-950">영업 필요 지역</p>
        <p className="mt-1 text-[11px] font-semibold text-violet-700">확장 검토·수동 탐색 전용입니다. 매일 자동 수집 지역과 분리됩니다.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {snapshot.expansionCandidateRegions.map((region) => (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-violet-800 ring-1 ring-inset ring-violet-200" key={region.id}>
              {region.label}
              {snapshot.canManage ? <button aria-label={`${region.label} 영업 필요 지역 해제`} disabled={busy} onClick={() => void removeArea(region.id)} type="button"><X className="h-3 w-3" /></button> : null}
            </span>
          ))}
          {!snapshot.expansionCandidateRegions.length ? <span className="text-xs font-semibold text-violet-700">아래 추천 지역에서 추가할 수 있습니다.</span> : null}
        </div>
        {snapshot.recommendations.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {snapshot.recommendations.slice(0, 6).map((item) => (
              <button
                className="rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-left text-xs font-bold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
                disabled={!snapshot.canManage || busy || snapshot.expansionCandidateRegions.some((region) => region.label === item.administrativeArea)}
                key={`expansion-${item.administrativeArea}`}
                onClick={() => void addArea(item.administrativeArea, "expansion_candidate")}
                type="button"
              >
                + {item.administrativeArea}
              </button>
            ))}
          </div>
        ) : null}
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

      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <select className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold" disabled={!snapshot.canManage || busy} onChange={(event) => setProvince(event.target.value)} value={province}>
          {KOREAN_PROVINCES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <div className="max-h-[min(48dvh,440px)] space-y-1 overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white p-2">
          <SalesAreaCheckbox
            checked={provinceSelected}
            disabled={!snapshot.canManage || busy}
            label={`${province} 전체`}
            onChange={(checked) => void setAreaChecked(province, checked)}
            stat={{
              customerCount: districtRows.reduce((sum, row) => sum + (statsByArea.get(row.parent)?.customerCount || 0), 0),
              recentLeadCount: districtRows.reduce((sum, row) => sum + (statsByArea.get(row.parent)?.recentLeadCount || 0), 0)
            }}
          />
          {districtRows.map((row) => {
            const parentExplicit = snapshot.salesAreaState.effectiveAreas.includes(row.parent);
            return (
              <div className="border-t border-slate-100 pt-1" key={row.parent}>
                <SalesAreaCheckbox
                  checked={provinceSelected || parentExplicit}
                  disabled={!snapshot.canManage || busy || provinceSelected}
                  label={row.generalGus.length ? `${row.districtName} 전체` : row.districtName}
                  onChange={(checked) => void setAreaChecked(row.parent, checked)}
                  stat={statsByArea.get(row.parent)}
                />
                {row.generalGus.map((gu) => {
                  const area = `${row.parent} ${gu}`;
                  return (
                    <div className="pl-6" key={area}>
                      <SalesAreaCheckbox
                        checked={provinceSelected || parentExplicit || snapshot.salesAreaState.effectiveAreas.includes(area)}
                        disabled={!snapshot.canManage || busy || provinceSelected || parentExplicit}
                        label={gu}
                        onChange={(checked) => void setAreaChecked(area, checked)}
                        stat={statsByArea.get(area)}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <p className="text-[11px] font-semibold text-slate-500">체크하면 즉시 저장되고 지도 색칠과 리드 목록에 반영됩니다. 시·도 전체는 키 하나로 저장합니다.</p>
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

function SalesAreaCheckbox({
  checked,
  disabled,
  label,
  onChange,
  stat
}: {
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly label: string;
  readonly onChange: (checked: boolean) => void;
  readonly stat?: Pick<KakaoSalesAreaStat, "customerCount" | "recentLeadCount">;
}) {
  return (
    <label className={`flex min-h-10 items-center gap-2 rounded-md px-2 py-1.5 ${disabled ? "opacity-60" : "cursor-pointer hover:bg-teal-50"}`}>
      <input checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      <span className="min-w-0 flex-1 text-xs font-black text-slate-800">{label}</span>
      <span className="text-right text-[10px] font-semibold tabular-nums text-slate-500 sm:shrink-0">신규 {(stat?.recentLeadCount || 0).toLocaleString()} · 거래처 {(stat?.customerCount || 0).toLocaleString()}</span>
    </label>
  );
}

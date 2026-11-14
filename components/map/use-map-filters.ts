"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PermitLeadType } from "@/domains/lead/map-filters";
import type { StoreAreaRange } from "@/domains/lead/store-area";
import type { MapFilterPresetFilters } from "@/lib/map-filter-presets";

// M3b: 지도 리드 필터 상태와 저장 필터(프리셋)를 한 곳에. 계산은 domains/lead/map-filters.ts, 화면은 map-filters-bar.tsx.
// 돌려주는 묶음은 useMemo로 고정한다(매 렌더 새 객체로 지도·목록 전체가 다시 그려지지 않게).
export type MapFilterPopKey = "region" | "industry" | "size" | "date" | "stage" | "more";

type Params = {
  readonly initialLeadType: "all" | PermitLeadType;
  readonly gradeFilter: MapFilterPresetFilters["gradeFilter"];
  readonly setGradeFilter: (value: MapFilterPresetFilters["gradeFilter"]) => void;
  readonly excludeClosedStores: boolean;
  readonly setExcludeClosedStores: (value: boolean) => void;
};

export function useMapFilters({ excludeClosedStores, gradeFilter, initialLeadType, setExcludeClosedStores, setGradeFilter }: Params) {
  // 필터 칩 팝오버(한 번에 하나만 열림). left/top은 필터 줄 기준 px.
  const [mapFilterPop, setMapFilterPop] = useState<"" | MapFilterPopKey>("");
  const [mapFilterPopLeft, setMapFilterPopLeft] = useState(0);
  const [mapFilterPopTop, setMapFilterPopTop] = useState(48);
  const mapFilterPopRef = useRef<HTMLDivElement>(null);
  const [mapLeadIndustryFilter, setMapLeadIndustryFilter] = useState("");
  const [mapLeadStageFilter, setMapLeadStageFilter] = useState("");
  const [mapLeadAreaRange, setMapLeadAreaRange] = useState<StoreAreaRange | "">("");
  const [mapLeadReminderOnly, setMapLeadReminderOnly] = useState(false);
  const [mapLeadTypeFilter, setMapLeadTypeFilter] = useState<"all" | PermitLeadType>(initialLeadType);
  const [mapLeadOpenDateStart, setMapLeadOpenDateStart] = useState("");
  const [mapLeadOpenDateEnd, setMapLeadOpenDateEnd] = useState("");
  // 날짜 입력칸은 입력할 때마다 바로 필터링하지 않고 "조회"를 눌러야 실제 필터(Applied)에 반영(Draft/Applied 분리).
  const [mapLeadOpenDateStartDraft, setMapLeadOpenDateStartDraft] = useState("");
  const [mapLeadOpenDateEndDraft, setMapLeadOpenDateEndDraft] = useState("");
  const [mapFilterPresets, setMapFilterPresets] = useState<Array<{ id: string; name: string; filters: MapFilterPresetFilters }>>([]);
  const [mapFilterPresetEnabled, setMapFilterPresetEnabled] = useState(false);
  const [selectedMapFilterPresetId, setSelectedMapFilterPresetId] = useState("");
  const [mapFilterPresetBusy, setMapFilterPresetBusy] = useState(false);
  // 숨김(제외) 리드·폐업 리드(CC-46-4, 기본 제외) 보기.
  const [showDismissedLeadsOnMap, setShowDismissedLeadsOnMap] = useState(false);
  const [showClosedLeadsOnMap, setShowClosedLeadsOnMap] = useState(false);
  const [mapLeadRegionSigungu, setMapLeadRegionSigungu] = useState("");
  const [mapLeadRegionDong, setMapLeadRegionDong] = useState("");

  const selectMapLeadRegionSigungu = useCallback((next: string) => {
    setMapLeadRegionSigungu((current) => (current === next ? "" : next));
    setMapLeadRegionDong("");
  }, []);

  const resetLeadFilters = useCallback(() => {
    setMapLeadTypeFilter("all");
    setMapLeadIndustryFilter("");
    setMapLeadStageFilter("");
    setMapLeadAreaRange("");
    setMapLeadReminderOnly(false);
    setMapLeadRegionSigungu("");
    setMapLeadRegionDong("");
    setMapLeadOpenDateStart("");
    setMapLeadOpenDateEnd("");
    setMapLeadOpenDateStartDraft("");
    setMapLeadOpenDateEndDraft("");
  }, []);

  const leadFiltersActive = mapLeadTypeFilter !== "all" || Boolean(mapLeadIndustryFilter || mapLeadStageFilter || mapLeadAreaRange || mapLeadReminderOnly || mapLeadOpenDateStart || mapLeadOpenDateEnd || mapLeadRegionSigungu || mapLeadRegionDong);

  const loadMapFilterPresets = useCallback(async () => {
    const response = await fetch("/api/map/filter-presets", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.enabled) {
      setMapFilterPresetEnabled(false);
      setMapFilterPresets([]);
      return;
    }
    setMapFilterPresetEnabled(true);
    setMapFilterPresets(Array.isArray(payload.presets) ? payload.presets : []);
  }, []);

  useEffect(() => { void loadMapFilterPresets(); }, [loadMapFilterPresets]);

  const applyMapFilterPreset = useCallback((presetId: string) => {
    setSelectedMapFilterPresetId(presetId);
    const preset = mapFilterPresets.find((item) => item.id === presetId);
    if (!preset) return;
    setGradeFilter(preset.filters.gradeFilter);
    setMapLeadIndustryFilter(preset.filters.industry);
    setMapLeadStageFilter(preset.filters.stage);
    setMapLeadTypeFilter(preset.filters.leadType);
    setMapLeadReminderOnly(preset.filters.reminderOnly);
    setExcludeClosedStores(preset.filters.excludeClosedStores);
  }, [mapFilterPresets, setExcludeClosedStores, setGradeFilter]);

  const saveCurrentMapFilterPreset = useCallback(async () => {
    const name = window.prompt("저장할 지도 필터 이름을 입력해주세요.")?.trim();
    if (!name) return;
    setMapFilterPresetBusy(true);
    try {
      const response = await fetch("/api/map/filter-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          filters: {
            excludeClosedStores,
            gradeFilter,
            industry: mapLeadIndustryFilter,
            leadType: mapLeadTypeFilter,
            reminderOnly: mapLeadReminderOnly,
            stage: mapLeadStageFilter
          } satisfies MapFilterPresetFilters
        })
      });
      if (response.ok) await loadMapFilterPresets();
    } finally {
      setMapFilterPresetBusy(false);
    }
  }, [excludeClosedStores, gradeFilter, loadMapFilterPresets, mapLeadIndustryFilter, mapLeadReminderOnly, mapLeadStageFilter, mapLeadTypeFilter]);

  const removeSelectedMapFilterPreset = useCallback(async () => {
    if (!selectedMapFilterPresetId) return;
    setMapFilterPresetBusy(true);
    try {
      const response = await fetch("/api/map/filter-presets?id=" + encodeURIComponent(selectedMapFilterPresetId), { method: "DELETE" });
      if (response.ok) {
        setSelectedMapFilterPresetId("");
        await loadMapFilterPresets();
      }
    } finally {
      setMapFilterPresetBusy(false);
    }
  }, [loadMapFilterPresets, selectedMapFilterPresetId]);

  return useMemo(
    () => ({
      applyMapFilterPreset, leadFiltersActive, mapFilterPop, mapFilterPopLeft, mapFilterPopRef, mapFilterPopTop, mapFilterPresetBusy, mapFilterPresetEnabled, mapFilterPresets,
      mapLeadAreaRange, mapLeadIndustryFilter, mapLeadOpenDateEnd, mapLeadOpenDateEndDraft, mapLeadOpenDateStart, mapLeadOpenDateStartDraft,
      mapLeadRegionDong, mapLeadRegionSigungu, mapLeadReminderOnly, mapLeadStageFilter, mapLeadTypeFilter,
      removeSelectedMapFilterPreset, resetLeadFilters, saveCurrentMapFilterPreset, selectedMapFilterPresetId, selectMapLeadRegionSigungu,
      setMapFilterPop, setMapFilterPopLeft, setMapFilterPopTop, setMapLeadAreaRange, setMapLeadIndustryFilter, setMapLeadOpenDateEnd,
      setMapLeadOpenDateEndDraft, setMapLeadOpenDateStart, setMapLeadOpenDateStartDraft, setMapLeadRegionDong, setMapLeadRegionSigungu,
      setMapLeadReminderOnly, setMapLeadStageFilter, setMapLeadTypeFilter, setShowClosedLeadsOnMap, setShowDismissedLeadsOnMap,
      showClosedLeadsOnMap, showDismissedLeadsOnMap
    }),
    [
      applyMapFilterPreset, leadFiltersActive, mapFilterPop, mapFilterPopLeft, mapFilterPopTop, mapFilterPresetBusy, mapFilterPresetEnabled, mapFilterPresets,
      mapLeadAreaRange, mapLeadIndustryFilter, mapLeadOpenDateEnd, mapLeadOpenDateEndDraft, mapLeadOpenDateStart, mapLeadOpenDateStartDraft,
      mapLeadRegionDong, mapLeadRegionSigungu, mapLeadReminderOnly, mapLeadStageFilter, mapLeadTypeFilter,
      removeSelectedMapFilterPreset, resetLeadFilters, saveCurrentMapFilterPreset, selectedMapFilterPresetId, selectMapLeadRegionSigungu,
      showClosedLeadsOnMap, showDismissedLeadsOnMap
    ]
  );
}

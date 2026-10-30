"use client";

import { ChevronDown } from "lucide-react";

type MobileMapSummaryProps = {
  customerCount: number;
  leadCount: number;
  leadsVisible: boolean;
  controlsOpen: boolean;
  salesRegionsConfigured: boolean | null;
  onOpenSalesArea: () => void;
  onToggleControls: () => void;
};

export function MobileMapSummary({
  customerCount,
  leadCount,
  leadsVisible,
  controlsOpen,
  salesRegionsConfigured,
  onOpenSalesArea,
  onToggleControls
}: MobileMapSummaryProps) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-2 lg:hidden">
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-slate-950">지도 현황 · 거래처 {customerCount}곳</p>
        <p className="truncate text-[11px] font-semibold text-slate-500">
          {salesRegionsConfigured === false
            ? "영업 지역 미설정 · 기존 리드 전체 표시"
            : leadsVisible
              ? `리드 ${leadCount}곳 표시`
              : "리드 숨김 · 거래처 중심"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          className="h-9 rounded-lg bg-amber-100 px-3 text-xs font-black text-amber-900"
          onClick={onOpenSalesArea}
          type="button"
        >
          지역 선택
        </button>
        <button
          aria-controls="map-mobile-filters"
          aria-expanded={controlsOpen}
          className="flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700"
          onClick={onToggleControls}
          type="button"
        >
          필터
          <ChevronDown className={`h-3.5 w-3.5 transition ${controlsOpen ? "rotate-180" : ""}`} />
        </button>
      </div>
    </div>
  );
}

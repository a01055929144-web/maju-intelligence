"use client";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Layers, MapPin, X } from "lucide-react";
import { InfoTooltip } from "@/components/info-tooltip";
import { PERMIT_LEAD_TYPE_OPTIONS, type PermitLeadType } from "@/domains/lead/map-filters";
import type { MapFilterPopKey } from "@/components/map/use-map-filters";

// M3b: 지도 필터 줄(표시만). 상태는 use-map-filters, 계산은 domains/lead/map-filters, 팝오버 내용은 M3c.
export type MapFilterChip = { active: boolean; icon: LucideIcon; key: MapFilterPopKey; label: string; muted?: boolean; title: string };

type ChipsRowProps = {
  readonly chips: readonly MapFilterChip[];
  readonly openKey: "" | MapFilterPopKey;
  readonly onToggleChip: (key: MapFilterPopKey, anchor: HTMLElement) => void;
  readonly reminderOnly: boolean;
  readonly reminderCount: number;
  readonly onToggleReminder: () => void;
  /** 담당자 선택 중이면 그 이름, 아니면 빈 문자열 */
  readonly vehicleLabel: string;
  readonly onClearVehicle: () => void;
};

/** 시안 ⑫ 필터 한 줄: 영업 지역 · 업종 · 규모 · 개업일 · 단계 (칩 → 팝오버 다중 선택) · 리마인드 · 담당자 */
export function MapFilterChipsRow({ chips, onClearVehicle, onToggleChip, onToggleReminder, openKey, reminderCount, reminderOnly, vehicleLabel }: ChipsRowProps) {
  return <>
    {chips.map((chip) => {
      const ChipIcon = chip.icon;
      return (
        <button
          aria-expanded={openKey === chip.key}
          aria-haspopup="dialog"
          className={`flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-[13px] transition ${
            chip.active
              ? "border-teal-700 bg-teal-50 font-bold text-teal-800"
              : chip.muted
                ? "border-dashed border-slate-300 bg-white font-medium text-slate-400"
                : "border-slate-300 bg-white font-medium text-slate-900 hover:bg-slate-50"
          }`}
          data-map-filter-chip=""
          key={chip.key}
          onClick={(event) => onToggleChip(chip.key, event.currentTarget)}
          title={chip.title}
          type="button"
        >
          <ChipIcon aria-hidden="true" className="h-[15px] w-[15px] shrink-0" />
          <span className="max-w-[160px] truncate">{chip.label}</span>
        </button>
      );
    })}
    <button
      aria-pressed={reminderOnly}
      className={`h-9 shrink-0 whitespace-nowrap rounded-lg border px-2.5 text-[13px] transition ${
        reminderOnly ? "border-amber-700 bg-amber-50 font-bold text-amber-800" : "border-amber-300 bg-white font-medium text-amber-800 hover:bg-amber-50"
      }`}
      onClick={onToggleReminder}
      type="button"
    >
      리마인드 {reminderCount}
    </button>
    {vehicleLabel ? (
      <button
        aria-label={`${vehicleLabel} 선택 해제`}
        className="inline-flex h-9 min-w-0 max-w-[200px] shrink-0 items-center gap-1.5 rounded-lg border border-teal-300 bg-teal-50 px-2.5 text-[13px] font-bold text-teal-800 transition hover:bg-teal-100"
        onClick={onClearVehicle}
        title="담당자 선택을 풀고 전체 보기"
        type="button"
      >
        <span className="truncate">{vehicleLabel} 담당만</span>
        <X className="h-3.5 w-3.5 shrink-0" />
      </button>
    ) : null}
  </>;
}

type StripProps = {
  readonly salesRegionsConfigured: boolean | null;
  readonly showOutsideSalesArea: boolean;
  readonly onToggleOutsideSalesArea: (value: boolean) => void;
  readonly mapTargetType: "restaurant" | "distributor";
  readonly leadType: "all" | PermitLeadType;
  readonly onSelectLeadType: (value: "all" | PermitLeadType) => void;
  readonly showDismissed: boolean;
  readonly onSelectDismissed: (value: boolean) => void;
  readonly regionOptions: ReadonlyArray<readonly [string, number]>;
  readonly dongOptions: ReadonlyArray<readonly [string, number]>;
  readonly regionSigungu: string;
  readonly regionDong: string;
  readonly onSelectSigungu: (value: string) => void;
  readonly onChangeDong: (value: string) => void;
  readonly openDateDraft: { readonly start: string; readonly end: string };
  readonly openDateApplied: { readonly start: string; readonly end: string };
  readonly onChangeOpenDateStartDraft: (value: string) => void;
  readonly onChangeOpenDateEndDraft: (value: string) => void;
  readonly onApplyOpenDate: () => void;
  readonly filtersActive: boolean;
  readonly onReset: () => void;
  readonly allLeadsLoading: boolean;
  readonly filteredCount: number;
  readonly totalCount: number;
};

/** 모바일 보조 줄: 리드 전체 필터(유형·활성/숨김·지역·개시일·초기화·표시 수). PC에서는 칩 줄과 오른쪽 탭이 같은 일을 한다. */
export function MapLeadFilterStrip(p: StripProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 lg:hidden">
      {p.salesRegionsConfigured === false ? (
        <p className="w-full rounded-md bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
          현재는 기존 리드를 전체 표시합니다. <Link className="underline" href="/dashboard/settings/company">영업 지역을 설정</Link>하면 해당 지역 리드만 보이고 매일 새 리드가 들어옵니다.
        </p>
      ) : null}
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-slate-600">
        <Layers className="h-3.5 w-3.5" />
        리드 전체 필터
      </span>
      <InfoTooltip text="마커 색: 초록 = 등급 미평가, 보라 = A등급, 파랑 = B등급, 회색 = C등급. 청록 테두리·★ = 기거래처 인근 리드." />
      {p.salesRegionsConfigured === true ? (
        <label className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600">
          <input checked={p.showOutsideSalesArea} onChange={(event) => p.onToggleOutsideSalesArea(event.target.checked)} type="checkbox" />
          지역 밖도 보기
        </label>
      ) : null}
      {p.mapTargetType === "distributor" ? null : <div className="flex shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white">
        {PERMIT_LEAD_TYPE_OPTIONS.map((option) => (
          <button
            className={`h-8 px-2.5 text-xs font-semibold transition ${p.leadType === option.value ? "bg-teal-700 text-white" : "text-slate-500 hover:bg-slate-50"}`}
            key={option.value}
            onClick={() => p.onSelectLeadType(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>}
      <div className="flex shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white">
        <button
          className={`h-8 px-2.5 text-xs font-semibold transition ${!p.showDismissed ? "bg-teal-700 text-white" : "text-slate-500 hover:bg-slate-50"}`}
          onClick={() => p.onSelectDismissed(false)}
          type="button"
        >
          활성 리드
        </button>
        <button
          className={`h-8 px-2.5 text-xs font-semibold transition ${p.showDismissed ? "bg-teal-700 text-white" : "text-slate-500 hover:bg-slate-50"}`}
          onClick={() => p.onSelectDismissed(true)}
          type="button"
        >
          숨김 리드
        </button>
      </div>
      {/* 지역 필터는 업종과 같은 리드 필터 그룹 안에서 시군구→동 순서로 좁힙니다. */}
      {p.regionOptions.length ? (
        <>
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-black text-slate-400">
            <MapPin className="h-3.5 w-3.5" />
            지역
          </span>
          <select
            className="h-8 shrink-0 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-teal-300"
            onChange={(event) => p.onSelectSigungu(event.target.value)}
            value={p.regionSigungu}
          >
            <option value="">시군구 전체</option>
            {p.regionOptions.map(([sigungu, count]) => (
              <option key={sigungu} value={sigungu}>
                {sigungu} ({count.toLocaleString()})
              </option>
            ))}
          </select>
          <select
            className="h-8 shrink-0 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-teal-300 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            disabled={!p.regionSigungu || !p.dongOptions.length}
            onChange={(event) => p.onChangeDong(event.target.value)}
            value={p.regionDong}
          >
            <option value="">{p.regionSigungu ? `${p.regionSigungu} 전체` : "동 전체"}</option>
            {p.dongOptions.map(([dong, count]) => (
              <option key={dong} value={dong}>
                {dong} ({count.toLocaleString()})
              </option>
            ))}
          </select>
        </>
      ) : null}
      <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1">
        <span className="text-[11px] font-black text-slate-400">개시일</span>
        <input
          className="h-6 rounded border-0 text-[11px] font-bold text-slate-900 outline-none"
          onChange={(event) => p.onChangeOpenDateStartDraft(event.target.value)}
          type="date"
          value={p.openDateDraft.start}
        />
        <span className="text-[11px] font-bold text-slate-400">~</span>
        <input
          className="h-6 rounded border-0 text-[11px] font-bold text-slate-900 outline-none"
          onChange={(event) => p.onChangeOpenDateEndDraft(event.target.value)}
          type="date"
          value={p.openDateDraft.end}
        />
      </div>
      <button
        className="h-8 shrink-0 rounded-md bg-teal-700 px-3 text-[11px] font-black text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        disabled={p.openDateDraft.start === p.openDateApplied.start && p.openDateDraft.end === p.openDateApplied.end}
        onClick={p.onApplyOpenDate}
        type="button"
      >
        조회
      </button>
      {p.filtersActive ? (
        <button
          className="h-8 shrink-0 rounded-md px-2 text-[11px] font-black text-slate-500 underline decoration-dotted underline-offset-2 hover:text-slate-800"
          onClick={p.onReset}
          type="button"
        >
          필터 초기화
        </button>
      ) : null}
      <span className="ml-auto text-[11px] font-bold text-slate-500">
        {p.allLeadsLoading
          ? "불러오는 중..."
          : p.showDismissed
            ? `숨김 리드 ${p.filteredCount.toLocaleString()}곳`
            : `${p.filteredCount.toLocaleString()} / ${p.totalCount.toLocaleString()}곳 표시 중`}
      </span>
    </div>
  );
}

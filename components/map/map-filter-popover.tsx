"use client";
import type { RefObject } from "react";
import { X } from "lucide-react";
import { LEAD_STAGE_OPTIONS } from "@/domains/lead/lead-status";
import { splitMultiFilter, toggleMultiFilter } from "@/domains/lead/map-filters";
import { STORE_AREA_RANGE_OPTIONS, type StoreAreaRange } from "@/domains/lead/store-area";
import type { MapFilterPopKey } from "@/components/map/use-map-filters";

// M3c: 지도 필터 칩 팝오버(표시만). 상태·저장 필터는 use-map-filters, 규칙은 domains/lead/map-filters.
export const MAP_FILTER_POP_TITLES: Record<MapFilterPopKey, string> = {
  region: "영업 지역",
  industry: "업종",
  size: "매장 규모(평)",
  date: "인허가일",
  stage: "단계",
  more: "더보기"
};

type Setter<T> = (value: T | ((current: T) => T)) => void;
export type RegionGroup = { readonly title: string; readonly helper: string; readonly empty: string; readonly items: ReadonlyArray<readonly [string, number]> };

type Props = {
  readonly openKey: MapFilterPopKey;
  readonly left: number;
  readonly top: number;
  readonly popRef: RefObject<HTMLDivElement>;
  readonly onClose: () => void;
  readonly region: {
    readonly groups: readonly RegionGroup[];
    readonly sigungu: string;
    readonly setSigungu: Setter<string>;
    readonly setDong: (value: string) => void;
    readonly onOpenSalesArea: () => void;
  };
  readonly industry: { readonly options: ReadonlyArray<readonly [string, number]>; readonly value: string; readonly setValue: Setter<string>; readonly loading: boolean };
  readonly size: { readonly enabled: boolean; readonly value: StoreAreaRange | ""; readonly setValue: Setter<StoreAreaRange | ""> };
  readonly date: {
    readonly preset: string;
    readonly onPreset: (days: number) => void;
    readonly draft: { readonly start: string; readonly end: string };
    readonly applied: { readonly start: string; readonly end: string };
    readonly setStartDraft: (value: string) => void;
    readonly setEndDraft: (value: string) => void;
    readonly onApply: () => void;
  };
  readonly stage: { readonly value: string; readonly setValue: Setter<string>; readonly counts: ReadonlyMap<string, number> };
  readonly more: {
    readonly excludeClosedStores: boolean;
    readonly setExcludeClosedStores: Setter<boolean>;
    readonly showTerminatedStores: boolean;
    readonly setShowTerminatedStores: Setter<boolean>;
    readonly showDismissed: boolean;
    readonly setShowDismissed: Setter<boolean>;
    readonly showClosed: boolean;
    readonly setShowClosed: (value: boolean) => void;
    readonly showOutsideSalesAreaChoice: boolean;
    readonly showOutsideSalesArea: boolean;
    readonly setShowOutsideSalesArea: (value: boolean) => void;
    readonly gradeFilter: string;
    readonly gradeOptions: ReadonlyArray<{ readonly label: string; readonly value: string; readonly count: number }>;
    readonly setGrade: (value: string) => void;
    readonly onFocusOrigin: () => void;
    readonly summary: string;
  };
  readonly presets: {
    readonly enabled: boolean;
    readonly list: ReadonlyArray<{ readonly id: string; readonly name: string }>;
    readonly selectedId: string;
    readonly busy: boolean;
    readonly onApply: (id: string) => void;
    readonly onRemove: () => void;
    readonly onSave: () => void;
  };
};

const checkRow = "flex h-[34px] cursor-pointer items-center gap-2 text-[13px]";
const checkbox = "h-4 w-4 rounded border-slate-300 text-teal-700";

export function MapFilterPopover(p: Props) {
  const { openKey } = p;
  const multi = openKey === "region" || openKey === "industry" || openKey === "stage";
  const clearValue = openKey === "region" ? p.region.sigungu : openKey === "industry" ? p.industry.value : p.stage.value;
  return (
    <div
      aria-label={MAP_FILTER_POP_TITLES[openKey]}
      className="absolute z-40 w-[300px] max-w-[calc(100vw-1rem)] rounded-xl border border-slate-200 bg-white p-3 text-[13px] text-slate-800 shadow-[0_8px_24px_rgba(15,23,42,.18)]"
      ref={p.popRef}
      role="dialog"
      style={{ left: p.left, top: p.top }}
    >
      <div className="mb-2 flex items-center gap-2">
        <b className="text-[13px] font-black text-slate-950">{MAP_FILTER_POP_TITLES[openKey]}</b>
        {multi ? (
          <button
            className="ml-auto h-7 rounded-md px-2 text-xs font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            disabled={!clearValue}
            onClick={() => {
              if (openKey === "region") {
                p.region.setSigungu("");
                p.region.setDong("");
              } else if (openKey === "industry") p.industry.setValue("");
              else p.stage.setValue("");
            }}
            type="button"
          >
            전체 해제
          </button>
        ) : null}
        <button
          aria-label="닫기"
          className={`grid h-7 w-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 ${multi ? "" : "ml-auto"}`}
          onClick={p.onClose}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {openKey === "region" ? (
        <div className="max-h-[300px] overflow-auto">
          {p.region.groups.map((group) => (
            <div key={group.title}>
              <div className="mt-1 flex items-center border-b border-slate-100 py-1">
                <b className="text-xs font-black text-slate-800">{group.title}</b>
                <span className="ml-auto text-[11px] text-slate-500">{group.helper}</span>
              </div>
              {group.items.length ? (
                group.items.map(([sigungu, count]) => (
                  <label className={checkRow} key={`${group.title}-${sigungu}`}>
                    <input
                      checked={splitMultiFilter(p.region.sigungu).includes(sigungu)}
                      className={checkbox}
                      onChange={() => {
                        p.region.setSigungu((current) => toggleMultiFilter(current, sigungu));
                        p.region.setDong("");
                      }}
                      type="checkbox"
                    />
                    <span className="min-w-0 flex-1 truncate">{sigungu}</span>
                    <span className="text-xs text-slate-500 tabular-nums">{count.toLocaleString()}</span>
                  </label>
                ))
              ) : (
                <p className="py-2 text-xs text-slate-400">{group.empty}</p>
              )}
            </div>
          ))}
          {/* 11/3 현장 피드백: 지역 설정이 좌측 하단 설정 메뉴에만 있는 줄 알았다 → 주색 버튼으로 눈에 띄게. 이 화면에서 바로 열리고 닫으면 그대로 복귀. */}
          <button className="maju-button-primary mt-2 h-9 w-full justify-center text-xs" onClick={p.region.onOpenSalesArea} type="button">
            영업 지역 설정
          </button>
        </div>
      ) : null}

      {openKey === "industry" ? (
        <div className="max-h-[300px] overflow-auto">
          {p.industry.options.length ? (
            p.industry.options.map(([industry, count]) => (
              <label className={checkRow} key={industry}>
                <input
                  checked={splitMultiFilter(p.industry.value).includes(industry)}
                  className={checkbox}
                  onChange={() => p.industry.setValue((current) => toggleMultiFilter(current, industry))}
                  type="checkbox"
                />
                <span className="min-w-0 flex-1 truncate">{industry}</span>
                <span className="text-xs text-slate-500 tabular-nums">{count.toLocaleString()}</span>
              </label>
            ))
          ) : (
            <p className="py-2 text-xs text-slate-400">{p.industry.loading ? "리드를 불러오는 중입니다." : "표시할 업종이 없습니다."}</p>
          )}
        </div>
      ) : null}

      {openKey === "size" ? (
        <div>
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {STORE_AREA_RANGE_OPTIONS.map((option) => (
              <button
                aria-pressed={p.size.value === option.value}
                className={`h-8 rounded-full border px-3 text-[13px] ${
                  p.size.enabled
                    ? p.size.value === option.value
                      ? "border-teal-700 bg-teal-700 font-bold text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    : "border-slate-200 bg-slate-50 text-slate-400"
                }`}
                disabled={!p.size.enabled}
                key={option.value}
                onClick={() => p.size.setValue((current) => (current === option.value ? "" : option.value))}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="rounded-md bg-slate-50 px-2.5 py-2 text-xs leading-5 text-slate-600">
            {p.size.enabled
              ? "공공 인허가 소재지 면적(㎡)을 평으로 환산한 구간입니다. 면적 미확인 리드는 구간 필터에서 제외됩니다."
              : "매장 면적(평) 정보를 아직 수집하지 않아 이 필터는 준비 중입니다. 인허가 면적이 쌓이면 평 구간으로 거를 수 있습니다. (1평 = 3.3058㎡)"}
          </p>
        </div>
      ) : null}

      {openKey === "date" ? (
        <div className="space-y-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-300">
            {[
              ["", "전체"],
              ["7", "7일"],
              ["30", "30일"],
              ["90", "90일"]
            ].map(([days, label]) => (
              <button
                aria-pressed={p.date.preset === days}
                className={`h-[34px] flex-1 text-xs transition ${p.date.preset === days ? "bg-teal-700 font-bold text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
                key={label}
                onClick={() => p.date.onPreset(days ? Number(days) : 0)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[11px] font-black text-slate-500">기간 직접</p>
          <div className="flex items-center gap-1.5">
            <input aria-label="인허가일 시작" className="h-8 min-w-0 flex-1 rounded-md border border-slate-300 px-2 text-xs" onChange={(event) => p.date.setStartDraft(event.target.value)} type="date" value={p.date.draft.start} />
            <span className="text-xs text-slate-400">~</span>
            <input aria-label="인허가일 끝" className="h-8 min-w-0 flex-1 rounded-md border border-slate-300 px-2 text-xs" onChange={(event) => p.date.setEndDraft(event.target.value)} type="date" value={p.date.draft.end} />
          </div>
          <button
            className="h-8 w-full rounded-md border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            disabled={p.date.draft.start === p.date.applied.start && p.date.draft.end === p.date.applied.end}
            onClick={p.date.onApply}
            type="button"
          >
            이 기간으로 조회
          </button>
        </div>
      ) : null}

      {openKey === "stage" ? (
        <div className="max-h-[300px] overflow-auto">
          {LEAD_STAGE_OPTIONS.map((option) => (
            <label className={checkRow} key={option.value}>
              <input
                checked={splitMultiFilter(p.stage.value).includes(option.value)}
                className={checkbox}
                onChange={() => p.stage.setValue((current) => toggleMultiFilter(current, option.value))}
                type="checkbox"
              />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              <span className="text-xs text-slate-500 tabular-nums">{(p.stage.counts.get(option.value) || 0).toLocaleString()}</span>
            </label>
          ))}
        </div>
      ) : null}

      {openKey === "more" ? (
        <div className="space-y-1">
          <label className={checkRow}>
            <input checked={p.more.excludeClosedStores} className={checkbox} onChange={() => p.more.setExcludeClosedStores((value) => !value)} type="checkbox" />
            이탈 거래처 제외
          </label>
          <label className={checkRow}>
            <input checked={p.more.showTerminatedStores} className={checkbox} onChange={() => p.more.setShowTerminatedStores((value) => !value)} type="checkbox" />
            거래 종료 거래처 보기
          </label>
          <label className={checkRow}>
            <input checked={p.more.showDismissed} className={checkbox} onChange={() => p.more.setShowDismissed((value) => !value)} type="checkbox" />
            숨김 리드 보기
          </label>
          <label className={checkRow}>
            <input checked={p.more.showClosed} className={checkbox} onChange={(event) => p.more.setShowClosed(event.target.checked)} type="checkbox" />
            폐업 리드 포함
          </label>
          {p.more.showOutsideSalesAreaChoice ? (
            <label className={checkRow}>
              <input checked={p.more.showOutsideSalesArea} className={checkbox} onChange={(event) => p.more.setShowOutsideSalesArea(event.target.checked)} type="checkbox" />
              영업 지역 밖도 보기
            </label>
          ) : null}
          <div className="flex items-center gap-1.5 pt-1">
            <select
              aria-label="거래처 등급"
              className="h-8 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-xs"
              onChange={(event) => p.more.setGrade(event.target.value)}
              value={p.more.gradeFilter}
            >
              {p.more.gradeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} {option.count}곳
                </option>
              ))}
            </select>
            <button className="h-8 shrink-0 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50" onClick={p.more.onFocusOrigin} title="물류 출발지로 지도 이동" type="button">
              출발지 보기
            </button>
          </div>
          <div className="mt-1.5 border-t border-slate-100 pt-2 text-xs text-slate-500">저장한 필터</div>
          {p.presets.enabled ? (
            p.presets.list.length ? (
              <div className="flex flex-wrap gap-1.5">
                {p.presets.list.map((preset) => (
                  <span className={`inline-flex items-center rounded-full text-xs ${p.presets.selectedId === preset.id ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-700"}`} key={preset.id}>
                    <button className="px-2.5 py-1" onClick={() => p.presets.onApply(preset.id)} type="button">{preset.name}</button>
                    {p.presets.selectedId === preset.id ? (
                      <button
                        aria-label={`${preset.name} 삭제`}
                        className="grid h-6 w-6 place-items-center rounded-full hover:bg-teal-800 disabled:opacity-40"
                        disabled={p.presets.busy}
                        onClick={p.presets.onRemove}
                        type="button"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    ) : null}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">아직 저장한 필터가 없습니다.</p>
            )
          ) : (
            <p className="text-xs text-slate-400">필터 저장 기능이 꺼져 있습니다.</p>
          )}
          <p className="pt-1 text-[11px] text-slate-500">{p.more.summary}</p>
        </div>
      ) : null}

      <div className="mt-3 flex gap-1.5">
        {p.presets.enabled ? (
          <button
            className="h-9 flex-1 rounded-lg border border-slate-300 bg-white text-[13px] font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            disabled={p.presets.busy}
            onClick={p.presets.onSave}
            type="button"
          >
            이 조건 저장
          </button>
        ) : null}
        <button className="h-9 flex-1 rounded-lg bg-teal-700 text-[13px] font-bold text-white hover:bg-teal-800" onClick={p.onClose} type="button">
          적용
        </button>
      </div>
    </div>
  );
}

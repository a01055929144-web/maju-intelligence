"use client";

import { ChevronDown, Edit3 } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { RowNumber, rowNumberWidthClass } from "@/components/ui/row-number";

/**
 * CC-48-3b · CC-57: 거래처·신규·영업 목록이 같이 쓰는 행. 왼쪽 열 = `[선택][순번]`, 오른쪽 열 = 1줄 `상호명 … [단계 칩] [연필]` + 2줄 `[배지] [채널 아이콘(K N G·연락)] 부가 글`(아이콘이 오른쪽 끝으로 밀리지 않게 왼쪽부터).
 * 상호명은 2줄까지 줄바꿈(잘라 버리지 않음), 2줄은 상호명 시작과 같은 자리에서 시작한다.
 * 행 전체가 "선택"을 누르는 곳(상호 버튼을 행 전체로 늘림). 연필은 1줄 맨 끝 자기 칸(단계 칩과 겹치지 않음)에서 hover·포커스 때만 보인다(터치 화면은 칸째 숨김 — 상세는 빠른 카드의 "상세 열기").
 */
export function MapListRow({
  badges,
  checkbox,
  editLabel,
  error,
  icons,
  index,
  itemRef,
  name,
  nameTitle,
  onEdit,
  onSelect,
  selected,
  stage,
  subText,
  subTitle,
  total
}: {
  readonly badges?: ReactNode;
  readonly checkbox?: ReactNode;
  readonly editLabel: string;
  readonly error?: string;
  readonly icons?: ReactNode;
  readonly index: number;
  readonly itemRef?: Ref<HTMLDivElement>;
  readonly name: string;
  readonly nameTitle?: string;
  readonly onEdit: () => void;
  readonly onSelect: () => void;
  readonly selected: boolean;
  readonly stage?: ReactNode;
  readonly subText: ReactNode;
  /** 2줄 부가 글이 줄여 보여 준 것일 때 전체 글(마우스를 올리면 보임). */
  readonly subTitle?: string;
  readonly total: number;
}) {
  return (
    <div
      className={`group relative flex items-start gap-1.5 border-b border-slate-100 px-2.5 py-1 transition hover:bg-slate-50 ${selected ? "bg-teal-50 shadow-[inset_4px_0_0_#0f766e] ring-1 ring-inset ring-teal-200" : ""}`}
      ref={itemRef}
    >
      <div className="relative z-10 flex shrink-0 items-center gap-1.5 pt-[3px]">
        {checkbox}
        <RowNumber className={`${rowNumberWidthClass(total)} shrink-0`} value={index + 1} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start gap-1.5">
          <button className="line-clamp-2 min-w-0 flex-1 break-keep text-left text-sm font-black leading-5 text-slate-950 after:absolute after:inset-0 after:content-['']" onClick={onSelect} title={nameTitle ?? name} type="button">{name}</button>
          {stage ? <span className="relative z-10 shrink-0">{stage}</span> : null}
          <span className="relative z-20 w-5 shrink-0 [@media(pointer:coarse)]:hidden">
            <button
              aria-label={editLabel}
              className="grid h-5 w-5 place-items-center rounded bg-white text-slate-500 opacity-0 shadow-sm ring-1 ring-slate-200 hover:text-teal-700 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
              onClick={onEdit}
              title="상세 열기 · 편집"
              type="button"
            >
              <Edit3 className="h-3 w-3" />
            </button>
          </span>
        </div>
        {error ? <p className="text-[11px] font-bold text-rose-700" role="alert">{error}</p> : null}
        <div className="flex min-h-6 min-w-0 items-center gap-1.5">
          {badges}
          {icons ? <span className="relative z-10 flex shrink-0">{icons}</span> : null}
          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-500" title={subTitle}>{subText}</span>
        </div>
      </div>
    </div>
  );
}

/** 단계 칩: 글자 폭만큼(최대 64px)만 차지하는 선택 상자 + 작은 ▾. 누르면 같은 선택 메뉴. */
export function StageChipSelect({ children, label, onChange, value }: { readonly children: ReactNode; readonly label: string; readonly onChange: (value: string) => void; readonly value: string }) {
  return (
    <span className="relative inline-flex items-center">
      <select
        aria-label={label}
        className="h-6 w-auto max-w-16 cursor-pointer appearance-none truncate rounded-full border border-slate-300 bg-white pl-1.5 pr-4 text-[11px] font-bold text-slate-800 [@media(pointer:coarse)]:h-8"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-1 h-3 w-3 text-slate-500" />
    </span>
  );
}

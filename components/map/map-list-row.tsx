"use client";

import { Edit3 } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { RowNumber, rowNumberWidthClass } from "@/components/ui/row-number";

/**
 * CC-48-3: 거래처·신규·영업 목록이 같이 쓰는 한 줄 부품(2줄 행, 64px 이하).
 * 행 전체가 "선택" 누르는 곳(상호 버튼을 행 전체로 늘림, 44px 이상). 1줄 `[선택][순번] 상호명 · 배지 … [단계 칩][연필]`, 2줄 `부가 글 … [채널 아이콘]`. 연필은 행에 올리거나 포커스할 때만 보인다(터치 화면은 항상).
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
  readonly total: number;
}) {
  return (
    <div
      className={`group relative border-b border-slate-100 px-2.5 py-1 transition hover:bg-slate-50 ${selected ? "bg-teal-50 shadow-[inset_4px_0_0_#0f766e] ring-1 ring-inset ring-teal-200" : ""}`}
      ref={itemRef}
    >
      <div className="flex min-h-[26px] min-w-0 items-center gap-1.5">
        {checkbox ? <span className="relative z-10 flex">{checkbox}</span> : null}
        <RowNumber className={`${rowNumberWidthClass(total)} shrink-0`} value={index + 1} />
        <button className="min-w-0 truncate text-left text-sm font-black text-slate-950 after:absolute after:inset-0 after:content-['']" onClick={onSelect} title={nameTitle ?? name} type="button">{name}</button>
        {badges}
        <span className="relative z-10 ml-auto flex shrink-0 items-center gap-1">
          {stage}
          <button
            aria-label={editLabel}
            className="grid h-6 w-6 place-items-center rounded-md text-slate-400 transition hover:bg-white hover:text-teal-700 hover:shadow-sm focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
            onClick={onEdit}
            title="상세 열기 · 편집"
            type="button"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>
      {error ? <p className="text-[11px] font-bold text-rose-700" role="alert">{error}</p> : null}
      <div className="flex min-h-[26px] min-w-0 items-center gap-1.5 pl-1">
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-500">{subText}</span>
        {icons ? <span className="relative z-10 flex">{icons}</span> : null}
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import { InfoTooltip } from "@/components/info-tooltip";

/**
 * 카드 상단에 반복적으로 쓰이는 (eyebrow) + 제목 + 설명 헤더를 통일합니다.
 * 설명은 항상 보이는 문단 대신 아이콘 마우스오버 툴팁으로 표시해 카드 높이를 줄입니다.
 */
export function SectionHeader({
  badge,
  description,
  eyebrow,
  title
}: {
  readonly badge?: ReactNode;
  readonly description: string;
  readonly eyebrow?: string;
  readonly title: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3.5">
      <div className="min-w-0">
        {eyebrow ? <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{eyebrow}</p> : null}
        <div className={`flex min-w-0 items-center gap-1.5 ${eyebrow ? "mt-1" : ""}`}>
          <h2 className={`truncate font-bold tracking-[-0.02em] text-slate-950 ${eyebrow ? "text-lg" : "text-sm"}`}>{title}</h2>
          <InfoTooltip size={eyebrow ? "lg" : "md"} text={description} />
        </div>
      </div>
      {badge}
    </div>
  );
}

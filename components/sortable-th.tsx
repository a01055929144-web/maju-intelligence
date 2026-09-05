"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

/** useTableSort와 짝을 이루는 클릭 가능한 <th>. 여러 표에서 동일한 모양(정렬 화살표)으로 재사용합니다. */
export function SortableTh({
  active,
  className = "",
  direction,
  label,
  onClick,
  title
}: {
  readonly active: boolean;
  readonly className?: string;
  readonly direction: "asc" | "desc";
  readonly label: string;
  readonly onClick: () => void;
  readonly title?: string;
}) {
  // className은 각 표의 기존 <th> 스타일(테두리·패딩·정렬)을 그대로 넘겨받습니다 — 표마다
  // 테두리 유무·패딩이 달라 여기서 기본값을 강제하면 표마다 어긋나 보일 수 있습니다.
  return (
    <th className={className} title={title}>
      <button className={`inline-flex items-center gap-1 hover:text-slate-900 ${active ? "text-slate-900" : ""}`} onClick={onClick} type="button">
        {label}
        {active ? direction === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 text-slate-300" />}
      </button>
    </th>
  );
}

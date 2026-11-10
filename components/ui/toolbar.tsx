import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** 편집 화면 상단 한 줄 툴바: 왼쪽(제목·상태) / 가운데(보기 전환) / 오른쪽(버튼). 주 버튼은 한 개만 색 채움(Button 기본), 나머지는 variant="outline". */
export function Toolbar({ center, className, left, right }: { center?: ReactNode; className?: string; left: ReactNode; right?: ReactNode }) {
  return (
    <div className={cn("flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-2 [&_button]:min-h-[44px]", className)} role="toolbar">
      <div className="flex min-w-0 flex-1 items-center gap-2">{left}</div>
      {center ? <div className="flex shrink-0 items-center max-sm:hidden">{center}</div> : null}
      {right ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{right}</div> : null}
    </div>
  );
}

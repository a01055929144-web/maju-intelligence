import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** 공용 제목줄: 제목(PC 20px·휴대폰 16px)·설명 12px·오른쪽 버튼 자리. 고객사·매장·관리자 셸이 같이 쓴다. */
export function PageHeader({ actions, className, description, title }: { actions?: ReactNode; className?: string; description?: ReactNode; title: ReactNode }) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-2", className)}>
      <div className="min-w-0">
        <h1 className="truncate text-base font-bold sm:text-xl">{title}</h1>
        {description ? <p className="text-xs text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

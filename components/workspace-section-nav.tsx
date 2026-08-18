import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export type WorkspaceSectionNavItem = {
  readonly active?: boolean;
  readonly badge?: string;
  readonly description: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly label: string;
};

type WorkspaceSectionNavProps = {
  readonly eyebrow?: string;
  readonly items: WorkspaceSectionNavItem[];
  readonly title?: string;
};

/**
 * 작업 구분 내비게이션입니다. 왼쪽 세로 컬럼으로 두면 작업 공간이 좁아 답답하다는
 * 피드백에 따라 페이지 상단의 가로 행(탭 스트립)으로 배치합니다.
 */
export function WorkspaceSectionNav({ eyebrow = "탭", items }: WorkspaceSectionNavProps) {
  return (
    <nav className="mb-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1.5 shadow-[0_4px_18px_rgba(15,23,42,0.035)]">
      <span className="shrink-0 px-2 text-[11px] font-black uppercase tracking-wide text-slate-500">{eyebrow}</span>
      {items.map((item) => {
        const Icon = item.icon;
        const selected = Boolean(item.active);

        return (
          <Link
            className={`flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-black transition ${
              selected
                ? "border-slate-950 bg-slate-950 text-white shadow-[0_8px_18px_rgba(15,23,42,0.12)]"
                : "border-transparent bg-white text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950"
            }`}
            href={item.href}
            key={item.label}
            title={item.description}
          >
            <Icon className={`h-4 w-4 shrink-0 ${selected ? "text-white" : "text-slate-400"}`} />
            <span>{item.label}</span>
            {item.badge ? (
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ring-1 ring-inset ${
                  selected ? "bg-white/95 text-slate-950 ring-white/70" : "bg-slate-50 text-slate-600 ring-slate-200"
                }`}
              >
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

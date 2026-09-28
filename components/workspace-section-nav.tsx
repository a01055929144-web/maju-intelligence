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
export function WorkspaceSectionNav({ eyebrow = "페이지", items }: WorkspaceSectionNavProps) {
  return (
    <nav className="maju-toolbar-scroll mb-4 flex flex-nowrap items-center gap-1 overflow-x-auto border-b border-slate-200 bg-transparent px-0.5" aria-label={`${eyebrow} 전환`}>
      <span className="mr-2 hidden shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 lg:inline">{eyebrow}</span>
      {items.map((item) => {
        const Icon = item.icon;
        const selected = Boolean(item.active);

        return (
          <a
            className={`relative flex h-11 shrink-0 items-center gap-2 px-3 text-sm font-semibold transition ${
              selected
                ? "text-teal-800 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-teal-600"
                : "text-slate-500 hover:bg-slate-100/70 hover:text-slate-950"
            }`}
            href={item.href}
            key={item.label}
            title={item.description}
          >
            <Icon className={`h-4 w-4 shrink-0 ${selected ? "text-teal-700" : "text-slate-400"}`} />
            <span>{item.label}</span>
            {item.badge ? (
              <span
                className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                  selected ? "bg-teal-50 text-teal-800 ring-teal-200" : "bg-slate-50 text-slate-600 ring-slate-200"
                }`}
              >
                {item.badge}
              </span>
            ) : null}
          </a>
        );
      })}
    </nav>
  );
}

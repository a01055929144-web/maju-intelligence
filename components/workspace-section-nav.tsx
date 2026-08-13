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
  readonly title: string;
};

export function WorkspaceSectionNav({ eyebrow = "작업 구분", items, title }: WorkspaceSectionNavProps) {
  return (
    <aside className="maju-section-card overflow-hidden">
      <div className="border-b border-slate-200/80 bg-slate-50/80 px-4 py-3">
        <p className="maju-muted-label">{eyebrow}</p>
        <div className="mt-1 flex min-w-0 items-center justify-between gap-3">
          <h2 className="min-w-0 flex-1 truncate text-sm font-black text-slate-950">{title}</h2>
          <span className="shrink-0 rounded-md bg-white px-2 py-1 text-[10px] font-black text-slate-500 ring-1 ring-inset ring-slate-200">
            {items.length}개
          </span>
        </div>
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-1">
        {items.map((item) => {
          const Icon = item.icon;
          const selected = Boolean(item.active);

          return (
            <Link
              className={`group relative flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                selected
                  ? "border-teal-200 bg-teal-50 text-teal-950 shadow-[0_8px_18px_rgba(15,118,110,0.08)]"
                  : "border-slate-200 bg-white text-slate-700 hover:border-teal-200 hover:bg-teal-50/60 hover:text-slate-950"
              }`}
              href={item.href}
              key={item.label}
              title={item.description}
            >
              {selected ? <span className="absolute inset-y-2.5 left-0 w-1 rounded-r-full bg-teal-600" /> : null}
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ring-1 ring-inset ${
                selected ? "bg-white text-teal-700 ring-teal-100" : "bg-slate-50 text-slate-400 ring-slate-100 group-hover:bg-white group-hover:text-teal-700"
              }`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-2 leading-none">
                <span className="truncate text-sm font-black">{item.label}</span>
                {item.badge ? (
                  <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black ring-1 ring-inset ${
                    selected ? "bg-white text-teal-700 ring-teal-100" : "bg-slate-50 text-slate-600 ring-slate-200"
                  }`}>
                    {item.badge}
                  </span>
                ) : null}
              </span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}

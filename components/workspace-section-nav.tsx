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
    <aside className="maju-section-card p-3">
      <div className="mb-3 px-1">
        <p className="maju-muted-label">{eyebrow}</p>
        <h2 className="mt-1 text-sm font-black text-slate-950">{title}</h2>
      </div>
      <div className="grid gap-2">
        {items.map((item) => {
          const Icon = item.icon;
          const selected = Boolean(item.active);

          return (
            <Link
              className={`maju-nav-item h-auto min-h-14 w-full items-start rounded-lg px-3 py-3 text-left ${
                selected ? "maju-nav-item-active" : "maju-nav-item-idle bg-white ring-1 ring-inset ring-slate-100"
              }`}
              href={item.href}
              key={item.label}
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${selected ? "text-teal-700" : "text-slate-400"}`} />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-black">{item.label}</span>
                  {item.badge ? (
                    <span className="shrink-0 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-black text-teal-700 ring-1 ring-inset ring-teal-100">
                      {item.badge}
                    </span>
                  ) : null}
                </span>
                <span className={`mt-1 block text-xs font-bold leading-5 ${selected ? "text-teal-800/75" : "text-slate-500"}`}>
                  {item.description}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { MouseEventHandler, ReactNode } from "react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

export type AppSidebarItem = {
  readonly active: string;
  readonly badge?: string;
  readonly children?: readonly AppSidebarItem[];
  readonly href: string;
  readonly icon: LucideIcon;
  readonly label: string;
};

export type AppSidebarGroup = {
  readonly label: string;
  readonly items: readonly AppSidebarItem[];
};

type AppSidebarProps = {
  readonly active?: string;
  readonly brand: string;
  readonly context: string;
  readonly groups: readonly AppSidebarGroup[];
  readonly homeHref: string;
  readonly previewCompanyId?: string;
  readonly renderFooter?: (collapsed: boolean) => ReactNode;
  readonly variant: "admin" | "customer";
};

export function AppSidebar({ active, brand, context, groups, homeHref, previewCompanyId, renderFooter, variant }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentSearch, setCurrentSearch] = useState("");
  const pathname = usePathname();
  const admin = variant === "admin";
  const asideTone = admin ? "border-violet-950 bg-[#2E1065]" : "border-slate-800 bg-[#111827]";
  const accentTone = admin ? "bg-violet-300 text-violet-950" : "bg-teal-600 text-white";

  useEffect(() => {
    const syncSearch = () => setCurrentSearch(window.location.search);
    syncSearch();
    window.addEventListener("popstate", syncSearch);
    return () => window.removeEventListener("popstate", syncSearch);
  }, [pathname]);

  const scopedHref = (href: string) => {
    if (!previewCompanyId) return href;
    if (href.startsWith("/dashboard/settings")) return "/admin/companies";

    const [hrefWithoutHash, hash = ""] = href.split("#");
    const [path, query = ""] = hrefWithoutHash.split("?");
    const params = new URLSearchParams(query);
    params.set("companyId", previewCompanyId);
    return `${path}?${params.toString()}${hash ? `#${hash}` : ""}`;
  };

  return (
    <aside className={`shrink-0 border-b text-white transition-[width] duration-75 lg:sticky lg:top-0 lg:h-dvh lg:overflow-hidden lg:border-b-0 lg:border-r ${collapsed ? "lg:w-[72px]" : "lg:w-[256px]"} ${asideTone}`}>
      <div className="flex h-full flex-col">
        <div className={`border-b border-white/10 ${collapsed ? "flex flex-col items-center gap-2 px-2 py-3" : "px-4 py-4 xl:flex xl:h-[72px] xl:items-center xl:py-0"}`}>
          {collapsed ? (
            <>
              <Link className="flex items-center justify-center" href={scopedHref(homeHref)} title={brand}>
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold ${accentTone}`}>M</span>
              </Link>
              <button aria-label="사이드바 펼치기" className="hidden h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-white/70 transition hover:bg-white/10 hover:text-white lg:inline-flex" onClick={() => setCollapsed(false)} type="button">
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            </>
          ) : (
            <div className="flex w-full items-center justify-between gap-2">
              <Link className="flex min-w-0 items-center gap-3" href={scopedHref(homeHref)}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${accentTone}`}>M</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{brand}</span>
                  <span className="block truncate text-xs font-medium text-white/60">{context}</span>
                </span>
              </Link>
              <button aria-label="사이드바 접기" className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 text-white/70 transition hover:bg-white/10 hover:text-white lg:inline-flex" onClick={() => setCollapsed(true)} type="button">
                <PanelLeftClose className="h-4 w-4" />
              </button>
              <button aria-expanded={mobileMenuOpen} aria-label={mobileMenuOpen ? "메뉴 닫기" : "메뉴 열기"} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/15 text-white/70 transition hover:bg-white/10 hover:text-white lg:hidden" onClick={() => setMobileMenuOpen((value) => !value)} type="button">
                {mobileMenuOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
              </button>
            </div>
          )}
        </div>

        <nav aria-label={admin ? "관리자 메뉴" : "주요 작업공간"} className={`${mobileMenuOpen ? "flex" : "hidden"} maju-sidebar-scroll min-h-0 max-h-[min(60dvh,32rem)] flex-1 flex-col overflow-y-auto overscroll-contain px-3 pb-3 pt-3 lg:flex lg:max-h-none`}>
          {groups.map((group) => {
            const groupSelected = group.items.some((item) => isItemSelected(item, pathname, currentSearch, active));
            return (
              <details className={`group border-b border-white/10 py-3 last:border-b-0 ${group.label === "설정" ? "mt-auto" : ""}`} key={group.label} open={collapsed || groupSelected ? true : undefined}>
                {!collapsed ? (
                  <summary className="mb-2 flex cursor-pointer list-none items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60">
                    <span>{group.label}</span><span className="h-px min-w-0 flex-1 bg-white/10" /><ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
                  </summary>
                ) : null}
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <SidebarItem activeFallback={active} collapsed={collapsed} currentSearch={currentSearch} item={item} key={`${group.label}-${item.label}`} pathname={pathname} scopedHref={scopedHref} setCurrentSearch={setCurrentSearch} variant={variant} />
                  ))}
                </div>
              </details>
            );
          })}
        </nav>

        {renderFooter ? <div className={`${mobileMenuOpen ? "block" : "hidden"} border-t border-white/10 p-3 lg:block`}>{renderFooter(collapsed)}</div> : null}
      </div>
    </aside>
  );
}

function SidebarItem({ activeFallback, collapsed, currentSearch, item, pathname, scopedHref, setCurrentSearch, variant }: {
  readonly activeFallback?: string;
  readonly collapsed: boolean;
  readonly currentSearch: string;
  readonly item: AppSidebarItem;
  readonly pathname: string | null;
  readonly scopedHref: (href: string) => string;
  readonly setCurrentSearch: (value: string) => void;
  readonly variant: "admin" | "customer";
}) {
  const selected = isItemSelected(item, pathname, currentSearch, activeFallback);
  if (item.children?.length) {
    const firstChild = item.children[0];
    if (collapsed) return <SidebarLink collapsed href={scopedHref(firstChild.href)} item={item} selected={selected} variant={variant} />;
    return (
      <div>
        <div className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-bold ${selected ? "text-white" : "text-white/70"}`}><item.icon className="h-4 w-4" /><span className="min-w-0 flex-1 truncate">{item.label}</span></div>
        <div className="ml-[26px] space-y-1 border-l border-white/10 pl-2.5">{item.children.map((child) => <SidebarItem activeFallback={activeFallback} collapsed={false} currentSearch={currentSearch} item={child} key={child.href} pathname={pathname} scopedHref={scopedHref} setCurrentSearch={setCurrentSearch} variant={variant} />)}</div>
      </div>
    );
  }
  const href = scopedHref(item.href);
  return <SidebarLink collapsed={collapsed} href={href} item={item} onClick={(event) => {
    setCurrentSearch(href.includes("?") ? `?${href.split("?")[1]}` : "");
    if (href.startsWith("/leads?")) { event.preventDefault(); window.location.assign(href); }
  }} selected={selected} variant={variant} />;
}

function SidebarLink({ collapsed, href, item, onClick, selected, variant }: { readonly collapsed: boolean; readonly href: string; readonly item: AppSidebarItem; readonly onClick?: MouseEventHandler<HTMLAnchorElement>; readonly selected: boolean; readonly variant: "admin" | "customer" }) {
  const activeTone = variant === "admin" ? "bg-white/15 text-white ring-1 ring-inset ring-white/15" : "maju-nav-item-active";
  return (
    <Link aria-current={selected ? "page" : undefined} className={`maju-nav-item relative ${collapsed ? "justify-center" : ""} ${selected ? activeTone : "maju-nav-item-idle"}`} href={href} onClick={onClick} title={collapsed ? item.label : undefined}>
      {selected ? <span className="absolute left-0 top-2 h-6 w-1 rounded-r-full bg-white/80" /> : null}
      <item.icon className="h-4 w-4" />
      {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
      {!collapsed && item.badge ? <Badge className="bg-white px-1.5 py-0 text-xs text-slate-700">{item.badge}</Badge> : null}
    </Link>
  );
}

function isItemSelected(item: AppSidebarItem, pathname: string | null, currentSearch: string, activeFallback?: string): boolean {
  if (item.children?.length) return item.children.some((child) => isItemSelected(child, pathname, currentSearch, activeFallback));
  if (!pathname) return activeFallback === item.active;
  const [hrefWithoutHash] = item.href.split("#");
  const [hrefPath = "/", hrefQuery = ""] = hrefWithoutHash.split("?");
  if (hrefPath === "/" ? pathname !== "/" : pathname !== hrefPath && !pathname.startsWith(`${hrefPath}/`)) return false;
  const expected = new URLSearchParams(hrefQuery);
  const current = new URLSearchParams(currentSearch);
  return !expected.size || Array.from(expected.entries()).every(([key, value]) => current.get(key) === value);
}

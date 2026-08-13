"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  LogOut,
  MapPinned,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Settings
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { workspaceRoleLabels, normalizeWorkspaceRole } from "@/lib/workspace";
import { customerNavigationGroups, CustomerWorkspaceKey, flattenCustomerNavigationItems, getCustomerWorkspaceLabel } from "@/lib/customer-navigation";

type CustomerAppShellProps = {
  readonly active: CustomerWorkspaceKey;
  readonly children: ReactNode;
  readonly companyName: string;
  readonly fullBleed?: boolean;
  readonly hidePageTitle?: boolean;
  readonly mode?: "admin-preview" | "customer";
  readonly previewCompanyId?: string;
  readonly rightAction?: ReactNode;
  readonly title: string;
  readonly subtitle?: string;
  readonly userName?: string;
  readonly workspaceRole?: string;
};

export function CustomerAppShell({ active, children, companyName, fullBleed = false, hidePageTitle = false, mode = "customer", previewCompanyId, rightAction, subtitle, title, userName, workspaceRole }: CustomerAppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [resolvedWorkspaceRole, setResolvedWorkspaceRole] = useState(workspaceRole);
  const pathname = usePathname();
  const normalizedRole = normalizeWorkspaceRole(resolvedWorkspaceRole);
  const roleLabel = workspaceRoleLabels[normalizedRole];
  const workspaceLabel = mode === "admin-preview" ? "관리자 미리보기" : "지도 운영 화면";
  const workspaceBadgeClassName = mode === "admin-preview" ? "bg-amber-100 text-amber-800" : "bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-200";
  const settingsHref = mode === "admin-preview" ? "/admin/companies" : "/dashboard/settings";
  const settingsLabel = mode === "admin-preview" ? "고객사 관리" : "출발지 설정";
  const activeWorkspaceLabel = getActiveWorkspaceLabel(active);
  const scopedHref = (href: string) => {
    if (mode !== "admin-preview" || !previewCompanyId) return href;
    if (href === "/dashboard/settings") return "/admin/companies";

    const [path, query = ""] = href.split("?");
    const params = new URLSearchParams(query);
    params.set("companyId", previewCompanyId);
    const nextQuery = params.toString();

    return `${path}${nextQuery ? `?${nextQuery}` : ""}`;
  };
  const visibleNavigationGroups = customerNavigationGroups;
  const activeNavigationItem = flattenCustomerNavigationItems(visibleNavigationGroups).find((item) => item.active === active);

  useEffect(() => {
    if (workspaceRole || mode !== "customer") return;

    let mounted = true;
    fetch("/api/customer/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (mounted && payload?.session?.workspaceRole) setResolvedWorkspaceRole(payload.session.workspaceRole);
      })
      .catch(() => null);

    return () => {
      mounted = false;
    };
  }, [mode, workspaceRole]);

  return (
    <main className={`maju-app-bg min-h-screen text-slate-950 ${fullBleed ? "xl:h-dvh xl:overflow-hidden" : ""}`}>
      <div className={`grid min-h-screen transition-[grid-template-columns] duration-75 ${fullBleed ? "xl:h-full" : ""} ${collapsed ? "lg:grid-cols-[72px_minmax(0,1fr)]" : "lg:grid-cols-[248px_minmax(0,1fr)]"}`}>
        <aside className="border-b border-slate-200 bg-white shadow-[8px_0_24px_rgba(15,23,42,0.04)] lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col">
            <div className="border-b border-slate-200/80 p-4">
              <div className={`flex items-center gap-2 ${collapsed ? "justify-center" : "justify-between"}`}>
                <Link className={`flex min-w-0 items-center gap-3 ${collapsed ? "justify-center" : ""}`} href={scopedHref("/dashboard")}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-teal-700 text-sm font-black text-white shadow-[0_6px_14px_rgba(15,118,110,0.16)]">M</span>
                  {!collapsed ? (
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black">MAJU Map OS</span>
                      <span className="block truncate text-xs font-bold text-slate-500">{companyName}</span>
                    </span>
                  ) : null}
                </Link>
                <button
                  aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
                  className="maju-button-secondary hidden h-8 w-8 shrink-0 px-0 lg:inline-flex"
                  onClick={() => setCollapsed((value) => !value)}
                  type="button"
                >
                  {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <nav className="flex-1 space-y-4 overflow-auto p-3">
              {visibleNavigationGroups.map((group) => (
                <div key={group.label}>
                  {!collapsed ? <p className="mb-2 px-2 text-[11px] font-black uppercase tracking-wide text-slate-400">{group.label}</p> : null}
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      if (item.children && item.children.length) {
                        const groupSelected = item.children.some((child) => isCurrentNavItem(pathname, child.href) || (!pathname && active === child.active));
                        if (collapsed) {
                          const firstChild = item.children[0];
                          return (
                            <Link
                              key={`${group.label}-${item.label}`}
                              className={`maju-nav-item relative justify-center ${groupSelected ? "maju-nav-item-active" : "maju-nav-item-idle"}`}
                              href={scopedHref(firstChild.href)}
                              title={item.label}
                            >
                              {groupSelected ? <span className="absolute left-0 top-2 h-6 w-1 rounded-r-full bg-teal-600" /> : null}
                              <item.icon className={`h-4 w-4 ${groupSelected ? "text-teal-700" : "text-slate-400"}`} />
                            </Link>
                          );
                        }
                        return (
                          <div key={`${group.label}-${item.label}`}>
                            <div className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-black ${groupSelected ? "text-teal-700" : "text-slate-700"}`}>
                              <item.icon className={`h-4 w-4 ${groupSelected ? "text-teal-700" : "text-slate-400"}`} />
                              <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            </div>
                            <div className="ml-[26px] space-y-1 border-l border-slate-200 pl-2.5">
                              {item.children.map((child) => {
                                const childSelected = isCurrentNavItem(pathname, child.href) || (!pathname && active === child.active);
                                return (
                                  <Link
                                    key={`${group.label}-${item.label}-${child.label}`}
                                    className={`maju-nav-item relative py-1.5 text-[13px] ${childSelected ? "maju-nav-item-active" : "maju-nav-item-idle"}`}
                                    href={scopedHref(child.href)}
                                  >
                                    {childSelected ? <span className="absolute left-0 top-1.5 h-5 w-1 rounded-r-full bg-teal-600" /> : null}
                                    <span className="min-w-0 flex-1 truncate">{child.label}</span>
                                  </Link>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }

                      const selected = isCurrentNavItem(pathname, item.href) || (!pathname && active === item.active);
                      const itemHref = scopedHref(item.href);
                      return (
                        <Link
                          key={`${group.label}-${item.label}`}
                          className={`maju-nav-item relative ${collapsed ? "justify-center" : ""} ${
                            selected ? "maju-nav-item-active" : "maju-nav-item-idle"
                          }`}
                          href={itemHref}
                          title={collapsed ? item.label : undefined}
                        >
                          {selected ? <span className="absolute left-0 top-2 h-6 w-1 rounded-r-full bg-teal-600" /> : null}
                          <item.icon className={`h-4 w-4 ${selected ? "text-teal-700" : "text-slate-400"}`} />
                          {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
                          {!collapsed && item.badge ? <Badge className={selected ? "bg-white px-1.5 py-0 text-[10px] text-teal-700 ring-1 ring-inset ring-teal-200" : "bg-slate-100 px-1.5 py-0 text-[10px] text-slate-600 ring-1 ring-inset ring-slate-200"}>{item.badge}</Badge> : null}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            {!collapsed ? (
              <div className="border-t border-slate-200/80 bg-white p-3">
                <div className="rounded-lg border border-teal-100 bg-teal-50 p-3">
                  <p className="text-[11px] font-black uppercase tracking-wide text-teal-700">현재 작업</p>
                  <p className="mt-1 truncate text-sm font-black text-slate-950">{activeNavigationItem?.label || activeWorkspaceLabel}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] font-bold leading-5 text-slate-600">
                    {activeNavigationItem?.description || "지도에서 거래처 위치와 출발지 기준 업무를 이어갑니다."}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </aside>

        <section className={`min-w-0 ${fullBleed ? "xl:flex xl:h-full xl:flex-col" : ""}`}>
          <header className={`sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-white shadow-sm ${fullBleed ? "xl:static" : ""}`}>
            <div className={`flex flex-col gap-3 px-4 sm:px-6 xl:flex-row xl:items-center xl:justify-between ${hidePageTitle ? "py-2" : "py-4"}`}>
              {!hidePageTitle ? (
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge className={workspaceBadgeClassName}>{workspaceLabel}</Badge>
                    {mode === "customer" ? <Badge className="bg-white text-slate-700 ring-1 ring-inset ring-slate-200">{roleLabel}</Badge> : null}
                    {userName ? <span className="text-xs font-bold text-slate-500">{userName}님</span> : null}
                  </div>
                  <h1 className="truncate text-[24px] font-black tracking-normal text-slate-900">{title}</h1>
                  {subtitle ? <p className="mt-1 text-sm font-semibold text-slate-500">{subtitle}</p> : null}
                </div>
              ) : (
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <Badge className={workspaceBadgeClassName}>{workspaceLabel}</Badge>
                  <span className="text-sm font-black text-slate-900">{activeWorkspaceLabel}</span>
                  {userName ? <span className="text-xs font-bold text-slate-500">{userName}님</span> : null}
                </div>
              )}
              <div className={`flex max-w-full flex-wrap items-center gap-1.5 sm:gap-2 ${hidePageTitle ? "justify-start sm:justify-end xl:w-auto" : ""}`}>
                <Link
                  className="maju-button-secondary h-9 shrink-0 px-3 text-sm"
                  href={settingsHref}
                >
                  <MapPinned className="h-4 w-4" />
                  {settingsLabel}
                </Link>
                <Link
                  className="maju-button-blue h-9 shrink-0 px-3 text-sm"
                  href={scopedHref("/assistant")}
                >
                  <MessageSquareText className="h-4 w-4" />
                  AI 도우미
                </Link>
                {rightAction}
                {mode === "customer" ? <CustomerAccountActions /> : null}
              </div>
            </div>
          </header>

          {mode === "admin-preview" ? (
            <div className={`border-b border-amber-200 bg-amber-50/80 px-4 py-2.5 sm:px-6 ${fullBleed ? "shrink-0" : ""}`}>
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-black text-amber-900">관리자 미리보기 모드</p>
                  <p className="mt-0.5 text-xs font-bold leading-5 text-amber-800">
                    현재 화면은 고객사 운영 화면을 관리자 권한으로 확인하는 모드입니다. 계정, 권한, 고객사 생성·수정은 어드민에서 관리하세요.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Link
                    className="inline-flex h-8 items-center justify-center rounded-md bg-amber-900 px-3 text-xs font-black text-white transition hover:bg-amber-950"
                    href="/admin/companies"
                  >
                    고객사 관리로 돌아가기
                  </Link>
                  <Link
                    className="inline-flex h-8 items-center justify-center rounded-md border border-amber-200 bg-white px-3 text-xs font-black text-amber-900 transition hover:bg-amber-100"
                    href="/admin"
                  >
                    어드민 홈
                  </Link>
                </div>
              </div>
            </div>
          ) : null}

          <div className={fullBleed ? "flex flex-col px-3 py-2 sm:px-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:py-2" : "px-4 py-4 sm:px-6"}>{children}</div>
        </section>
      </div>
    </main>
  );
}

function CustomerAccountActions() {
  async function logout() {
    await fetch("/api/customer/logout", { method: "POST" });
    window.location.href = "/dashboard/login";
  }

  return (
    <button
      className="maju-button-secondary h-9 shrink-0 px-3 text-sm hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
      onClick={logout}
      type="button"
    >
      <LogOut className="h-4 w-4" />
      로그아웃
    </button>
  );
}

function isCurrentNavItem(pathname: string | null, href: string) {
  if (!pathname) return false;
  const hrefPath = href.split("?")[0] || "/";
  if (hrefPath === "/") return pathname === "/";
  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}

function getActiveWorkspaceLabel(active: CustomerAppShellProps["active"]) {
  return getCustomerWorkspaceLabel(active);
}

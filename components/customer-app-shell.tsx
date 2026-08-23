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
  Settings,
  Smartphone
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/info-tooltip";
import { workspaceRoleLabels, normalizeWorkspaceRole } from "@/lib/workspace";
import { customerNavigationGroups, CustomerWorkspaceKey, getCustomerWorkspaceLabel } from "@/lib/customer-navigation";

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
  const workspaceLabel = mode === "admin-preview" ? "관리자 미리보기" : "지도 OS";
  const workspaceBadgeClassName = mode === "admin-preview" ? "bg-amber-100 text-amber-800" : "bg-teal-700 text-white ring-1 ring-inset ring-teal-700";
  const settingsHref = mode === "admin-preview" ? "/admin/companies" : "/dashboard/settings";
  const settingsLabel = mode === "admin-preview" ? "고객사" : "출발지";
  const activeWorkspaceLabel = getActiveWorkspaceLabel(active);
  const compactMapHome = fullBleed && hidePageTitle;
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

  // xl:overflow-y-auto(hidden 대신) — 내부 패널들이 각자 자기 높이를 정확히 계산해 스크롤하는 게
  // 기본이지만, 콘텐츠가 예상보다 늘어나는 경우(새 버튼 줄 추가, 검색 결과가 많을 때 등)에 대비한
  // 안전망입니다. overflow-hidden이면 내부 계산이 어긋났을 때 그 초과분이 어떤 스크롤로도 닿지
  // 않는 채로 화면 밖에 잘려나가는데, auto로 두면 평소엔 티 안 나다가(내용이 딱 맞으면 스크롤바
  // 자체가 안 생김) 예외적으로 넘칠 때만 페이지 스크롤로 마지막 탈출구가 생깁니다(2026-08-23,
  // "스크롤이 안 되는 경우가 있다" 피드백 대응).
  return (
    <main className={`maju-app-bg min-h-screen text-slate-950 ${fullBleed ? "xl:h-dvh xl:overflow-y-auto" : ""}`}>
      {/* xl:grid-rows-[minmax(0,1fr)] — CSS Grid의 암묵적 행은 기본이 auto(내용 기준) 높이라, h-full을
          줘도 자식(section)의 내용이 부모보다 크면 행 자체가 늘어나 버립니다(2026-08-23, "스크롤이
          안 되는 경우가 있다" 피드백 — main의 overflow-hidden이 그 초과분을 화면 밖으로 그냥
          잘라버려서 어떤 스크롤로도 닿지 않는 영역이 생겼던 원인). minmax(0,1fr)로 행을 컨테이너
          높이에 고정해야 section이 실제로 h-full만큼만 받고, 그 안의 xl:overflow-y-auto가 넘치는
          내용을 스크롤로 보여줄 수 있습니다. */}
      <div className={`grid min-h-screen transition-[grid-template-columns] duration-75 ${fullBleed ? "xl:h-full xl:grid-rows-[minmax(0,1fr)]" : ""} ${collapsed ? "lg:grid-cols-[72px_minmax(0,1fr)]" : "lg:grid-cols-[256px_minmax(0,1fr)]"}`}>
        <aside className="border-b border-slate-200 bg-white shadow-[6px_0_22px_rgba(15,23,42,0.035)] lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col">
            <div className={`border-b border-slate-200/80 ${collapsed ? "flex flex-col items-center gap-2 px-2 py-3" : "px-4 py-4 xl:flex xl:h-[72px] xl:items-center xl:py-0"}`}>
              {collapsed ? (
                <>
                  <Link className="flex items-center justify-center" href={scopedHref("/dashboard")} title="MAJU Intelligence">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-teal-700 text-sm font-black text-white shadow-[0_8px_18px_rgba(15,118,110,0.16)]">M</span>
                  </Link>
                  <button
                    aria-label="사이드바 펼치기"
                    className="maju-button-secondary hidden h-8 w-8 shrink-0 px-0 lg:inline-flex"
                    onClick={() => setCollapsed((value) => !value)}
                    type="button"
                  >
                    <PanelLeftOpen className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <div className="flex w-full items-center justify-between gap-2">
                  <Link className="flex min-w-0 items-center gap-3" href={scopedHref("/dashboard")}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-teal-700 text-sm font-black text-white shadow-[0_8px_18px_rgba(15,118,110,0.16)]">M</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black">MAJU Intelligence</span>
                      <span className="block truncate text-xs font-bold text-slate-500">{companyName}</span>
                    </span>
                  </Link>
                  <button
                    aria-label="사이드바 접기"
                    className="maju-button-secondary hidden h-8 w-8 shrink-0 px-0 lg:inline-flex"
                    onClick={() => setCollapsed((value) => !value)}
                    type="button"
                  >
                    <PanelLeftClose className="h-4 w-4" />
                  </button>
                </div>
              )}
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
                              {groupSelected ? <span className="absolute left-0 top-2 h-6 w-1 rounded-r-full bg-white/80" /> : null}
                              <item.icon className={`h-4 w-4 ${groupSelected ? "text-white" : "text-slate-400"}`} />
                            </Link>
                          );
                        }
                        return (
                          <div key={`${group.label}-${item.label}`}>
                            <div className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-black ${groupSelected ? "text-slate-950" : "text-slate-700"}`}>
                              <item.icon className={`h-4 w-4 ${groupSelected ? "text-slate-900" : "text-slate-400"}`} />
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
                                    {childSelected ? <span className="absolute left-0 top-1.5 h-5 w-1 rounded-r-full bg-white/80" /> : null}
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
                          {selected ? <span className="absolute left-0 top-2 h-6 w-1 rounded-r-full bg-white/80" /> : null}
                          <item.icon className={`h-4 w-4 ${selected ? "text-white" : "text-slate-400"}`} />
                          {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
                          {!collapsed && item.badge ? <Badge className={selected ? "bg-white/95 px-1.5 py-0 text-[10px] text-slate-950 ring-1 ring-inset ring-white/70" : "bg-slate-100 px-1.5 py-0 text-[10px] text-slate-600 ring-1 ring-inset ring-slate-200"}>{item.badge}</Badge> : null}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <div className={`border-t border-slate-200/80 bg-white ${collapsed ? "flex flex-col items-center gap-2 p-2" : "p-3"}`}>
              {collapsed ? (
                <Link aria-label={settingsLabel} className="grid h-9 w-9 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900" href={settingsHref} title={settingsLabel}>
                  <Settings className="h-4 w-4" />
                </Link>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950">{companyName}</p>
                    {userName ? <p className="truncate text-xs font-bold text-slate-500">{userName}님</p> : null}
                  </div>
                  <Link aria-label={settingsLabel} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900" href={settingsHref} title={settingsLabel}>
                    <Settings className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </aside>

        <section className={`min-w-0 ${fullBleed ? "xl:flex xl:h-full xl:min-h-0 xl:flex-col" : ""}`}>
          <header className={`${compactMapHome ? "hidden" : "sticky top-0 z-20"} shrink-0 border-b border-slate-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.035)] ${fullBleed ? "xl:static" : ""}`}>
            <div className={`flex flex-col gap-3 px-4 sm:px-4 xl:flex-row xl:h-[72px] xl:items-center xl:justify-between xl:py-0 ${hidePageTitle ? "py-2" : "py-3"}`}>
              {!hidePageTitle ? (
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge className={workspaceBadgeClassName}>{workspaceLabel}</Badge>
                    {mode === "customer" ? <Badge className="bg-white text-slate-700 ring-1 ring-inset ring-slate-200">{roleLabel}</Badge> : null}
                    {userName ? <span className="text-xs font-bold text-slate-500">{userName}님</span> : null}
                  </div>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <h1 className="truncate text-[24px] font-black tracking-normal text-slate-900">{title}</h1>
                    {subtitle ? <InfoTooltip text={subtitle} /> : null}
                  </div>
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
                  className="maju-button-secondary h-8 shrink-0 px-2.5 text-xs shadow-none"
                  href={settingsHref}
                  title={settingsLabel}
                >
                  <MapPinned className="h-4 w-4" />
                  <span className={fullBleed ? "hidden 2xl:inline" : ""}>{settingsLabel}</span>
                </Link>
                <Link
                  className="maju-button-primary h-8 shrink-0 px-2.5 text-xs shadow-none"
                  href={scopedHref("/assistant")}
                  title="AI 영업"
                >
                  <MessageSquareText className="h-4 w-4" />
                  <span className={fullBleed ? "hidden 2xl:inline" : ""}>AI</span>
                </Link>
                {mode === "customer" ? (
                  <Link className="maju-button-secondary h-8 shrink-0 px-2.5 text-xs shadow-none" href="/mobile/today" title="모바일로 보기">
                    <Smartphone className="h-4 w-4" />
                    <span className={fullBleed ? "hidden 2xl:inline" : ""}>모바일</span>
                  </Link>
                ) : null}
                {rightAction}
                {mode === "customer" ? <CustomerAccountActions /> : null}
              </div>
            </div>
          </header>

          {mode === "admin-preview" ? (
            <div className={`border-b border-amber-200 bg-amber-50/80 px-4 py-2.5 sm:px-4 ${fullBleed ? "shrink-0" : ""}`}>
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-black text-amber-900">관리자 미리보기 모드</p>
                  <p className="mt-0.5 text-xs font-bold leading-5 text-amber-800">
                    현재 화면은 고객사 운영 화면을 관리자 권한으로 확인하는 모드입니다. 계정, 권한, 고객사 생성·수정은 어드민에서 관리하세요.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
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

          <div className={fullBleed ? "flex flex-col px-3 py-2 sm:px-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:py-2" : "px-4 py-4 sm:px-4"}>{children}</div>
        </section>
      </div>
    </main>
  );
}

function CustomerAccountActions({ compact = false }: { readonly compact?: boolean }) {
  async function logout() {
    await fetch("/api/customer/logout", { method: "POST" });
    window.location.href = "/dashboard/login";
  }

  return (
    <button
      className={`maju-button-secondary h-8 shrink-0 px-2.5 text-xs shadow-none hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 ${compact ? "justify-center" : ""}`}
      onClick={logout}
      title="로그아웃"
      type="button"
    >
      <LogOut className="h-4 w-4" />
      <span className={compact ? "" : "hidden 2xl:inline"}>로그아웃</span>
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Building2,
  FileSpreadsheet,
  HeartPulse,
  HelpCircle,
  LogOut,
  LucideIcon,
  MapPinned,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Route,
  Settings,
  Sparkles
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { workspaceRoleLabels, normalizeWorkspaceRole } from "@/lib/workspace";

type CustomerAppShellProps = {
  readonly active: "dashboard" | "customers" | "routes" | "revenue" | "revenue-ledger" | "assistant" | "report" | "settings" | "data";
  readonly children: ReactNode;
  readonly companyName: string;
  readonly hidePageTitle?: boolean;
  readonly mode?: "admin-preview" | "customer";
  readonly previewCompanyId?: string;
  readonly rightAction?: ReactNode;
  readonly title: string;
  readonly subtitle?: string;
  readonly userName?: string;
  readonly workspaceRole?: string;
};

type NavigationGroup = {
  label: string;
  items: Array<{
    active: CustomerAppShellProps["active"];
    badge?: string;
    href: string;
    icon: LucideIcon;
    label: string;
  }>;
};

const navigationGroups: NavigationGroup[] = [
  {
    label: "지도 홈",
    items: [
      { active: "dashboard", href: "/dashboard", icon: MapPinned, label: "지도 홈", badge: "메인" }
    ]
  },
  {
    label: "지도 기반 업무",
    items: [
      { active: "routes", href: "/routes/today", icon: Route, label: "영업·배송 코스" },
      { active: "customers", href: "/crm/timeline", icon: Building2, label: "거래처 원장" }
    ]
  },
  {
    label: "성장 분석",
    items: [
      { active: "revenue", href: "/revenue/pipeline", icon: BarChart3, label: "매출 성장" },
      { active: "revenue-ledger", href: "/revenue/transactions", icon: ReceiptText, label: "매출 거래내역" },
      { active: "assistant", href: "/assistant", icon: Sparkles, label: "AI 영업 도우미" },
      { active: "report", href: "/reports/latest", icon: HeartPulse, label: "AI 리포트" }
    ]
  },
  {
    label: "데이터 / 설정",
    items: [
      { active: "data", href: "/", icon: FileSpreadsheet, label: "데이터 등록" },
      { active: "settings", href: "/dashboard/settings", icon: Settings, label: "회사 설정" }
    ]
  }
];

export function CustomerAppShell({ active, children, companyName, hidePageTitle = false, mode = "customer", previewCompanyId, rightAction, subtitle, title, userName, workspaceRole }: CustomerAppShellProps) {
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
  const visibleNavigationGroups = navigationGroups;

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
    <main className="maju-app-bg min-h-screen text-slate-950">
      <div className={`grid min-h-screen transition-[grid-template-columns] duration-75 ${collapsed ? "lg:grid-cols-[72px_minmax(0,1fr)]" : "lg:grid-cols-[248px_minmax(0,1fr)]"}`}>
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
              <div className="border-t border-slate-200/80 p-3">
                <div className="maju-panel bg-slate-50 p-3">
                  <div className="flex items-center gap-2 text-xs font-black text-slate-700">
                    <HelpCircle className="h-4 w-4 text-teal-600" />
                    지도 기준 업무 순서
                  </div>
                  <div className="mt-3 space-y-1">
                    <SidebarQuickStep currentPath={pathname} href={scopedHref("/dashboard")} icon={MapPinned} label="지도 홈에서 현황 확인" step="1" />
                    <SidebarQuickStep currentPath={pathname} href={scopedHref("/crm/timeline")} icon={Building2} label="거래처 원장 관리" step="2" />
                    <SidebarQuickStep currentPath={pathname} href={scopedHref("/routes/today")} icon={Route} label="영업·배송 코스 계산" step="3" />
                    <SidebarQuickStep currentPath={pathname} href={scopedHref("/revenue/pipeline")} icon={BarChart3} label="성장 기회 분석" step="4" />
                  </div>
                  <p className="mt-3 text-[11px] font-bold leading-5 text-slate-500">
                    {mode === "admin-preview"
                      ? "관리자는 고객사 화면을 확인만 하고, 계정과 회사 권한 관리는 어드민에서 처리합니다."
                      : "모든 업무는 지도 홈의 거래처 위치와 출발지 기준으로 이어집니다."}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </aside>

        <section className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white shadow-sm">
            <div className={`flex flex-col gap-3 px-4 sm:px-6 xl:flex-row xl:items-center xl:justify-between ${hidePageTitle ? "py-2.5" : "py-4"}`}>
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
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={workspaceBadgeClassName}>{workspaceLabel}</Badge>
                    <span className="text-sm font-black text-slate-900">{activeWorkspaceLabel}</span>
                    {userName ? <span className="text-xs font-bold text-slate-500">{userName}님</span> : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs font-bold text-slate-500">{title}</p>
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
            <div className="border-b border-amber-200 bg-amber-50/80 px-4 py-2.5 sm:px-6">
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

          <div className="px-4 py-4 sm:px-6">{children}</div>
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
  if (active === "dashboard") return "지도 홈";
  if (active === "routes") return "영업·배송 코스";
  if (active === "customers") return "거래처 원장";
  if (active === "revenue") return "성장 분석";
  if (active === "revenue-ledger") return "매출 거래내역";
  if (active === "assistant") return "AI 영업 도우미";
  if (active === "report") return "AI 리포트";
  if (active === "settings") return "회사 설정";
  return "데이터 등록";
}

function SidebarQuickStep({ currentPath, href, icon: Icon, label, step }: { readonly currentPath: string | null; readonly href: string; readonly icon: LucideIcon; readonly label: string; readonly step: string }) {
  const selected = isCurrentNavItem(currentPath, href);

  return (
    <Link
      className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-xs font-black ring-1 ring-inset transition ${
        selected ? "bg-teal-50 text-teal-900 ring-teal-200" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-100 hover:text-slate-950 hover:ring-slate-300"
      }`}
      href={href}
    >
      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-black ${selected ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`}>{step}</span>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${selected ? "text-teal-700" : "text-slate-400"}`} />
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}

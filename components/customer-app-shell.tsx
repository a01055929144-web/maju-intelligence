"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  BarChart3,
  Building2,
  ClipboardList,
  FileSpreadsheet,
  HeartPulse,
  HelpCircle,
  LayoutDashboard,
  LucideIcon,
  MapPinned,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Route,
  Settings,
  Sparkles
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

type CustomerAppShellProps = {
  readonly active: "dashboard" | "customers" | "routes" | "revenue" | "assistant" | "settings" | "data";
  readonly children: ReactNode;
  readonly companyName: string;
  readonly rightAction?: ReactNode;
  readonly title: string;
  readonly subtitle?: string;
  readonly userName?: string;
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
    label: "운영",
    items: [
      { active: "dashboard", href: "/dashboard", icon: LayoutDashboard, label: "대시보드" },
      { active: "routes", href: "/routes/today", icon: Route, label: "영업·배송 코스", badge: "실시간" },
      { active: "customers", href: "/crm/timeline", icon: Building2, label: "거래처 히스토리" }
    ]
  },
  {
    label: "성장",
    items: [
      { active: "revenue", href: "/revenue/pipeline", icon: BarChart3, label: "매출 파이프라인" },
      { active: "assistant", href: "/assistant", icon: Sparkles, label: "AI 영업 도우미" },
      { active: "data", href: "/", icon: FileSpreadsheet, label: "데이터 등록" }
    ]
  },
  {
    label: "관리",
    items: [
      { active: "settings", href: "/dashboard/settings", icon: Settings, label: "회사 설정" },
      { active: "dashboard", href: "/reports/latest", icon: HeartPulse, label: "AI 리포트" },
      { active: "dashboard", href: "/admin", icon: ClipboardList, label: "관리자" }
    ]
  }
];

export function CustomerAppShell({ active, children, companyName, rightAction, subtitle, title, userName }: CustomerAppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className={`grid min-h-screen transition-[grid-template-columns] duration-200 ${collapsed ? "lg:grid-cols-[76px_minmax(0,1fr)]" : "lg:grid-cols-[248px_minmax(0,1fr)]"}`}>
        <aside className="border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col">
            <div className="border-b border-slate-200 p-4">
              <div className={`flex items-center gap-2 ${collapsed ? "justify-center" : "justify-between"}`}>
              <Link className="flex min-w-0 items-center gap-3" href="/dashboard">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-700 text-sm font-black text-white">M</span>
                {!collapsed ? <span className="min-w-0">
                  <span className="block truncate text-sm font-black">MAJU Intelligence</span>
                  <span className="block truncate text-xs font-bold text-slate-500">{companyName}</span>
                </span> : null}
              </Link>
              <button
                aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
                className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 lg:inline-flex"
                onClick={() => setCollapsed((value) => !value)}
                type="button"
              >
                {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </button>
              </div>
            </div>

            <nav className="flex-1 space-y-5 overflow-auto p-3">
              {navigationGroups.map((group) => (
                <div key={group.label}>
                  {!collapsed ? <p className="mb-2 px-2 text-[11px] font-black uppercase tracking-wide text-slate-400">{group.label}</p> : null}
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const selected = active === item.active && !["AI 리포트", "관리자"].includes(item.label);
                      return (
                        <Link
                          key={`${group.label}-${item.label}`}
                          className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-black transition ${collapsed ? "justify-center" : ""} ${
                            selected ? "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                          }`}
                          href={item.href}
                          title={collapsed ? item.label : undefined}
                        >
                          <item.icon className={`h-4 w-4 ${selected ? "text-emerald-700" : "text-slate-400"}`} />
                          {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
                          {!collapsed && item.badge ? <Badge className="bg-emerald-100 px-1.5 py-0 text-[10px] text-emerald-800">{item.badge}</Badge> : null}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            {!collapsed ? <div className="border-t border-slate-200 p-3">
              <div className="rounded-md bg-slate-50 p-3">
                <div className="flex items-center gap-2 text-xs font-black text-slate-500">
                  <HelpCircle className="h-4 w-4 text-slate-400" />
                  고객 지원
                </div>
                <p className="mt-2 text-xs font-bold leading-5 text-slate-500">데이터 등록, 배송 경로, AI 리포트 설정을 한 곳에서 관리합니다.</p>
              </div>
            </div> : null}
          </div>
        </aside>

        <section className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex flex-col gap-3 px-4 py-4 sm:px-6 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge className="bg-slate-100 text-slate-700">고객사 작업공간</Badge>
                  {userName ? <span className="text-xs font-bold text-slate-500">{userName}님</span> : null}
                </div>
                <h1 className="truncate text-xl font-black text-slate-950">{title}</h1>
                {subtitle ? <p className="mt-1 text-sm font-medium text-slate-500">{subtitle}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                  href="/dashboard/settings"
                >
                  <MapPinned className="h-4 w-4" />
                  출발지 설정
                </Link>
                <Link
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                  href="/assistant"
                >
                  <MessageSquareText className="h-4 w-4" />
                  AI 도우미
                </Link>
                {rightAction}
              </div>
            </div>
          </header>

          <div className="px-4 py-5 sm:px-6">{children}</div>
        </section>
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  LogOut,
  Menu,
  Route,
  Settings,
  Sparkles,
  X,
  type LucideIcon
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ChurnRiskAlert } from "@/components/churn-risk-alert";
import { DashboardConsistencyCheck } from "@/components/dashboard-consistency-check";
import { KakaoAddressMap, type KakaoMapMarker } from "@/components/kakao-address-map";
import { LeadStatusSelect } from "@/components/lead-status-select";
import { customerNavigationGroups, customerUtilityActions, getCustomerQuickActions } from "@/lib/customer-navigation";

type TopLead = {
  expectedRevenue: number;
  id: string;
  name: string;
  region: string;
  score: number;
  status: string;
};

type ChecklistItem = {
  actionHref: string;
  actionLabel: string;
  description: string;
  done: boolean;
  label: string;
  value: string;
};

export type MapHomeViewProps = {
  companyId?: string;
  companyName: string;
  healthScore: number | null;
  isAdminPreview: boolean;
  mapMarkers: KakaoMapMarker[];
  operationChecklist: ChecklistItem[];
  operationalProgress: number;
  originAddress: string;
  placeLinkRate: number;
  quickNav: {
    assistantHref: string;
    backHref: string;
    dataManagementHref: string;
    dataRegistrationHref: string;
    pipelineHref: string;
    reportHref: string;
    routeHref: string;
    settingsHref: string;
    settingsLabel: string;
    timelineHref: string;
    transactionsHref: string;
  };
  routeStopCount: number;
  stats: {
    customerCount: number;
    latestUploadReady: boolean;
    weeklyOpportunities: number;
  };
  topLeads: TopLead[];
  userName: string;
};

export function MapHomeView({
  companyId,
  companyName,
  healthScore,
  isAdminPreview,
  mapMarkers,
  operationChecklist,
  operationalProgress,
  originAddress,
  placeLinkRate,
  quickNav,
  routeStopCount,
  stats,
  topLeads,
  userName
}: MapHomeViewProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [consistencyOpen, setConsistencyOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(64);
  const headerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const header = headerRef.current;
    if (!header || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setHeaderHeight(Math.ceil(entry.contentRect.height));
    });
    observer.observe(header);
    setHeaderHeight(Math.ceil(header.getBoundingClientRect().height));

    return () => observer.disconnect();
  }, []);

  const mapHomeHref = isAdminPreview && companyId ? `/dashboard?companyId=${encodeURIComponent(companyId)}` : "/dashboard";
  const hrefByActive = {
    assistant: quickNav.assistantHref,
    customers: quickNav.timelineHref,
    dashboard: mapHomeHref,
    data: quickNav.dataRegistrationHref,
    "data-management": quickNav.dataManagementHref,
    report: quickNav.reportHref,
    revenue: quickNav.pipelineHref,
    "revenue-ledger": quickNav.transactionsHref,
    routes: quickNav.routeHref,
    settings: quickNav.settingsHref
  };
  const navGroups = customerNavigationGroups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      active: item.active === "dashboard",
      href: hrefByActive[item.active]
    }))
  }));
  const commandChips = [
    { label: "거래처", value: stats.customerCount ? `${stats.customerCount.toLocaleString()}곳` : "등록 필요" },
    { label: "신규", value: `${stats.weeklyOpportunities.toLocaleString()}곳` },
    { label: "코스", value: routeStopCount ? `${routeStopCount.toLocaleString()}곳` : "대기" },
    { label: "건강", value: healthScore === null ? "-" : `${healthScore}점` }
  ];
  const primaryActions = getCustomerQuickActions().map((item) => ({
    ...item,
    href: hrefByActive[item.active]
  }));

  return (
    <div className="fixed inset-0 h-screen w-screen overflow-hidden bg-slate-900">
      <div className="absolute inset-0">
        <KakaoAddressMap
          controlsOffsetPx={headerHeight + 12}
          mapClassName="h-full w-full rounded-none border-0"
          markers={mapMarkers}
          showList={false}
        />
      </div>

      {drawerOpen ? (
        <button
          aria-label="메뉴 닫기"
          className="absolute inset-0 z-30 bg-slate-950/25 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          type="button"
        />
      ) : null}

      <header ref={headerRef} className="pointer-events-auto absolute inset-x-0 top-0 z-40 border-b border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,.08)]">
        <div className="flex min-h-16 items-center gap-3 px-3 py-2 sm:px-4">
          <div className="flex min-w-0 items-center gap-2 sm:min-w-[220px]">
            <button
              aria-label="메뉴 열기"
              className="grid h-8 w-8 place-items-center rounded-md text-slate-600 transition hover:bg-slate-100"
              onClick={() => setDrawerOpen((value) => !value)}
              type="button"
            >
              {drawerOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-teal-700 text-sm font-black text-white">M</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-black text-slate-950">MAJU Map OS</span>
              <span className="block truncate text-[11px] font-bold text-slate-500">{companyName}</span>
            </span>
          </div>

          <div className="hidden min-w-0 flex-1 items-center gap-1.5 overflow-x-auto lg:flex">
            {commandChips.map((chip) => (
              <div key={chip.label} className="flex h-9 shrink-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3">
                <span className="maju-muted-label text-[10px]">{chip.label}</span>
                <span className="text-sm font-black text-slate-950">{chip.value}</span>
              </div>
            ))}
          </div>

          <div className="ml-auto flex shrink-0 items-center justify-end gap-1.5 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-sm sm:gap-2">
            <Link
              className="maju-button-blue h-8 shrink-0 rounded-md px-2.5 text-xs shadow-none sm:h-9 sm:px-3 sm:text-sm"
              href={quickNav.assistantHref}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{customerUtilityActions.assistant.label}</span>
            </Link>
            <Link
              className="maju-button-secondary h-8 shrink-0 rounded-md px-2.5 text-xs shadow-none sm:h-9 sm:px-3 sm:text-sm"
              href={quickNav.settingsHref}
            >
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{quickNav.settingsLabel || customerUtilityActions.settings.label}</span>
            </Link>
            {!isAdminPreview ? <LogoutButton /> : (
              <Link
                className="maju-button h-8 shrink-0 rounded-md bg-amber-900 px-2.5 text-xs text-white shadow-none hover:bg-amber-950 sm:h-9 sm:px-3 sm:text-sm"
                href={quickNav.backHref}
              >
                어드민
              </Link>
            )}
          </div>
        </div>

        <div className="flex gap-1.5 overflow-x-auto border-t border-slate-100 px-3 py-2 lg:hidden">
          {commandChips.map((chip) => (
            <div key={chip.label} className="flex h-9 shrink-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3">
              <span className="maju-muted-label text-[10px]">{chip.label}</span>
              <span className="text-sm font-black text-slate-950">{chip.value}</span>
            </div>
          ))}
        </div>

        {isAdminPreview ? (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-900">
            관리자 미리보기 모드입니다. 계정·권한 관리는 어드민에서 처리하세요.
          </div>
        ) : null}
      </header>

      <ChurnRiskAlert companyId={isAdminPreview ? companyId : undefined} offsetTop={headerHeight + 12} timelineHref={quickNav.timelineHref} />

      <aside
        className={`pointer-events-auto absolute bottom-0 left-0 z-40 flex w-[336px] max-w-[88vw] transform flex-col rounded-r-xl border border-l-0 border-slate-200 bg-white shadow-[12px_0_32px_rgba(15,23,42,.12)] transition-transform duration-100 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ top: headerHeight }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 p-4">
          <div className="min-w-0">
            <p className="maju-section-title">MAJU Map OS</p>
            <p className="mt-0.5 truncate text-xs font-bold text-slate-500">{userName} · {originAddress}</p>
          </div>
          <button aria-label="메뉴 닫기" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100" onClick={() => setDrawerOpen(false)} type="button">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="border-b border-slate-200 p-3">
            <div className="mb-3 rounded-lg border border-teal-100 bg-teal-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-black text-teal-950">지도에서 시작</p>
                <Badge className="bg-white text-teal-700 ring-1 ring-inset ring-teal-200">OS</Badge>
              </div>
              <p className="mt-1 text-[11px] font-bold leading-5 text-teal-800">지도 홈에서 위치를 보고 코스, 원장, 성장 업무로 이동합니다.</p>
            </div>
            <p className="maju-muted-label px-2 pb-2">핵심 업무</p>
            <div className="grid grid-cols-2 gap-2">
              {primaryActions.map((item) => (
                <Link className="flex h-[60px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left transition hover:border-teal-200 hover:bg-teal-50" href={item.href} key={item.label}>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-slate-50 text-teal-700 ring-1 ring-inset ring-slate-100">
                    <item.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-black text-slate-800">{item.label}</span>
                    <span className="block truncate text-[10px] font-bold text-slate-400">{item.helper}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <nav className="space-y-3 border-b border-slate-200 bg-white p-3">
            {navGroups.map((group) => (
              <div className="space-y-1.5" key={group.label}>
                <p className="maju-muted-label px-2">{group.label}</p>
                {group.items.map((item) => (
                  <Link
                    className={`relative flex min-h-[58px] items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                      item.active
                        ? "border-teal-200 bg-teal-50 text-teal-950"
                        : "border-transparent bg-white text-slate-700 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950"
                    }`}
                    href={item.href}
                    key={item.label}
                  >
                    {item.active ? <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-teal-600" /> : null}
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ring-1 ring-inset ${
                      item.active ? "bg-white text-teal-700 ring-teal-100" : "bg-slate-50 text-slate-400 ring-slate-100"
                    }`}>
                      <item.icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black">{item.label}</span>
                      <span className="mt-0.5 line-clamp-1 block text-[11px] font-bold leading-5 text-slate-500">{item.description}</span>
                    </span>
                  </Link>
                ))}
              </div>
            ))}
          </nav>

          <div className="border-b border-slate-200 p-4">
            <p className="maju-muted-label">운영 기준</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <SmallStat helper="필수값" label="준비율" value={`${operationalProgress}%`} />
              <SmallStat helper="외부정보" label="매장 링크" value={`${placeLinkRate}%`} />
            </div>
          </div>

          <div className="border-b border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="maju-section-title">추천 리드</p>
              <Link className="text-xs font-black text-teal-700 hover:underline" href={quickNav.pipelineHref}>
                보기
              </Link>
            </div>
            <div className="mt-2 space-y-2">
              {topLeads.length ? (
                topLeads.slice(0, 4).map((lead, index) => (
                  <div className="maju-panel p-2.5" key={lead.id || lead.name}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 gap-2">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-blue-700 text-[11px] font-black text-white">{index + 1}</span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black text-slate-950">{lead.name}</p>
                          <p className="truncate text-[11px] font-bold text-slate-500">
                            {lead.region} · 월 {lead.expectedRevenue.toLocaleString()}만원
                          </p>
                        </div>
                      </div>
                      <Badge className="shrink-0 bg-blue-50 text-blue-700">{lead.score}점</Badge>
                    </div>
                    <div className="mt-2">
                      <LeadStatusSelect leadId={lead.id} value={lead.status} />
                    </div>
                  </div>
                ))
              ) : (
                <p className="maju-empty-state p-3 text-xs font-bold text-slate-500">거래처와 매출 원장이 쌓이면 추천 리드가 표시됩니다.</p>
              )}
            </div>
          </div>

          <div className="border-b border-slate-200 p-4">
            <p className="maju-section-title">운영 체크</p>
            <div className="mt-2 space-y-2">
              {operationChecklist.map((item) => (
                <Link
                  className={`maju-filter-box flex items-start justify-between gap-2 p-2.5 ${
                    item.done ? "border-emerald-100 bg-emerald-50/50" : "border-amber-200 bg-amber-50/70"
                  }`}
                  href={item.actionHref}
                  key={item.label}
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-slate-950">{item.label}</p>
                    <p className="mt-0.5 truncate text-[11px] font-bold text-slate-500">{item.value}</p>
                  </div>
                  {item.done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
                  )}
                </Link>
              ))}
            </div>
          </div>

          <div className="p-4">
            <button
              className="flex w-full items-center justify-between gap-2 text-sm font-black text-slate-950"
              onClick={() => setConsistencyOpen((value) => !value)}
              type="button"
            >
              데이터 일치 점검
              <ChevronDown className={`h-4 w-4 text-slate-400 transition ${consistencyOpen ? "rotate-180" : ""}`} />
            </button>
            {consistencyOpen ? (
              <div className="mt-3">
                <DashboardConsistencyCheck companyId={isAdminPreview ? companyId : undefined} />
              </div>
            ) : null}
          </div>
        </div>

        <div className={`border-t border-slate-200 p-3 text-xs font-bold ${stats.latestUploadReady ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
          {stats.latestUploadReady ? "매출 원장 연결됨" : "매출 원장 업로드 필요"}
        </div>
      </aside>

      <div className="pointer-events-none absolute bottom-4 right-4 z-30 flex flex-col items-end gap-2">
        <Link
          className="maju-button-primary pointer-events-auto h-10 rounded-full px-4 text-sm shadow-xl"
          href={quickNav.routeHref}
        >
          <Route className="h-4 w-4" />
          코스
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          className="maju-button-secondary pointer-events-auto h-9 rounded-full px-4 text-sm shadow-xl"
          href={quickNav.timelineHref}
        >
          <Building2 className="h-3.5 w-3.5" />
          거래처
        </Link>
      </div>
    </div>
  );
}

function LogoutButton() {
  async function logout() {
    await fetch("/api/customer/logout", { method: "POST" });
    window.location.href = "/dashboard/login";
  }

  return (
    <button
      className="maju-button-secondary h-8 shrink-0 rounded-md px-2.5 text-xs shadow-none hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 sm:h-9 sm:px-3 sm:text-sm"
      onClick={logout}
      type="button"
    >
      <LogOut className="h-3.5 w-3.5" />
      <span className="hidden md:inline">로그아웃</span>
    </button>
  );
}

function SmallStat({ helper, label, value }: { helper: string; label: string; value: string }) {
  return (
    <div className="maju-panel bg-slate-50/70 p-2.5">
      <p className="maju-muted-label truncate text-[10px]">{label}</p>
      <p className="mt-1 truncate text-base font-black leading-none text-slate-950">{value}</p>
      <p className="mt-1 truncate text-[10px] font-bold text-slate-500">{helper}</p>
    </div>
  );
}

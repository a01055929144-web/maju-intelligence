"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  FileSpreadsheet,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  Route,
  Settings,
  Sparkles,
  TrendingUp,
  X,
  type LucideIcon
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DashboardConsistencyCheck } from "@/components/dashboard-consistency-check";
import { KakaoAddressMap, type KakaoMapMarker } from "@/components/kakao-address-map";
import { LeadStatusSelect } from "@/components/lead-status-select";

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

type NavItem = {
  active: boolean;
  href: string;
  icon: LucideIcon;
  label: string;
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(min-width: 1024px)").matches) setDrawerOpen(true);
  }, []);

  const navItems: NavItem[] = [
    { active: true, href: "/dashboard", icon: LayoutDashboard, label: "지도 홈" },
    { active: false, href: quickNav.routeHref, icon: Route, label: "영업·배송 코스" },
    { active: false, href: quickNav.timelineHref, icon: Building2, label: "거래처 히스토리" },
    { active: false, href: quickNav.pipelineHref, icon: TrendingUp, label: "매출 파이프라인" },
    { active: false, href: quickNav.transactionsHref, icon: ReceiptText, label: "매출 거래내역" },
    { active: false, href: quickNav.assistantHref, icon: Sparkles, label: "AI 영업 도우미" },
    { active: false, href: quickNav.dataRegistrationHref, icon: FileSpreadsheet, label: "데이터 등록" },
    { active: false, href: quickNav.reportHref, icon: HeartPulse, label: "AI 리포트" }
  ];
  const commandChips = [
    { label: "기거래매장", value: stats.customerCount ? `${stats.customerCount.toLocaleString()}곳` : "등록 필요" },
    { label: "신규리드", value: `${stats.weeklyOpportunities.toLocaleString()}곳` },
    { label: "코스매장", value: routeStopCount ? `${routeStopCount.toLocaleString()}곳` : "대기" },
    { label: "건강도", value: healthScore === null ? "-" : `${healthScore}점` }
  ];

  return (
    <div className="fixed inset-0 h-screen w-screen overflow-hidden bg-slate-950">
      <div className="absolute inset-0">
        <KakaoAddressMap mapClassName="h-full w-full rounded-none border-0" markers={mapMarkers} showList={false} />
      </div>

      {drawerOpen ? (
        <button
          aria-label="메뉴 닫기"
          className="absolute inset-0 z-30 bg-slate-950/25 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          type="button"
        />
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex flex-col gap-2 p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="maju-surface pointer-events-auto flex items-center gap-2 rounded-xl px-3 py-2">
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
              <span className="block truncate text-sm font-black text-slate-950">MAJU Intelligence</span>
              <span className="block truncate text-[11px] font-bold text-slate-500">{companyName}</span>
            </span>
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            <Link
              className="maju-button-blue shadow-lg"
              href={quickNav.assistantHref}
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI 도우미
            </Link>
            <Link
              className="maju-button-secondary shadow-lg"
              href={quickNav.settingsHref}
            >
              <Settings className="h-3.5 w-3.5" />
              {quickNav.settingsLabel}
            </Link>
            {!isAdminPreview ? <LogoutButton /> : (
              <Link
                className="maju-button bg-amber-900 text-white shadow-lg hover:bg-amber-950"
                href={quickNav.backHref}
              >
                관리자로 돌아가기
              </Link>
            )}
          </div>
        </div>

        <div className="pointer-events-auto flex gap-2 overflow-x-auto pb-1">
          {commandChips.map((chip) => (
            <div key={chip.label} className="maju-surface flex shrink-0 items-center gap-2 rounded-lg px-3 py-2">
              <span className="maju-muted-label text-[10px]">{chip.label}</span>
              <span className="text-sm font-black text-slate-950">{chip.value}</span>
            </div>
          ))}
        </div>

        {isAdminPreview ? (
          <div className="pointer-events-auto max-w-md rounded-lg border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs font-bold text-amber-900 shadow-md backdrop-blur">
            관리자 미리보기 모드입니다. 계정·권한 관리는 어드민에서 처리하세요.
          </div>
        ) : null}
      </div>

      <aside
        className={`maju-surface pointer-events-auto absolute inset-y-0 left-0 z-40 flex w-[360px] max-w-[88vw] transform flex-col rounded-r-xl border-l-0 border-y-0 transition-transform duration-150 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div className="min-w-0">
            <p className="maju-section-title">메뉴</p>
            <p className="mt-0.5 truncate text-xs font-bold text-slate-500">{userName}님 · {originAddress}</p>
          </div>
          <button aria-label="메뉴 닫기" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100" onClick={() => setDrawerOpen(false)} type="button">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <nav className="space-y-1 border-b border-slate-200 p-3">
            {navItems.map((item) => (
              <Link
                className={`maju-nav-item ${
                  item.active ? "maju-nav-item-active" : "maju-nav-item-idle"
                }`}
                href={item.href}
                key={item.label}
              >
                <item.icon className={`h-4 w-4 ${item.active ? "text-teal-700" : "text-slate-400"}`} />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="border-b border-slate-200 p-4">
            <p className="maju-muted-label">오늘 기준</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <SmallStat helper="준비율" label="운영 진행" value={`${operationalProgress}%`} />
              <SmallStat helper="외부 링크" label="네이버·카카오 연결" value={`${placeLinkRate}%`} />
            </div>
          </div>

          <div className="border-b border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="maju-section-title">추천 리드 TOP</p>
              <Link className="text-xs font-black text-teal-700 hover:underline" href={quickNav.pipelineHref}>
                전체보기
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
                <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-xs font-bold text-slate-500">거래처와 매출 원장이 쌓이면 추천 리드가 표시됩니다.</p>
              )}
            </div>
          </div>

          <div className="border-b border-slate-200 p-4">
            <p className="maju-section-title">운영 체크리스트</p>
            <div className="mt-2 space-y-2">
              {operationChecklist.map((item) => (
                <Link
                  className={`flex items-start justify-between gap-2 rounded-md border p-2.5 transition hover:bg-slate-50 ${
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
          className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full bg-teal-700 px-4 text-sm font-black text-white shadow-xl transition hover:bg-teal-800"
          href={quickNav.routeHref}
        >
          <Route className="h-4 w-4" />
          코스 열기
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          className="maju-button-secondary pointer-events-auto h-10 rounded-full px-4 shadow-xl"
          href={quickNav.timelineHref}
        >
          <Building2 className="h-3.5 w-3.5" />
          거래처 관리
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
      className="maju-button-secondary shadow-lg hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
      onClick={logout}
      type="button"
    >
      <LogOut className="h-3.5 w-3.5" />
      로그아웃
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

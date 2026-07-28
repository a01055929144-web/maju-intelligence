"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { BarChart3, ClipboardList, MapPinned, MousePointer2 } from "lucide-react";

type DashboardTabId = "overview" | "route" | "sales" | "shortcuts";

type DashboardTabsProps = {
  overview: ReactNode;
  route: ReactNode;
  sales: ReactNode;
  shortcuts: ReactNode;
};

const tabs: Array<{ description: string; icon: typeof ClipboardList; id: DashboardTabId; label: string; shortLabel: string }> = [
  { description: "오늘 처리할 운영 상태와 준비도를 봅니다.", icon: ClipboardList, id: "overview", label: "운영 요약", shortLabel: "상태" },
  { description: "거래처 위치, 배송 코스, 데이터 상태를 확인합니다.", icon: MapPinned, id: "route", label: "지도·배송", shortLabel: "지도" },
  { description: "추천 리드와 매출 관련 지표를 봅니다.", icon: BarChart3, id: "sales", label: "영업·매출", shortLabel: "매출" },
  { description: "자주 쓰는 작업 화면으로 바로 이동합니다.", icon: MousePointer2, id: "shortcuts", label: "바로가기", shortLabel: "작업" }
];

export function DashboardTabs({ overview, route, sales, shortcuts }: DashboardTabsProps) {
  const [activeTab, setActiveTab] = useState<DashboardTabId>("overview");
  const content = {
    overview,
    route,
    sales,
    shortcuts
  }[activeTab];
  const active = tabs.find((tab) => tab.id === activeTab) || tabs[0];

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-sm">
      <div className="border-b border-slate-200/80 bg-white px-4 py-4 sm:px-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(620px,780px)] xl:items-center">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-teal-700">운영 탭</p>
            <h2 className="mt-1 text-lg font-black text-slate-950">{active.label}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{active.description}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {tabs.map((tab, index) => {
              const Icon = tab.icon;
              const selected = activeTab === tab.id;

              return (
                <button
                  aria-pressed={selected}
                  className={`group relative min-w-0 overflow-hidden rounded-md border px-3 py-3 text-left transition ${
                    selected
                      ? "border-teal-700 bg-teal-700 text-white shadow-[0_10px_22px_rgba(15,118,110,0.18)]"
                      : "border-slate-200 bg-white text-slate-600 shadow-[0_1px_0_rgba(15,23,42,0.03)] hover:border-teal-200 hover:bg-teal-50 hover:text-teal-900"
                  }`}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  title={tab.description}
                  type="button"
                >
                  {selected ? <span className="absolute inset-x-0 top-0 h-1 bg-white/80" /> : null}
                  <span className="flex items-center gap-2 text-sm font-black">
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md text-[11px] ${selected ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-teal-700"}`}>{index + 1}</span>
                    <Icon className={`h-4 w-4 ${selected ? "text-white" : "text-slate-400 group-hover:text-teal-700"}`} />
                    <span className="truncate">{tab.label}</span>
                  </span>
                  <span className={`mt-2 block text-[11px] font-bold leading-4 ${selected ? "text-white/75" : "text-slate-400 group-hover:text-teal-600"}`}>
                    {tab.shortLabel}
                  </span>
                </button>
              );
            })}
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-4 bg-slate-50/50 p-4">{content}</div>
    </section>
  );
}

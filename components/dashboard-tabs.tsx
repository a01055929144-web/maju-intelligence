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

const tabs: Array<{ description: string; icon: typeof ClipboardList; id: DashboardTabId; label: string }> = [
  { description: "오늘 처리할 운영 상태와 준비도를 봅니다.", icon: ClipboardList, id: "overview", label: "운영 요약" },
  { description: "거래처 위치, 배송 코스, 데이터 상태를 확인합니다.", icon: MapPinned, id: "route", label: "지도·배송" },
  { description: "추천 리드와 매출 관련 지표를 봅니다.", icon: BarChart3, id: "sales", label: "영업·매출" },
  { description: "자주 쓰는 작업 화면으로 바로 이동합니다.", icon: MousePointer2, id: "shortcuts", label: "바로가기" }
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
    <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
      <div className="border-b border-slate-200/80 bg-white px-5 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-teal-700">Dashboard Sections</p>
            <h2 className="mt-1 text-lg font-black text-slate-950">{active.label}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{active.description}</p>
          </div>
          <div className="grid w-full gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5 sm:grid-cols-2 xl:w-auto xl:grid-cols-4">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const selected = activeTab === tab.id;

              return (
                <button
                  className={`group min-w-[138px] rounded-lg border px-3 py-2.5 text-left transition ${
                    selected
                      ? "border-teal-700 bg-teal-700 text-white shadow-[0_8px_18px_rgba(15,118,110,0.18)]"
                      : "border-transparent bg-white/50 text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950"
                  }`}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  title={tab.description}
                  type="button"
                >
                  <span className="flex items-center gap-2 text-sm font-black">
                    <Icon className={`h-4 w-4 ${selected ? "text-white" : "text-slate-400 group-hover:text-teal-700"}`} />
                    {tab.label}
                  </span>
                  <span className={`mt-1 block truncate text-[11px] font-bold ${selected ? "text-white/75" : "text-slate-400"}`}>
                    {tab.id === "overview" ? "상태" : tab.id === "route" ? "지도" : tab.id === "sales" ? "매출" : "작업"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="space-y-4 bg-slate-50/50 p-4">{content}</div>
    </section>
  );
}

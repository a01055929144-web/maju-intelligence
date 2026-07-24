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
    <section className="rounded-lg border border-slate-200/80 bg-white shadow-sm">
      <div className="border-b border-slate-200/80 p-3">
        <div className="grid gap-2 lg:grid-cols-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;

            return (
              <button
                className={`flex min-h-16 items-start gap-3 rounded-md border px-4 py-3 text-left transition ${
                  selected
                    ? "border-teal-200 bg-teal-50 text-teal-900 shadow-sm"
                    : "border-transparent bg-slate-50/70 text-slate-600 hover:border-slate-200 hover:bg-white"
                }`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${selected ? "bg-teal-700 text-white" : "bg-white text-slate-400 ring-1 ring-inset ring-slate-200"}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black">{tab.label}</span>
                  <span className="mt-1 block text-xs font-semibold leading-5 opacity-75">{tab.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-3">
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">현재 탭</p>
        <p className="mt-1 text-sm font-black text-slate-900">{active.label}</p>
      </div>
      <div className="space-y-4 p-4">{content}</div>
    </section>
  );
}

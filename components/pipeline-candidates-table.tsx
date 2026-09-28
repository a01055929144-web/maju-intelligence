"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SortableTh } from "@/components/sortable-th";
import type { RevenuePipeline } from "@/lib/store";
import { useTableSort } from "@/lib/use-table-sort";

const resultLabels: Record<string, string> = {
  interested: "관심 있음",
  "quote-requested": "견적 요청",
  pending: "보류",
  failed: "실패"
};

const nextActionLabels: Record<string, string> = {
  interested: "품목 제안",
  "quote-requested": "견적 확정",
  pending: "재연락 일정",
  failed: "실패 사유 확인"
};

const resultTones: Record<string, string> = {
  interested: "bg-emerald-50 text-emerald-800 ring-emerald-100",
  "quote-requested": "bg-teal-50 text-teal-800 ring-teal-100",
  pending: "bg-amber-50 text-amber-800 ring-amber-100",
  failed: "bg-slate-100 text-slate-700 ring-slate-200"
};

type PipelineItem = RevenuePipeline["items"][number];

// 2026-09-01 피드백: "서비스 내에 모든 표헤더들은 클릭하면 오름차순/내림차순으로 정렬되도록 만들어" —
// 이 표는 app/revenue/pipeline/page.tsx(서버 컴포넌트) 안에 있었는데, 정렬은 클릭 상태(useState)가
// 필요해 클라이언트 컴포넌트로 분리했습니다(서버 컴포넌트 안에서 훅을 쓸 수 없음 — 2026-08-31
// 배포 장애의 원인이 바로 이 서버/클라이언트 경계를 잘못 다룬 것이었어서, 이번엔 처음부터 별도
// "use client" 파일로 뽑았습니다).
export function PipelineCandidatesTable({ items, weightedRevenue }: { readonly items: PipelineItem[]; readonly weightedRevenue: number }) {
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState("all");
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko");
    return items.filter((item) => {
      if (resultFilter !== "all" && item.result !== resultFilter) return false;
      if (!normalizedQuery) return true;
      return [item.leadName, item.memo, item.region, resultLabels[item.result] || item.result]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("ko").includes(normalizedQuery));
    });
  }, [items, query, resultFilter]);
  const hasActiveFilters = Boolean(query.trim()) || resultFilter !== "all";
  const resultCounts = useMemo(() => items.reduce<Record<string, number>>((counts, item) => {
    counts[item.result] = (counts[item.result] || 0) + 1;
    return counts;
  }, {}), [items]);
  type PipelineSortKey = "leadName" | "probability" | "region" | "result" | "weightedRevenue";
  const { sortDirection, sortKey, sortedRows, toggleSort } = useTableSort<PipelineItem, PipelineSortKey>(filteredItems, {
    leadName: (a, b) => a.leadName.localeCompare(b.leadName, "ko"),
    probability: (a, b) => a.probability - b.probability,
    region: (a, b) => a.region.localeCompare(b.region, "ko"),
    result: (a, b) => (resultLabels[a.result] || a.result).localeCompare(resultLabels[b.result] || b.result, "ko"),
    weightedRevenue: (a, b) => a.weightedRevenue - b.weightedRevenue
  });

  return (
    <section className="maju-section-card scroll-mt-28" id="pipeline-table">
      <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">후보 목록</h2>
          <p className="mt-1 text-sm text-slate-500">견적·관심 거래처 우선순위</p>
        </div>
        <Badge className="bg-teal-700 text-white">가중 {weightedRevenue.toLocaleString()}만원</Badge>
      </div>
      <div className="border-b border-slate-200/80 bg-slate-50/70 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1 sm:max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-medium text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="거래처 후보·지역·상태·메모 검색"
            type="search"
            value={query}
          />
        </label>
        <label className="sr-only" htmlFor="pipeline-result-filter">영업 상태</label>
        <select
          className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          id="pipeline-result-filter"
          onChange={(event) => setResultFilter(event.target.value)}
          value={resultFilter}
        >
          <option value="all">전체 상태</option>
          {Object.entries(resultLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {hasActiveFilters ? (
          <button className="maju-button-secondary min-h-11 justify-center" onClick={() => { setQuery(""); setResultFilter("all"); }} type="button">
            <X className="h-4 w-4" /> 초기화
          </button>
        ) : null}
        <p aria-live="polite" className="shrink-0 text-xs font-semibold text-slate-500">{filteredItems.length.toLocaleString()} / {items.length.toLocaleString()}건</p>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="영업 상태 빠른 필터">
          <button className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${resultFilter === "all" ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-600"}`} onClick={() => setResultFilter("all")} type="button">
            전체 {items.length.toLocaleString()}
          </button>
          {Object.entries(resultLabels).map(([value, label]) => (
            <button className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${resultFilter === value ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-600"}`} key={value} onClick={() => setResultFilter(value)} type="button">
              {label} {(resultCounts[value] || 0).toLocaleString()}
            </button>
          ))}
        </div>
      </div>
      <p className="border-b border-slate-100 px-4 py-2 text-xs font-medium text-slate-500 sm:hidden">표를 좌우로 밀어 전체 항목을 확인하세요.</p>
      <div className="max-h-[calc(100dvh-330px)] min-h-[320px] overflow-auto overscroll-contain">
        <table className="w-full min-w-[880px] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50/95 shadow-[0_1px_0_#e2e8f0]">
            <tr className="text-left text-xs font-black text-slate-500">
              <th className="border-b border-slate-200 px-4 py-3 text-center">No</th>
              <SortableTh active={sortKey === "leadName"} className="border-b border-slate-200 px-4 py-3" direction={sortDirection} label="거래처 후보" onClick={() => toggleSort("leadName")} />
              <SortableTh active={sortKey === "result"} className="border-b border-slate-200 px-4 py-3" direction={sortDirection} label="상태" onClick={() => toggleSort("result")} />
              <SortableTh
                active={sortKey === "probability"}
                className="border-b border-slate-200 px-4 py-3 text-right"
                direction={sortDirection}
                label="계약 확률"
                onClick={() => toggleSort("probability")}
              />
              <SortableTh
                active={sortKey === "weightedRevenue"}
                className="border-b border-slate-200 px-4 py-3 text-right"
                direction={sortDirection}
                label="가중 매출"
                onClick={() => toggleSort("weightedRevenue")}
              />
              <th className="border-b border-slate-200 px-4 py-3">다음 행동</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((item, index) => (
              <tr key={item.id} className="font-bold text-slate-800 odd:bg-white even:bg-slate-50/60 hover:bg-teal-50/60">
                <td className="border-b border-slate-100 px-4 py-3 text-center text-xs text-slate-400">{index + 1}</td>
                <td className="border-b border-slate-100 px-4 py-3">
                  <p className="font-black text-slate-950">{item.leadName}</p>
                  <p className="mt-1 line-clamp-1 text-xs font-semibold text-slate-500">{item.memo || "메모 없음"}</p>
                </td>
                <td className="border-b border-slate-100 px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge className="bg-slate-100 text-slate-700">{item.region}</Badge>
                    <Badge className={`ring-1 ring-inset ${resultTones[item.result] || resultTones.failed}`}>{resultLabels[item.result] || item.result}</Badge>
                  </div>
                </td>
                <td className="border-b border-slate-100 px-4 py-3 text-right text-lg font-black">{Math.round(item.probability * 100)}%</td>
                <td className="border-b border-slate-100 px-4 py-3 text-right text-lg font-black text-teal-700">{item.weightedRevenue.toLocaleString()}만원</td>
                <td className="whitespace-nowrap border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
                  <span className="inline-flex items-center gap-1.5">{nextActionLabels[item.result] || "상태 확인"}<ArrowRight className="h-3.5 w-3.5 text-slate-400" /></span>
                </td>
              </tr>
            ))}
            {!filteredItems.length ? (
              <tr>
                <td className="px-4 py-12 text-center text-sm font-bold text-slate-500" colSpan={6}>
                  {items.length ? "검색·상태 조건과 일치하는 매출 후보가 없습니다. 필터를 초기화해 다시 확인하세요." : "아직 관리 중인 매출 후보가 없습니다. 거래처 방문 기록과 견적 요청을 등록하면 이곳에 표시됩니다."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

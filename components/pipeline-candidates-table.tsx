"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
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

type PipelineItem = RevenuePipeline["items"][number];

// 2026-09-01 피드백: "서비스 내에 모든 표헤더들은 클릭하면 오름차순/내림차순으로 정렬되도록 만들어" —
// 이 표는 app/revenue/pipeline/page.tsx(서버 컴포넌트) 안에 있었는데, 정렬은 클릭 상태(useState)가
// 필요해 클라이언트 컴포넌트로 분리했습니다(서버 컴포넌트 안에서 훅을 쓸 수 없음 — 2026-08-31
// 배포 장애의 원인이 바로 이 서버/클라이언트 경계를 잘못 다룬 것이었어서, 이번엔 처음부터 별도
// "use client" 파일로 뽑았습니다).
export function PipelineCandidatesTable({ items, weightedRevenue }: { readonly items: PipelineItem[]; readonly weightedRevenue: number }) {
  const [query, setQuery] = useState("");
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko");
    if (!normalizedQuery) return items;
    return items.filter((item) =>
      [item.leadName, item.memo, item.region, resultLabels[item.result] || item.result]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("ko").includes(normalizedQuery))
    );
  }, [items, query]);
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
      <div className="border-b border-slate-200/80 bg-slate-50/70 px-3 py-3">
        <label className="relative block max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm font-medium text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="거래처 후보·지역·상태·메모 검색"
            type="search"
            value={query}
          />
        </label>
        {query ? <p className="mt-2 text-xs font-semibold text-slate-500">검색 결과 {filteredItems.length.toLocaleString()}건</p> : null}
      </div>
      <p className="border-b border-slate-100 px-4 py-2 text-xs font-medium text-slate-500 sm:hidden">표를 좌우로 밀어 전체 항목을 확인하세요.</p>
      <div className="overflow-x-auto overscroll-x-contain">
        <table className="w-full min-w-[880px] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-white">
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
                    <Badge className="bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">{resultLabels[item.result] || item.result}</Badge>
                  </div>
                </td>
                <td className="border-b border-slate-100 px-4 py-3 text-right text-lg font-black">{Math.round(item.probability * 100)}%</td>
                <td className="border-b border-slate-100 px-4 py-3 text-right text-lg font-black text-teal-700">{item.weightedRevenue.toLocaleString()}만원</td>
              </tr>
            ))}
            {!filteredItems.length ? (
              <tr>
                <td className="px-4 py-12 text-center text-sm font-bold text-slate-500" colSpan={5}>
                  {items.length ? "검색 조건과 일치하는 매출 후보가 없습니다." : "아직 관리 중인 매출 후보가 없습니다. 거래처 방문 기록과 견적 요청을 등록하면 이곳에 표시됩니다."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

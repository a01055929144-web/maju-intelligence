"use client";

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
  type PipelineSortKey = "leadName" | "probability" | "region" | "result" | "weightedRevenue";
  const { sortDirection, sortKey, sortedRows, toggleSort } = useTableSort<PipelineItem, PipelineSortKey>(items, {
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
          <h2 className="text-lg font-black text-slate-950">후보 목록</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">견적·관심 거래처 우선순위</p>
        </div>
        <Badge className="bg-teal-700 text-white">가중 {weightedRevenue.toLocaleString()}만원</Badge>
      </div>
      <div className="overflow-x-auto">
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
            {!items.length ? (
              <tr>
                <td className="px-4 py-12 text-center text-sm font-bold text-slate-500" colSpan={5}>
                  아직 관리 중인 매출 후보가 없습니다. 거래처 방문 기록과 견적 요청을 등록하면 이곳에 표시됩니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

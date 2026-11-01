"use client";

import { useMemo, useState } from "react";
import {
  basePriceImportFields,
  buildBasePriceImportPreview,
  suggestBasePriceImportMapping,
  type BasePriceImportField,
  type BasePriceImportMapping,
  type BasePriceRawRow,
} from "@/domains/product/base-price-import";

export function BasePriceImportMappingPreview({ headers, rows, onMappingChange }: {
  headers: string[];
  rows: BasePriceRawRow[];
  onMappingChange?: (mapping: BasePriceImportMapping) => void;
}) {
  const [mapping, setMapping] = useState<BasePriceImportMapping>(() => suggestBasePriceImportMapping(headers));
  const preview = useMemo(() => {
    try { return buildBasePriceImportPreview(rows, mapping); }
    catch (error) { return { error: error instanceof Error ? error.message : "미리보기를 만들지 못했습니다." }; }
  }, [mapping, rows]);

  function update(field: BasePriceImportField, header: string) {
    const next = { ...mapping, [field]: header || undefined };
    setMapping(next);
    onMappingChange?.(next);
  }

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-labelledby="base-price-mapping-title">
    <div className="border-b border-slate-200 px-4 py-5 sm:px-6">
      <h2 id="base-price-mapping-title" className="text-lg font-bold tracking-[-0.02em] text-slate-950">기준 단가 열 맞추기</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">천년경영 등 ERP의 참고 단가 열을 날짜별 기준 매입가와 기준 매출가에 연결합니다.</p>
    </div>
    <div className="grid gap-4 bg-slate-50 px-4 py-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-5">
      {basePriceImportFields.map((field) => <label key={field.key} className="text-sm font-semibold text-slate-700">
        {field.label}{field.required ? <span className="ml-1 text-rose-600" aria-label="필수">*</span> : null}
        <select value={mapping[field.key] || ""} onChange={(event) => update(field.key, event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200">
          <option value="">선택 안 함</option>
          {headers.map((header) => <option key={header} value={header}>{header}</option>)}
        </select>
      </label>)}
    </div>
    {"error" in preview ? <p className="m-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 sm:m-6" role="alert">{preview.error}</p> : <>
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-y border-slate-200 px-4 py-3 text-sm text-slate-600 sm:px-6" aria-live="polite"><span>미리보기 <strong className="font-semibold text-slate-950">{preview.items.length}행</strong></span><span>제외 <strong className="font-semibold text-amber-800">{preview.excludedCount}행</strong></span></div>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-100 text-xs font-semibold tracking-wide text-slate-600"><tr><th className="px-6 py-3">원본 행</th><th className="px-3 py-3">적용일</th><th className="px-3 py-3">상품</th><th className="px-3 py-3 text-right">기준 매입가</th><th className="px-6 py-3 text-right">기준 매출가</th></tr></thead><tbody className="divide-y divide-slate-200">{preview.items.slice(0, 100).map((item) => <tr key={`${item.sourceRowNumber}-${item.productCode}`}><td className="px-6 py-4 tabular-nums text-slate-500">{item.sourceRowNumber}</td><td className="px-3 py-4 tabular-nums text-slate-700">{item.effectiveDate}</td><td className="px-3 py-4"><strong className="block text-slate-950">{item.productName || item.productCode}</strong>{item.productCode && item.productName ? <span className="mt-0.5 block text-xs text-slate-500">{item.productCode}</span> : null}</td><td className="px-3 py-4 text-right font-semibold tabular-nums text-slate-950">{item.baseCost.toLocaleString("ko-KR")}원</td><td className="px-6 py-4 text-right font-semibold tabular-nums text-slate-950">{item.basePrice.toLocaleString("ko-KR")}원</td></tr>)}</tbody></table></div>
      <div className="divide-y divide-slate-200 md:hidden">{preview.items.slice(0, 100).map((item) => <article key={`${item.sourceRowNumber}-${item.productCode}`} className="space-y-3 px-4 py-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-950">{item.productName || item.productCode}</h3>{item.productCode && item.productName ? <p className="mt-0.5 text-xs text-slate-500">{item.productCode}</p> : null}</div><time className="shrink-0 text-sm tabular-nums text-slate-600">{item.effectiveDate}</time></div><dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm"><div><dt className="text-xs text-slate-500">기준 매입가</dt><dd className="mt-1 font-semibold tabular-nums text-slate-950">{item.baseCost.toLocaleString("ko-KR")}원</dd></div><div><dt className="text-xs text-slate-500">기준 매출가</dt><dd className="mt-1 font-semibold tabular-nums text-slate-950">{item.basePrice.toLocaleString("ko-KR")}원</dd></div></dl></article>)}</div>
    </>}
  </section>;
}

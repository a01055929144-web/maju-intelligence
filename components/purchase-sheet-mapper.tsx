"use client";

import { useState } from "react";
import { PURCHASE_IMPORT_FIELDS, type PurchaseImportFieldKey, type PurchaseImportMapping, type PurchaseSheet, type VatMode } from "@/domains/pricing/purchase-import";

const PAGE = 50;

/**
 * 11/4: 매입가 엑셀 열 맞추기 — 카드 대신 표 머리글에서 바로 고릅니다.
 * 머리글이 비어 있으면 'A열'처럼 엑셀 열 이름으로 보여 줍니다.
 */
export function PurchaseSheetMapper({
  mapping,
  onMapping,
  onVatMode,
  sheet,
  vatMode
}: {
  readonly mapping: PurchaseImportMapping;
  readonly onMapping: (next: PurchaseImportMapping) => void;
  readonly onVatMode: (mode: VatMode) => void;
  readonly sheet: PurchaseSheet;
  readonly vatMode: VatMode;
}) {
  const [page, setPage] = useState(0);
  const fieldOf = (columnIndex: number) => (Object.entries(mapping).find(([, index]) => index === columnIndex)?.[0] || "") as PurchaseImportFieldKey | "";
  const missing = PURCHASE_IMPORT_FIELDS.filter((field) => "required" in field && field.required && mapping[field.key] === undefined);
  const pages = Math.max(1, Math.ceil(sheet.rows.length / PAGE));
  const visible = sheet.rows.slice(page * PAGE, page * PAGE + PAGE);

  function assign(columnIndex: number, key: PurchaseImportFieldKey | "") {
    const next: PurchaseImportMapping = {};
    for (const [field, index] of Object.entries(mapping) as Array<[PurchaseImportFieldKey, number]>) if (index !== columnIndex && field !== key) next[field] = index;
    if (key) next[key] = columnIndex;
    onMapping(next);
  }

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <p className="font-black text-slate-900">열 맞추기</p>
        <p className="text-xs font-semibold text-slate-500">
          {sheet.headerRowNumber > 0 ? `${sheet.headerRowNumber}행을 머리글로 읽었습니다 · ` : "머리글이 없어 엑셀 열 이름으로 표시합니다 · "}
          {sheet.rows.length.toLocaleString()}행 · 각 열 맨 위에서 항목을 고르세요.
        </p>
        <label className="ml-auto flex items-center gap-2 text-xs font-bold text-slate-700">
          단가 기준
          <select aria-label="단가 부가세 기준" className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold" onChange={(event) => onVatMode(event.target.value as VatMode)} value={vatMode}>
            <option value="auto">자동 (수량·합계로 판단)</option>
            <option value="excluded">부가세 별도</option>
            <option value="included">부가세 포함</option>
          </select>
        </label>
      </div>
      {mapping.vatAmount !== undefined ? <p className="rounded-md bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">부가세가 따로 적힌 파일이라 단가는 <b>부가세 별도</b> 금액으로 봅니다. 부가세 칸에 금액이 있으면 과세, 0이거나 비어 있으면 면세로 기록합니다.</p> : null}
      {missing.length ? <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">필수 항목을 골라 주세요: {missing.map((field) => field.label).join(", ")}</p> : null}
      <div className="max-w-full overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-slate-50">
            <tr>
              <th className="w-12 border-b border-r border-slate-200 px-2 py-2 text-left font-black text-slate-400">행</th>
              {sheet.columns.map((column) => {
                const key = fieldOf(column.index);
                const field = PURCHASE_IMPORT_FIELDS.find((item) => item.key === key);
                return (
                  <th className={`min-w-[140px] border-b border-r border-slate-200 px-2 py-2 text-left align-top ${key ? "bg-teal-50" : ""}`} key={column.index}>
                    <p className="truncate font-bold text-slate-500" title={column.header || undefined}>{column.letter}열{column.header ? ` · ${column.header}` : ""}</p>
                    <select
                      aria-label={`${column.letter}열 항목`}
                      className={`mt-1 h-8 w-full rounded-md border px-1.5 text-xs font-black ${key ? "border-teal-500 bg-white text-teal-800" : "border-slate-200 bg-white text-slate-500"}`}
                      onChange={(event) => assign(column.index, event.target.value as PurchaseImportFieldKey | "")}
                      value={key}
                    >
                      <option value="">사용 안 함</option>
                      {PURCHASE_IMPORT_FIELDS.map((item) => <option key={item.key} value={item.key}>{item.label}{"required" in item && item.required ? " (필수)" : ""}</option>)}
                    </select>
                    {field && "required" in field && field.required ? <span className="mt-1 inline-block rounded bg-teal-700 px-1.5 py-0.5 text-[10px] font-black text-white">필수</span> : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr className="border-b border-slate-100" key={row.rowNumber}>
                <td className="border-r border-slate-100 px-2 py-1.5 text-slate-400">{row.rowNumber}</td>
                {row.cells.map((cell, index) => <td className={`max-w-[240px] truncate border-r border-slate-100 px-2 py-1.5 ${fieldOf(index) ? "text-slate-900" : "text-slate-400"}`} key={index} title={cell}>{cell || "·"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-xs font-bold text-slate-600">
          <button className="maju-button-secondary h-8 px-2 text-xs" disabled={page === 0} onClick={() => setPage((value) => value - 1)} type="button">이전</button>
          <span>{page + 1} / {pages}</span>
          <button className="maju-button-secondary h-8 px-2 text-xs" disabled={page >= pages - 1} onClick={() => setPage((value) => value + 1)} type="button">다음</button>
        </div>
      ) : null}
    </div>
  );
}

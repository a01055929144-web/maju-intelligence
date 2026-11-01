"use client";

import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import {
  getImportRowChanges,
  restoreAllImportPreviewRows,
  restoreImportPreviewRow,
  updateImportPreviewCell,
  type ImportPreviewField,
  type ImportPreviewRow,
} from "@/domains/product/import-row-editor";

type ImportRowEditorProps = {
  fields: ImportPreviewField[];
  initialRows: ImportPreviewRow[];
  onRowsChange?: (rows: ImportPreviewRow[]) => void;
};

export function ImportRowEditor({ fields, initialRows, onRowsChange }: ImportRowEditorProps) {
  const [rows, setRows] = useState(() => restoreAllImportPreviewRows(initialRows).map((row, index) => ({
    ...row,
    values: { ...initialRows[index].values },
  })));
  const rowChanges = useMemo(
    () => new Map(rows.map((row) => [row.id, getImportRowChanges(row, fields)])),
    [fields, rows],
  );
  const changeSets = Array.from(rowChanges.values());
  const changedRowCount = changeSets.filter((changes) => changes.length > 0).length;
  const changedCellCount = changeSets.reduce((total, changes) => total + changes.length, 0);

  function commit(nextRows: ImportPreviewRow[]) {
    setRows(nextRows);
    onRowsChange?.(nextRows);
  }

  function updateCell(rowId: string, fieldKey: string, value: string) {
    commit(updateImportPreviewCell(rows, rowId, fieldKey, value));
  }

  function restoreRow(rowId: string) {
    commit(restoreImportPreviewRow(rows, rowId));
  }

  function restoreAll() {
    if (changedCellCount === 0 || !window.confirm("수정한 값을 모두 원본으로 되돌릴까요?")) return;
    commit(restoreAllImportPreviewRows(rows));
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-labelledby="import-preview-title">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 id="import-preview-title" className="text-lg font-bold tracking-[-0.02em] text-slate-950">가져오기 값 확인</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">잘못 읽힌 값을 수정하세요. 변경한 칸에는 원본이 함께 표시됩니다.</p>
        </div>
        <button
          type="button"
          onClick={restoreAll}
          disabled={changedCellCount === 0}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw aria-hidden="true" className="h-4 w-4" /> 전체 원본 복원
        </button>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 bg-slate-50 px-4 py-3 text-sm text-slate-600 sm:px-6" aria-live="polite">
        <span>전체 <strong className="font-semibold text-slate-950">{rows.length}행</strong></span>
        <span>수정 <strong className="font-semibold text-amber-800">{changedRowCount}행 · {changedCellCount}칸</strong></span>
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="w-20 px-4 py-3 sm:px-6">원본 행</th>
              {fields.map((field) => <th key={field.key} className="min-w-40 px-3 py-3">{field.label}</th>)}
              <th className="w-24 px-4 py-3 text-right">복원</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((row) => {
              const changes = rowChanges.get(row.id) ?? [];
              return (
                <tr key={row.id} className="align-top">
                  <td className="px-4 py-4 font-medium tabular-nums text-slate-500 sm:px-6">{row.sourceRowNumber}</td>
                  {fields.map((field) => {
                    const changed = changes.some((change) => change.fieldKey === field.key);
                    return (
                      <td key={field.key} className="px-3 py-3">
                        <label className="sr-only" htmlFor={`${row.id}-${field.key}`}>{row.sourceRowNumber}행 {field.label}</label>
                        <input
                          id={`${row.id}-${field.key}`}
                          value={row.values[field.key] ?? ""}
                          onChange={(event) => updateCell(row.id, field.key, event.target.value)}
                          className={`min-h-11 w-full rounded-lg border px-3 py-2 text-slate-950 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-200 ${changed ? "border-amber-400 bg-amber-50" : "border-slate-300 bg-white"}`}
                        />
                        {changed && <p className="mt-1.5 text-xs leading-5 text-amber-800">원본: {row.originalValues[field.key] || "(빈 값)"}</p>}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => restoreRow(row.id)} disabled={changes.length === 0} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-30">이 행</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-slate-200 md:hidden">
        {rows.map((row) => {
          const changes = rowChanges.get(row.id) ?? [];
          return (
            <article key={row.id} className="space-y-4 px-4 py-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-slate-950">원본 {row.sourceRowNumber}행</h3>
                <button type="button" onClick={() => restoreRow(row.id)} disabled={changes.length === 0} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-30">이 행 복원</button>
              </div>
              {fields.map((field) => {
                const changed = changes.some((change) => change.fieldKey === field.key);
                return (
                  <label key={field.key} className="block text-sm font-medium text-slate-700">
                    {field.label}
                    <input value={row.values[field.key] ?? ""} onChange={(event) => updateCell(row.id, field.key, event.target.value)} className={`mt-1.5 min-h-11 w-full rounded-xl border px-3 py-2 text-base text-slate-950 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-200 ${changed ? "border-amber-400 bg-amber-50" : "border-slate-300 bg-white"}`} />
                    {changed && <span className="mt-1.5 block text-xs font-normal leading-5 text-amber-800">원본: {row.originalValues[field.key] || "(빈 값)"}</span>}
                  </label>
                );
              })}
            </article>
          );
        })}
      </div>
    </section>
  );
}

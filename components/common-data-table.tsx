"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Pin, Printer, RotateCcw, Settings2 } from "lucide-react";
import { COMMON_TABLE_PAGE_SIZES, normalizeColumnState, setColumnWidth, type CommonColumnState } from "@/lib/common-data-table";

export type CommonTableColumn<Row> = {
  key: string;
  label: string;
  value: (row: Row) => string | number | null | undefined;
  render?: (row: Row, index: number) => React.ReactNode;
  sortable?: boolean;
  align?: "left" | "center" | "right";
  defaultHidden?: boolean;
  total?: boolean;
  width?: number;
};

export function CommonDataTable<Row>({
  columns,
  emptyMessage = "표시할 항목이 없습니다.",
  error,
  filename = "목록.csv",
  loading = false,
  groupBy,
  pageSizeMode = "list",
  phoneCards = false,
  rowKey,
  rows,
  settingsKey,
}: {
  columns: CommonTableColumn<Row>[];
  emptyMessage?: string;
  /** 불러오기 실패 문구. 있으면 빈 상태 대신 보인다. */
  error?: string | null;
  filename?: string;
  loading?: boolean;
  groupBy?: (row: Row) => { key: string; label: string } | null;
  pageSizeMode?: keyof typeof COMMON_TABLE_PAGE_SIZES;
  /** 휴대폰(≤640px)에서 표 대신 카드로 보여준다. 기본 꺼짐(기존 화면 유지), 화면별로 켠다. */
  phoneCards?: boolean;
  rowKey: (row: Row) => string;
  rows: Row[];
  /** 화면 id와 사용자 id를 합친 값. 예: products:user-123 */
  settingsKey: string;
}) {
  const defaults = useMemo(() => normalizeColumnState(columns), [columns]);
  const [columnState, setColumnState] = useState(defaults);
  const [editorOpen, setEditorOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageSizes = COMMON_TABLE_PAGE_SIZES[pageSizeMode];
  const [pageSize, setPageSize] = useState<number>(pageSizes[0]);
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const storageKey = `maju:table:${settingsKey}`;
  // 휴대폰(≤640px)은 표 대신 카드. 한쪽만 그려서 같은 글자가 화면에 두 번 생기지 않게 한다.
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    if (!phoneCards) return;
    const query = window.matchMedia("(max-width: 639px)");
    const sync = () => setMobile(query.matches);
    sync(); query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [phoneCards]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null") as CommonColumnState[] | null;
      setColumnState(normalizeColumnState(columns, Array.isArray(saved) ? saved : undefined));
    } catch {
      setColumnState(defaults);
    }
  }, [columns, defaults, storageKey]);

  function persist(next: CommonColumnState[]) {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* private browsing */ }
  }

  function save(next: CommonColumnState[]) {
    setColumnState(next);
    persist(next);
  }

  /** 머리글 오른쪽 끝을 끌어 너비를 바꾼다. 끄는 동안은 화면만, 놓을 때 저장. */
  function startResize(event: React.PointerEvent<HTMLElement>, key: string) {
    event.preventDefault(); event.stopPropagation();
    const startX = event.clientX;
    const startWidth = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 160;
    let latest = columnState;
    const onMove = (move: PointerEvent) => { latest = setColumnWidth(columnState, key, startWidth + move.clientX - startX); setColumnState(latest); };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); persist(latest); };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
  }

  function resizeByKey(event: React.KeyboardEvent<HTMLElement>, key: string, current: number) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault(); event.stopPropagation();
    save(setColumnWidth(columnState, key, current + (event.key === "ArrowRight" ? 16 : -16)));
  }

  const orderedColumns = columnState.map((state) => ({ ...state, column: columns.find((column) => column.key === state.key)! })).filter((item) => item.column && !item.hidden);
  const displayColumns = [...orderedColumns.filter((item) => item.pinned), ...orderedColumns.filter((item) => !item.pinned)];
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((item) => item.key === sort.key);
    if (!column) return rows;
    return [...rows].sort((left, right) => {
      const a = column.value(left); const b = column.value(right);
      const result = typeof a === "number" && typeof b === "number" ? a - b : String(a ?? "").localeCompare(String(b ?? ""), "ko", { numeric: true });
      return sort.direction === "asc" ? result : -result;
    });
  }, [columns, rows, sort]);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function toggleSort(key: string) {
    setSort((current) => current?.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" });
  }

  function move(key: string, targetKey: string) {
    if (key === targetKey) return;
    const next = [...columnState]; const from = next.findIndex((item) => item.key === key); const to = next.findIndex((item) => item.key === targetKey);
    if (from < 0 || to < 0) return;
    const [item] = next.splice(from, 1); next.splice(to, 0, item); save(next);
  }

  function downloadCsv() {
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const lines = [displayColumns.map((item) => escape(item.column.label)).join(","), ...sortedRows.map((row) => displayColumns.map((item) => escape(item.column.value(row))).join(","))];
    const url = URL.createObjectURL(new Blob([`\ufeff${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
  }

  const stateMessage = error ?? (loading ? "불러오는 중…" : emptyMessage);
  let lastGroup = "";
  const totals = displayColumns.map((item) => item.column.total ? sortedRows.reduce((sum, row) => sum + Number(item.column.value(row) || 0), 0) : null);

  return <div className="common-data-table relative">
    <div className="common-data-table-tools flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 p-3">
      <label className="flex items-center gap-2 text-xs font-bold text-slate-600">보기 <select className="rounded-md border border-slate-200 bg-white px-2 py-1" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>{pageSizes.map((size) => <option key={size} value={size}>{size}개</option>)}</select></label>
      <div className="flex flex-wrap gap-2">
        <button className="maju-button-secondary h-9 text-xs" onClick={downloadCsv} type="button"><Download className="h-3.5 w-3.5" /> 엑셀 내려받기</button>
        <button className="maju-button-secondary h-9 text-xs" onClick={() => window.print()} type="button"><Printer className="h-3.5 w-3.5" /> 인쇄</button>
        <button className="maju-button-secondary h-9 text-xs" onClick={() => setEditorOpen((value) => !value)} type="button"><Settings2 className="h-3.5 w-3.5" /> 열 편집</button>
      </div>
    </div>
    {editorOpen ? <div className="common-data-table-tools absolute right-3 top-14 z-30 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between"><b className="text-sm">열 편집</b><button className="text-xs font-bold text-teal-700" onClick={() => save(defaults)} type="button"><RotateCcw className="mr-1 inline h-3 w-3" />기본으로</button></div>
      <p className="mb-2 text-xs text-slate-500">끌어서 순서를 바꾸세요. 열 너비는 머리글 오른쪽 끝을 끌거나 ←→ 키로 바꿉니다.</p>
      {columnState.map((state) => { const column = columns.find((item) => item.key === state.key)!; return <div className="flex items-center gap-2 border-t border-slate-100 py-2 text-sm" draggable key={state.key} onDragStart={(event) => event.dataTransfer.setData("text/plain", state.key)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => move(event.dataTransfer.getData("text/plain"), state.key)}>
        <span className="cursor-grab text-slate-400">⋮⋮</span><input checked={!state.hidden} onChange={() => save(columnState.map((item) => item.key === state.key ? { ...item, hidden: !item.hidden } : item))} type="checkbox" /><span className="flex-1">{column.label}</span><button aria-label={`${column.label} 고정`} className={state.pinned ? "text-teal-700" : "text-slate-300"} onClick={() => save(columnState.map((item) => item.key === state.key ? { ...item, pinned: !item.pinned } : item))} type="button"><Pin className="h-4 w-4" /></button>
      </div>; })}
    </div> : null}
    {mobile ? null : <div className="max-h-[calc(100dvh-360px)] min-h-[360px] overflow-auto overscroll-contain">
      <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-20 bg-slate-50 shadow-[0_1px_0_#cbd5e1]"><tr>{displayColumns.map((item, index) => <th className={`border-b border-slate-300 px-3 py-3 text-xs font-black text-slate-600 ${item.column.align === "right" ? "text-right" : item.column.align === "center" ? "text-center" : "text-left"} ${item.pinned ? "sticky z-20 bg-slate-50" : "relative"}`} key={item.key} onClick={() => item.column.sortable !== false && toggleSort(item.key)} style={item.pinned ? { left: displayColumns.slice(0, index).filter((value) => value.pinned).reduce((sum, value) => sum + (value.width ?? value.column.width ?? 160), 0), minWidth: item.width ?? item.column.width ?? 160 } : { minWidth: item.width ?? item.column.width, width: item.width }}><button disabled={item.column.sortable === false} type="button">{item.column.label}{item.column.sortable === false ? "" : sort?.key === item.key ? sort.direction === "asc" ? " ↑" : " ↓" : " ↕"}</button><span aria-label={`${item.column.label} 열 너비 조절`} aria-orientation="vertical" className="common-data-table-tools absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none select-none hover:bg-teal-300 focus:bg-teal-400 focus:outline-none" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => resizeByKey(event, item.key, item.width ?? item.column.width ?? 160)} onPointerDown={(event) => startResize(event, item.key)} role="separator" tabIndex={0} /></th>)}</tr></thead>
        <tbody>{pageRows.flatMap((row, rowIndex) => {
          const group = groupBy?.(row); const groupRow = group && group.key !== lastGroup ? <tr className="common-data-table-group" key={`group:${group.key}`}><td className="border-y-[2.5px] border-slate-700 bg-slate-100 px-3 py-2 font-black" colSpan={displayColumns.length}>■ {group.label}</td></tr> : null; if (group) lastGroup = group.key;
          return [groupRow, <tr className="odd:bg-white even:bg-slate-50/60" key={rowKey(row)}>{displayColumns.map((item, columnIndex) => <td className={`border-b border-slate-200 px-3 py-2.5 ${item.column.align === "right" ? "text-right tabular-nums" : item.column.align === "center" ? "text-center" : ""} ${item.pinned ? "sticky z-10 bg-inherit" : ""}`} key={item.key} style={item.pinned ? { left: displayColumns.slice(0, columnIndex).filter((value) => value.pinned).reduce((sum, value) => sum + (value.width ?? value.column.width ?? 160), 0), minWidth: item.width ?? item.column.width ?? 160 } : undefined}>{item.column.render ? item.column.render(row, (currentPage - 1) * pageSize + rowIndex) : item.column.value(row) ?? "-"}</td>)}</tr>];
        })}{!pageRows.length ? <tr><td className="px-4 py-12 text-center font-bold text-slate-500" colSpan={displayColumns.length} role={error ? "alert" : undefined}>{stateMessage}</td></tr> : null}</tbody>
        {totals.some((value) => value !== null) ? <tfoot><tr className="font-black"><td className="border-t-4 border-double border-slate-900 px-3 py-3">합계</td>{displayColumns.slice(1).map((item, index) => <td className="border-t-4 border-double border-slate-900 px-3 py-3 text-right" key={item.key}>{totals[index + 1]?.toLocaleString("ko-KR") ?? ""}</td>)}</tr></tfoot> : null}
      </table>
    </div>}
    {/* 휴대폰(≤640px): 줄마다 카드. 같은 열 설정(보이기·순서)을 따른다. */}
    {mobile ? <ul className="divide-y divide-slate-200">
      {pageRows.map((row, rowIndex) => <li className="space-y-1 px-3 py-3 text-sm" key={rowKey(row)}>
        {displayColumns.map((item) => <div className="flex justify-between gap-3" key={item.key}><span className="shrink-0 text-xs font-bold text-slate-500">{item.column.label}</span><span className={`min-w-0 text-right ${item.column.align === "right" ? "tabular-nums" : ""}`}>{item.column.render ? item.column.render(row, (currentPage - 1) * pageSize + rowIndex) : item.column.value(row) ?? "-"}</span></div>)}
      </li>)}
      {!pageRows.length ? <li className="px-4 py-10 text-center text-sm font-bold text-slate-500" role={error ? "alert" : undefined}>{stateMessage}</li> : null}
    </ul> : null}
    <div className="common-data-table-tools flex items-center justify-between border-t border-slate-200 p-3 text-xs font-bold text-slate-500"><span>{sortedRows.length ? `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, sortedRows.length)} / ${sortedRows.length}` : "0건"}</span><div className="flex items-center gap-2"><button disabled={currentPage <= 1} onClick={() => setPage((value) => value - 1)} type="button">이전</button><span>{currentPage} / {totalPages}</span><button disabled={currentPage >= totalPages} onClick={() => setPage((value) => value + 1)} type="button">다음</button></div></div>
    <div className="common-data-table-print-legend hidden">■ 묶음 · ★ 요청 · ※ 주의·계근 · ▲ 시세 · ☐ 체크</div>
    <style>{`@media print{.common-data-table-tools{display:none!important}.common-data-table{color:#000}.common-data-table table{font-size:11px}.common-data-table th,.common-data-table td{border-color:#777!important}.common-data-table-group td{border-color:#000!important;border-width:2.5px 0!important}.common-data-table-print-legend{display:block!important;border-top:1px solid #777;margin-top:8px;padding-top:6px;font-size:10px}.common-data-table td{background:#fff!important}.common-data-table td:nth-last-child(1){font-weight:700}.common-data-table tfoot td{border-top:3px double #000!important}}`}</style>
  </div>;
}

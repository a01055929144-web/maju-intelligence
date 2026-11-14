"use client";

import { SearchInput } from "@/components/ui/search-input";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Pin, Printer, RotateCcw, Settings2 } from "lucide-react";
import { gridTsv, moveGridCell, nextEditableCell, rangeKeys, type GridCell, type GridMoveKey } from "@/lib/common-data-table";
import { autoHiddenKeys, BULK_BATCH_SIZE, chunk, shortenCategoryPath, COMMON_TABLE_PAGE_SIZES, countByKey, matchesQuery, COMMON_COLUMN_DRAG_MIN_PX, dragBoundary, normalizeColumnState, PAGE_SIZE_ALL, pctsFromPx, pickPageSize, redistributePct, rowNumber, setColumnWidth, VIRTUAL_THRESHOLD, visibleRange, type CommonColumnState } from "@/lib/common-data-table";

const ROW_HEIGHT = 40;
const COMPACT_ROW_HEIGHT = 32;
const LEAD_SELECT_PX = 40;
const LEAD_NUMBER_PX = 48;

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
  /** 표 위 검색창이 이 열의 값에서 찾는다. 하나도 없으면 검색창이 없다. */
  searchable?: boolean;
  /** 폭이 모자랄 때 숨기는 순서(1 중요 ~ 3 덜 중요). 없으면 절대 자동 숨김 안 함. */
  priority?: 1 | 2 | 3;
  /** 너비를 따로 정하지 않은 열이 남는 폭을 나누는 비율(기본 1). */
  weight?: number;
  /** CC-41: 값이 "A > B > C" 분류 경로. 한 줄 말줄임(마지막 분류 남김) + 마우스를 올리면 전체. */
  path?: boolean;
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
  categoryKey,
  facets,
  majorOrder,
  selection: selectionProp,
  selectable = true,
  numbered = true,
  bulkActions,
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
  /** 상품 계열: 대분류 칩(개수 포함) + 중분류 선택을 표 위에 둔다. */
  categoryKey?: (row: Row) => { major?: string | null; minor?: string | null };
  /** 대분류 칩 순서(분류 폴더 순서). 없는 값은 많은 순. */
  majorOrder?: readonly string[];
  /** 화면별 선택 필터(예: 매장 등급·카탈로그). 값이 같은 줄끼리 묶는다. */
  facets?: Array<{ key: string; label: string; value: (row: Row) => string | null | undefined }>;
  /** 줄 선택(체크 열 + 머리 전체 선택). 없으면 체크 열 없음. */
  selection?: { selected: ReadonlySet<string>; onChange: (next: Set<string>) => void };
  /** CC-38: 1열 선택 상자(기본 켜짐). selection을 주면 그것을 쓰고, 없으면 표가 내부 상태로 선택하며 일괄 도구 띠를 보여 준다. 읽기 전용 표 등 꼭 필요할 때만 끈다. */
  selectable?: boolean;
  /** CC-38: 2열 번호(걸러진·정렬된 순서, 기본 켜짐). */
  numbered?: boolean;
  /** 선택한 줄에 대한 화면별 동작(일괄 도구 띠 버튼). 내부 선택일 때만 보인다. */
  bulkActions?: Array<{ label: string; onClick?: (selectedKeys: string[]) => void; /** 서버로 보내는 동작: 선택 줄을 100개씩 나눠 차례로 부른다(서버 일괄 API가 1회 100개 제한). 던지면 그 묶음이 실패 줄로 표시된다. */ run?: (batchKeys: string[]) => Promise<void> }>;
  /** 화면 id와 사용자 id를 합친 값. 예: products:user-123 */
  settingsKey: string;
}) {
  const defaults = useMemo(() => normalizeColumnState(columns), [columns]);
  const [columnState, setColumnState] = useState(defaults);
  const [editorOpen, setEditorOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageSizes = COMMON_TABLE_PAGE_SIZES[pageSizeMode];
  const [pageSize, setPageSize] = useState<number>(pageSizes[0]);
  const [compact, setCompact] = useState(false);
  const [innerSelected, setInnerSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ label: string; done: number; total: number; running: boolean } | null>(null);
  const [failedKeys, setFailedKeys] = useState<Set<string>>(new Set());
  const internalSelection = !selectionProp && selectable;
  const selection = selectionProp ?? (selectable ? { selected: innerSelected as ReadonlySet<string>, onChange: setInnerSelected } : undefined);
  const leadCount = (selection ? 1 : 0) + (numbered ? 1 : 0);
  const lead = (selection ? LEAD_SELECT_PX : 0) + (numbered ? LEAD_NUMBER_PX : 0);
  const rowHeight = compact ? COMPACT_ROW_HEIGHT : ROW_HEIGHT;
  const [availableWidth, setAvailableWidth] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [major, setMajor] = useState("");
  const [minor, setMinor] = useState("");
  const [facetSel, setFacetSel] = useState<Record<string, string>>({});
  useEffect(() => { const t = setTimeout(() => { setQuery(queryInput); setPage(1); }, 200); return () => clearTimeout(t); }, [queryInput]);
  const [windowRange, setWindowRange] = useState({ start: 0, end: 60 });
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
    try { setCompact(localStorage.getItem(`${storageKey}:density`) === "compact"); } catch { /* 보통 */ }
    try { setPageSize(pickPageSize(pageSizes, JSON.parse(localStorage.getItem(`${storageKey}:size`) || "null"))); } catch { /* 기본 개수 */ }
  }, [pageSizes, storageKey]);
  useEffect(() => {
    const node = wrapRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setAvailableWidth(node.clientWidth));
    observer.observe(node); setAvailableWidth(node.clientWidth);
    return () => observer.disconnect();
  }, [mobile]);

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

  /** 지금 보이는 열의 비율(%). 저장된 비율이 없으면 실제 화면 너비로 계산한다. */
  function currentPcts(headers?: HTMLElement | null) {
    if (pcts) return pcts;
    const widths = headers ? Array.from(headers.querySelectorAll<HTMLElement>("th[data-col]")).map((th) => th.getBoundingClientRect().width) : displayColumns.map(needOf);
    return pctsFromPx(widths);
  }
  /** 이 열의 오른쪽 경계를 옮긴다: 오른쪽 열이 그만큼 줄어 표 전체 폭은 그대로(좌우 스크롤 없음). */
  function applyPcts(next: number[]) {
    const byKey = new Map(displayColumns.map((item, index) => [item.key, next[index]]));
    return columnState.map((item) => (byKey.has(item.key) ? { ...item, pct: byKey.get(item.key), width: undefined } : item)).map(({ width, ...rest }) => (width === undefined ? rest : { ...rest, width }));
  }
  function startResize(event: React.PointerEvent<HTMLElement>, key: string) {
    event.preventDefault(); event.stopPropagation();
    const index = displayColumns.findIndex((item) => item.key === key);
    const head = event.currentTarget.closest("tr");
    const tableWidth = Math.max(1, (head?.getBoundingClientRect().width ?? 1) - lead);
    const startPcts = currentPcts(head);
    const startX = event.clientX;
    const minPct = (COMMON_COLUMN_DRAG_MIN_PX / tableWidth) * 100;
    let latest = columnState;
    const onMove = (move: PointerEvent) => { latest = applyPcts(dragBoundary(startPcts, index, ((move.clientX - startX) / tableWidth) * 100, minPct)); setColumnState(latest); };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); persist(latest); };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
  }

  function resizeByKey(event: React.KeyboardEvent<HTMLElement>, key: string) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault(); event.stopPropagation();
    const index = displayColumns.findIndex((item) => item.key === key);
    const head = event.currentTarget.closest("tr");
    const tableWidth = Math.max(1, (head?.getBoundingClientRect().width ?? 1) - lead);
    save(applyPcts(dragBoundary(currentPcts(head), index, ((event.key === "ArrowRight" ? 16 : -16) / tableWidth) * 100, (COMMON_COLUMN_DRAG_MIN_PX / tableWidth) * 100)));
  }

  /** 더블클릭: 그 열 내용에 맞춘다(넘치는 만큼 오른쪽 열과 나눔). */
  function fitColumn(event: React.MouseEvent<HTMLElement>, key: string) {
    event.stopPropagation();
    const index = displayColumns.findIndex((item) => item.key === key);
    const table = event.currentTarget.closest("table");
    const head = event.currentTarget.closest("tr");
    if (!table || !head) return;
    const tableWidth = Math.max(1, head.getBoundingClientRect().width - lead);
    const cells = Array.from(table.querySelectorAll<HTMLElement>(`td[data-col="${CSS.escape(key)}"] > div, th[data-col="${CSS.escape(key)}"] > button`));
    const wanted = Math.max(COMMON_COLUMN_DRAG_MIN_PX, ...cells.map((cell) => cell.scrollWidth + 28));
    const pcts0 = currentPcts(head);
    save(applyPcts(dragBoundary(pcts0, index, (wanted / tableWidth) * 100 - pcts0[index], (COMMON_COLUMN_DRAG_MIN_PX / tableWidth) * 100)));
  }

  // v2에서 px로 저장한 너비는 처음 열 때 비율로 바꿔 이어 쓴다(맞춰 둔 값이 사라지지 않게).
  useEffect(() => {
    if (!availableWidth) return;
    const shown = columnState.filter((item) => !item.hidden && columns.some((column) => column.key === item.key));
    if (!shown.some((item) => item.width !== undefined) || shown.some((item) => item.pct !== undefined)) return;
    const next = pctsFromPx(shown.map((item) => item.width ?? columns.find((column) => column.key === item.key)?.width ?? 120));
    const byKey = new Map(shown.map((item, index) => [item.key, next[index]]));
    save(columnState.map(({ width, ...item }) => (byKey.has(item.key) ? { ...item, pct: byKey.get(item.key) } : width === undefined ? item : { ...item, width })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableWidth, columnState, columns]);
  const orderedColumns = columnState.map((state) => ({ ...state, column: columns.find((column) => column.key === state.key)! })).filter((item) => item.column && !item.hidden);
  const needOf = (item: (typeof orderedColumns)[number]) => item.width ?? item.column.width ?? (item.column.align === "right" ? 96 : 120);
  // 폭이 모자라면 priority 큰(덜 중요한) 열부터 자동 숨김. 사용자가 열을 직접 넓혔으면(너비 저장) 그대로 두고 좌우 스크롤.
  const customPct = orderedColumns.some((item) => item.pct !== undefined);
  const userWidened = customPct;
  const autoHidden = userWidened || !availableWidth ? [] : autoHiddenKeys(orderedColumns.map((item) => ({ key: item.key, need: needOf(item), priority: item.column.priority })), availableWidth - lead);
  const visibleColumns = orderedColumns.filter((item) => !autoHidden.includes(item.key));
  const displayColumns = [...visibleColumns.filter((item) => item.pinned), ...visibleColumns.filter((item) => !item.pinned)];
  const searchColumns = useMemo(() => columns.filter((column) => column.searchable), [columns]);
  const filtered = useMemo(() => rows.filter((row) => {
    if (query && !matchesQuery(searchColumns.map((column) => column.value(row)), query)) return false;
    if (categoryKey && (major || minor)) { const c = categoryKey(row); if (major && (c.major?.trim() || "기타") !== major) return false; if (minor && (c.minor?.trim() || "기타") !== minor) return false; }
    return (facets ?? []).every((facet) => !facetSel[facet.key] || (facet.value(row)?.trim() || "없음") === facetSel[facet.key]);
  }), [rows, query, searchColumns, categoryKey, major, minor, facets, facetSel]);
  const majorCounts = useMemo(() => categoryKey ? countByKey(rows.map((row) => categoryKey(row).major), majorOrder) : [], [rows, categoryKey, majorOrder]);
  const minorCounts = useMemo(() => categoryKey && major ? countByKey(rows.filter((row) => (categoryKey(row).major?.trim() || "기타") === major).map((row) => categoryKey(row).minor)) : [], [rows, categoryKey, major]);
  const filtering = Boolean(query || major || minor || Object.values(facetSel).some(Boolean));
  // 열을 더 숨길 수 없는데도 모자라면 표 상자 안에서만 좌우로 민다(쪽 전체가 넘치지 않게). 아니면 상자 너비에 비례해 줄인다.
  const totalNeed = visibleColumns.reduce((sum, item) => sum + needOf(item), 0);
  const weightedNeed = visibleColumns.reduce((sum, item) => sum + needOf(item) * (item.column.weight ?? 1), 0);
  // 너비를 끌어 바꿔도 좌우 스크롤은 생기지 않는다(옆 열과 나눔). 열이 너무 많아 최소폭 합이 화면보다 클 때만 표 상자 안에서 민다.
  const scrolls = availableWidth > 0 && (customPct ? displayColumns.length * COMMON_COLUMN_DRAG_MIN_PX + lead > availableWidth : totalNeed + lead > availableWidth);
  const pcts = customPct ? redistributePct(displayColumns.map((item) => item.pct)) : null;
  const sortedRows = useMemo(() => {
    if (!sort) return filtered;
    const column = columns.find((item) => item.key === sort.key);
    if (!column) return filtered;
    return [...filtered].sort((left, right) => {
      const a = column.value(left); const b = column.value(right);
      const result = typeof a === "number" && typeof b === "number" ? a - b : String(a ?? "").localeCompare(String(b ?? ""), "ko", { numeric: true });
      return sort.direction === "asc" ? result : -result;
    });
  }, [columns, filtered, sort]);
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = pageSize === PAGE_SIZE_ALL ? sortedRows : sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  // 500줄 이상은 보이는 줄만 그린다(줄 높이 40px 고정). 묶음 머리줄이 있으면 높이가 달라 쓰지 않는다.
  const virtual = !groupBy && !mobile && pageRows.length > VIRTUAL_THRESHOLD;
  useEffect(() => {
    if (!virtual) return;
    const node = wrapRef.current;
    if (!node) return;
    let parent: HTMLElement | null = node.parentElement;
    while (parent && !/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) parent = parent.parentElement;
    const target: HTMLElement | Window = parent ?? window;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = (parent ?? document.documentElement).getBoundingClientRect().top;
      const viewport = parent ? parent.clientHeight : window.innerHeight;
      const body = node.querySelector("tbody")?.getBoundingClientRect().top ?? 0;
      setWindowRange(visibleRange(pageRows.length, rowHeight, Math.max(0, (parent ? top : 0) - body), viewport));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update(); target.addEventListener("scroll", schedule, { passive: true }); window.addEventListener("resize", schedule);
    return () => { if (frame) cancelAnimationFrame(frame); target.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); };
  }, [virtual, pageRows.length, rowHeight]);
  const renderRows = virtual ? pageRows.slice(windowRange.start, windowRange.end) : pageRows;
  const rowOffset = virtual ? windowRange.start : 0;

  function toggleSort(key: string) {
    setSort((current) => current?.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" });
  }

  function move(key: string, targetKey: string) {
    if (key === targetKey) return;
    const next = [...columnState]; const from = next.findIndex((item) => item.key === key); const to = next.findIndex((item) => item.key === targetKey);
    if (from < 0 || to < 0) return;
    const [item] = next.splice(from, 1); next.splice(to, 0, item); save(next);
  }

  async function runInBatches(label: string, keys: string[], run: (batchKeys: string[]) => Promise<void>) {
    setFailedKeys(new Set()); setProgress({ label, done: 0, total: keys.length, running: true });
    const failed = new Set<string>(); let done = 0;
    for (const batch of chunk(keys, BULK_BATCH_SIZE)) {
      try { await run(batch); } catch { batch.forEach((key) => failed.add(key)); }
      done += batch.length; setProgress({ label, done, total: keys.length, running: true });
    }
    setFailedKeys(failed); setProgress({ label, done, total: keys.length, running: false });
  }

  function downloadCsv(onlySelected = false) {
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const numberOf = new Map(sortedRows.map((row, index) => [rowKey(row), index + 1]));
    const source = onlySelected && selection ? sortedRows.filter((row) => selection.selected.has(rowKey(row))) : sortedRows;
    const lines = [[...(numbered ? ["번호"] : []), ...displayColumns.map((item) => item.column.label)].map(escape).join(","), ...source.map((row) => [...(numbered ? [numberOf.get(rowKey(row))] : []), ...displayColumns.map((item) => item.column.value(row))].map(escape).join(","))];
    const url = URL.createObjectURL(new Blob([`\ufeff${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
  }

  // ---- CC-44a: 엑셀처럼 키보드 이동 · 편집 · 선택 · 복사 ----
  const [cursor, setCursor] = useState<GridCell | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const anchorRef = useRef(0);
  const gridSize = { rows: pageRows.length, cols: displayColumns.length };
  const pageBase = pageSize === PAGE_SIZE_ALL ? 0 : (currentPage - 1) * pageSize;
  const EDITOR = "input:not([type=checkbox]),select,textarea";
  const cellNode = (cell: GridCell) => wrapRef.current?.querySelector<HTMLElement>(`[data-cell="${cell.row}:${cell.col}"]`) ?? null;
  const editorOf = (cell: GridCell) => cellNode(cell)?.querySelector<HTMLElement>(EDITOR) ?? null;
  function startEdit(cell: GridCell) {
    const node = editorOf(cell);
    if (!node) return false;
    node.focus();
    if (node instanceof HTMLInputElement) node.select();
    return true;
  }
  /** 현재 칸을 옮기고, 입력칸이면 바로 편집(edit), 아니면 표에 초점을 둔다. */
  function goTo(cell: GridCell, edit = false) {
    setCursor(cell);
    // 저장 중에는 입력칸이 잠겨(disabled) 있거나 다시 그려질 수 있어, 풀릴 때까지 몇 프레임(최대 약 1초) 기다린다.
    let tries = 0;
    const attempt = () => {
      const node = editorOf(cell) as HTMLInputElement | null;
      if (edit && node && !node.disabled && startEdit(cell)) return;
      if (edit && tries++ < 60) { requestAnimationFrame(attempt); return; }
      wrapRef.current?.focus({ preventScroll: true });
      cellNode(cell)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    requestAnimationFrame(attempt);
  }
  useEffect(() => { setCursor((current) => (current && current.row >= pageRows.length ? null : current)); }, [pageRows.length]);

  function copyText(): string {
    const rowsToCopy = selection && selection.selected.size ? sortedRows.map((row, index) => ({ row, index })).filter(({ row }) => selection.selected.has(rowKey(row))) : null;
    if (rowsToCopy) return gridTsv(rowsToCopy.map(({ row, index }) => [...(numbered ? [index + 1] : []), ...displayColumns.map((item) => item.column.value(row))]));
    const row = cursor ? pageRows[cursor.row] : undefined;
    const item = cursor ? displayColumns[cursor.col] : undefined;
    return row && item ? gridTsv([[item.column.value(row)]]) : "";
  }

  function onGridClick(event: React.MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    const cell = target.closest<HTMLElement>("td[data-cell]");
    if (!cell) return;
    const [row, col] = cell.dataset.cell!.split(":").map(Number);
    setCursor({ row, col });
    if (event.shiftKey && selection) selection.onChange(new Set(rangeKeys(pageRows.map(rowKey), anchorRef.current, row)));
    else anchorRef.current = row;
    if (!target.closest("input,select,textarea,button,a")) wrapRef.current?.focus({ preventScroll: true });
  }

  function onGridKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.nativeEvent.isComposing || event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    if (target.closest("thead")) return; // 열 너비 조절(←→) 등 머리 키는 그대로
    const mod = event.ctrlKey || event.metaKey;
    const own = target.closest<HTMLElement>("td[data-cell]");

    if (target.matches(EDITOR)) { // 편집 중
      if (!own) return;
      const [row, col] = own.dataset.cell!.split(":").map(Number);
      const here = { row, col };
      const input = target as HTMLInputElement;
      const leave = (next: GridCell, edit: boolean) => { input.blur(); goTo(next, edit && (next.row !== here.row || next.col !== here.col)); };
      if (event.key === "Enter" && !mod && target.tagName !== "TEXTAREA") {
        event.preventDefault();
        leave(moveGridCell(here, event.shiftKey ? "ArrowUp" : "ArrowDown", gridSize).cell, true);
      } else if (event.key === "Escape") {
        requestAnimationFrame(() => goTo(here)); // 입력칸이 원래 값으로 되돌린 뒤 표로 초점 복귀
      } else if ((event.key === "ArrowUp" || event.key === "ArrowDown") && target.tagName !== "SELECT" && !mod) {
        event.preventDefault();
        leave(moveGridCell(here, event.key, gridSize).cell, false);
      } else if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && target.tagName === "INPUT" && !mod && !event.shiftKey && input.selectionStart === input.selectionEnd && input.selectionStart === (event.key === "ArrowLeft" ? 0 : input.value.length)) {
        event.preventDefault();
        leave(moveGridCell(here, event.key, gridSize).cell, false);
      } else if (event.key === "Tab") {
        const next = nextEditableCell(here, event.shiftKey, gridSize, (cell) => Boolean(editorOf(cell)));
        if (next) { event.preventDefault(); leave(next, true); }
      }
      return;
    }

    if (target.matches("input[type=checkbox],button,a,summary,[role=separator]")) return; // 자체 동작(Space·Enter) 유지
    const key = event.key;
    const here = cursor ?? { row: 0, col: 0 };
    if (!pageRows.length) return;
    const moveKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"];
    if (moveKeys.includes(key)) {
      if (mod && key !== "Home" && key !== "End") return;
      event.preventDefault();
      if (!cursor) { anchorRef.current = 0; goTo(here); return; }
      const step = Math.max(1, Math.floor((wrapRef.current?.clientHeight || 400) / rowHeight) - 1);
      const result = moveGridCell(here, key as GridMoveKey, gridSize, { ctrl: mod, pageStep: step });
      if (result.overflow === "next" && currentPage < totalPages) { setPage((value) => value + 1); anchorRef.current = 0; goTo({ row: 0, col: here.col }); return; }
      if (result.overflow === "prev" && currentPage > 1 && pageSize !== PAGE_SIZE_ALL) { setPage((value) => value - 1); anchorRef.current = pageSize - 1; goTo({ row: pageSize - 1, col: here.col }); return; }
      if (event.shiftKey && (key === "ArrowUp" || key === "ArrowDown") && selection) selection.onChange(new Set(rangeKeys(pageRows.map(rowKey), anchorRef.current, result.cell.row)));
      else anchorRef.current = result.cell.row;
      goTo(result.cell);
      return;
    }
    if (key === "Escape") { setCursor(null); return; }
    if ((key === "Enter" || key === "F2") && !mod) { if (startEdit(here)) event.preventDefault(); return; }
    if (mod && (key === "a" || key === "A")) { if (selection && target === event.currentTarget) { event.preventDefault(); selection.onChange(new Set(sortedRows.map(rowKey))); } return; }
    if (mod && (key === "c" || key === "C")) {
      if (window.getSelection()?.toString()) return; // 글자를 드래그해 둔 경우는 브라우저 복사
      const text = copyText();
      if (text) { event.preventDefault(); void navigator.clipboard?.writeText(text).catch(() => undefined); }
      return;
    }
    if (mod || event.altKey || key.length !== 1) return;
    if (key === " ") {
      if (!selection || !cursor) return;
      event.preventDefault();
      const next = new Set(selection.selected); const rowId = rowKey(pageRows[here.row]);
      if (next.has(rowId)) next.delete(rowId); else next.add(rowId);
      anchorRef.current = here.row; selection.onChange(next);
      return;
    }
    if (key === "/") { event.preventDefault(); wrapRef.current?.closest(".common-data-table")?.querySelector<HTMLInputElement>("[data-table-search]")?.focus(); return; }
    if (key === "?") { event.preventDefault(); setHelpOpen((value) => !value); return; }
    if (cursor) startEdit(here); // 글자 입력 = 그 칸 편집 시작(덮어쓰기) — 글자는 새 초점 칸에 들어간다
  }

  const stateMessage = error ?? (loading ? "불러오는 중…" : emptyMessage);
  let lastGroup = "";
  const totals = displayColumns.map((item) => item.column.total ? sortedRows.reduce((sum, row) => sum + Number(item.column.value(row) || 0), 0) : null);

  return <div className="common-data-table relative">
    {searchColumns.length || categoryKey || facets?.length ? <div className="common-data-table-tools flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white p-3">
      {searchColumns.length ? <SearchInput aria-label="표 검색" className="w-56" inputProps={{ "data-table-search": "" }} onChange={setQueryInput} placeholder={`검색 (${searchColumns.map((column) => column.label).join("·")})`} size="sm" value={queryInput} /> : null}
      {categoryKey ? <div aria-label="대분류" className="flex flex-wrap gap-1.5" role="group">
        <button aria-pressed={!major} className={`min-h-8 rounded-full border px-3 text-xs font-bold ${!major ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 text-slate-700"}`} onClick={() => { setMajor(""); setMinor(""); setPage(1); }} type="button">전체 {rows.length.toLocaleString("ko-KR")}</button>
        {majorCounts.map((item) => <button aria-pressed={major === item.key} className={`min-h-8 rounded-full border px-3 text-xs font-bold ${major === item.key ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 text-slate-700"}`} key={item.key} onClick={() => { setMajor(item.key); setMinor(""); setPage(1); }} type="button">{item.key} {item.count.toLocaleString("ko-KR")}</button>)}
      </div> : null}
      {categoryKey && major && minorCounts.length > 1 ? <select aria-label="중분류" className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs" onChange={(event) => { setMinor(event.target.value); setPage(1); }} value={minor}><option value="">중분류 전체</option>{minorCounts.map((item) => <option key={item.key} value={item.key}>{item.key} ({item.count})</option>)}</select> : null}
      {(facets ?? []).map((facet) => <select aria-label={facet.label} className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs" key={facet.key} onChange={(event) => { setFacetSel({ ...facetSel, [facet.key]: event.target.value }); setPage(1); }} value={facetSel[facet.key] ?? ""}><option value="">{facet.label} 전체</option>{countByKey(rows.map((row) => facet.value(row) || "없음")).map((item) => <option key={item.key} value={item.key}>{item.key} ({item.count})</option>)}</select>)}
      {filtering ? <span className="text-xs font-bold text-slate-500">검색 결과 {sortedRows.length.toLocaleString("ko-KR")} / 전체 {rows.length.toLocaleString("ko-KR")}</span> : null}
    </div> : null}
    <div className="common-data-table-tools flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 p-3">
      <label className="flex items-center gap-2 text-xs font-bold text-slate-600">보기 <select className="rounded-md border border-slate-200 bg-white px-2 py-1" value={pageSize} onChange={(event) => { const size = Number(event.target.value); setPageSize(size); setPage(1); try { localStorage.setItem(`${storageKey}:size`, JSON.stringify(size)); } catch { /* private browsing */ } }}>{pageSizes.map((size) => <option key={size} value={size}>{size === PAGE_SIZE_ALL ? "전체" : `${size}개`}</option>)}</select>{autoHidden.length ? <span className="ml-2 font-medium text-slate-500">열 {autoHidden.length}개 숨김 · <button className="font-bold text-teal-700 underline" onClick={() => setEditorOpen(true)} type="button">열 편집</button></span> : null}</label>
      <div className="flex flex-wrap gap-2">
        <div aria-label="줄 높이" className="inline-flex overflow-hidden rounded-md border border-slate-300 text-xs font-bold" role="group">{(["보통", "촘촘"] as const).map((label) => { const on = (label === "촘촘") === compact; return <button aria-pressed={on} className={`h-9 px-3 ${on ? "bg-slate-800 text-white" : "bg-white text-slate-600"}`} key={label} onClick={() => { setCompact(label === "촘촘"); try { localStorage.setItem(`${storageKey}:density`, label === "촘촘" ? "compact" : "normal"); } catch { /* private browsing */ } }} type="button">{label}</button>; })}</div>
        <button className="maju-button-secondary h-9 text-xs" onClick={() => downloadCsv()} type="button"><Download className="h-3.5 w-3.5" /> 엑셀 내려받기</button>
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
    {internalSelection && selection && selection.selected.size ? <div aria-label="일괄 도구" className="common-data-table-tools flex flex-wrap items-center gap-2 border-b border-teal-300 bg-teal-50 px-3 py-2 text-sm" role="group">
      <b>선택 {selection.selected.size.toLocaleString("ko-KR")}개<span className="ml-1 text-xs font-normal text-slate-600">(걸러진 {sortedRows.length.toLocaleString("ko-KR")}줄 중)</span></b>
      <button className="maju-button-secondary h-8 text-xs" onClick={() => downloadCsv(true)} type="button"><Download className="h-3.5 w-3.5" /> 엑셀 내려받기</button>
      <button className="maju-button-secondary h-8 text-xs" onClick={() => window.print()} type="button"><Printer className="h-3.5 w-3.5" /> 인쇄</button>
      {(bulkActions ?? []).map((action) => <button className="maju-button-secondary h-8 text-xs" disabled={progress?.running} key={action.label} onClick={() => { const keys = Array.from(selection.selected); if (action.run) void runInBatches(action.label, keys, action.run); else action.onClick?.(keys); }} type="button">{action.label}</button>)}
      {progress ? <span aria-live="polite" className={`text-xs font-bold ${!progress.running && failedKeys.size ? "text-rose-700" : "text-slate-700"}`} role="status">{progress.label}: {progress.total.toLocaleString("ko-KR")}개 중 {progress.done.toLocaleString("ko-KR")}개 {progress.running ? "진행 중" : "완료"}{!progress.running && failedKeys.size ? ` · 실패 ${failedKeys.size.toLocaleString("ko-KR")}개(빨간 줄)` : ""}</span> : null}
      <button className="ml-auto text-xs font-bold text-slate-600 underline" onClick={() => selection.onChange(new Set())} type="button">선택 해제</button>
    </div> : null}
    {mobile ? null : <div className={`${scrolls ? "overflow-x-auto " : ""}outline-none`} onClick={onGridClick} onKeyDown={onGridKeyDown} ref={wrapRef} tabIndex={0}>
      <table aria-colcount={displayColumns.length + leadCount} aria-rowcount={sortedRows.length + 1} className="w-full table-fixed border-separate border-spacing-0 text-sm" style={scrolls ? { minWidth: customPct ? displayColumns.length * COMMON_COLUMN_DRAG_MIN_PX + lead : totalNeed + lead } : undefined}>
        <colgroup>{selection ? <col style={{ width: LEAD_SELECT_PX }} /> : null}{numbered ? <col style={{ width: LEAD_NUMBER_PX }} /> : null}{displayColumns.map((item, index) => <col key={item.key} style={{ width: pcts ? `${pcts[index]}%` : scrolls ? needOf(item) : `${((needOf(item) * (item.column.weight ?? 1)) / (weightedNeed || 1)) * 100}%` }} />)}</colgroup>
        <thead className="sticky top-[var(--maju-table-sticky-top,0px)] z-20 bg-slate-50 shadow-[0_1px_0_#cbd5e1]"><tr>{selection ? <th className="sticky left-0 z-20 border-b border-slate-300 bg-slate-50 px-2 py-3"><input aria-label={`걸러진 ${sortedRows.length.toLocaleString("ko-KR")}줄 전체 선택`} checked={sortedRows.length > 0 && sortedRows.every((row) => selection.selected.has(rowKey(row)))} onChange={(event) => { const next = new Set(selection.selected); sortedRows.forEach((row) => event.target.checked ? next.add(rowKey(row)) : next.delete(rowKey(row))); selection.onChange(next); }} type="checkbox" /></th> : null}{numbered ? <th className="sticky z-20 border-b border-slate-300 bg-slate-50 px-2 py-3 text-right text-xs font-black text-slate-500" style={{ left: selection ? LEAD_SELECT_PX : 0 }}>번호</th> : null}{displayColumns.map((item, index) => <th className={`border-b border-slate-300 px-3 py-3 text-xs font-black text-slate-600 ${item.column.align === "right" ? "text-right" : item.column.align === "center" ? "text-center" : "text-left"} ${item.pinned ? "sticky z-20 bg-slate-50" : "relative"}`} data-col={item.key} key={item.key} onClick={() => item.column.sortable !== false && toggleSort(item.key)} style={item.pinned ? { left: lead + displayColumns.slice(0, index).filter((value) => value.pinned).reduce((sum, value) => sum + (value.width ?? value.column.width ?? 160), 0) } : undefined}><button disabled={item.column.sortable === false} type="button">{item.column.label}{item.column.sortable === false ? "" : sort?.key === item.key ? sort.direction === "asc" ? " ↑" : " ↓" : " ↕"}</button>{index < displayColumns.length - 1 ? <span aria-label={`${item.column.label} 열 너비 조절`} aria-orientation="vertical" className="common-data-table-tools absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none select-none after:absolute after:right-0 after:top-1/4 after:h-1/2 after:w-px after:bg-slate-300 hover:bg-teal-100 hover:after:bg-teal-600 focus:bg-teal-200 focus:outline-none" onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => fitColumn(event, item.key)} onKeyDown={(event) => resizeByKey(event, item.key)} onPointerDown={(event) => startResize(event, item.key)} role="separator" tabIndex={0} /> : null}</th>)}</tr></thead>
        <tbody>{virtual && windowRange.start > 0 ? <tr aria-hidden="true" style={{ height: windowRange.start * rowHeight }}><td colSpan={displayColumns.length + leadCount} /></tr> : null}{renderRows.flatMap((row, rowIndex) => {
          const group = groupBy?.(row); const groupRow = group && group.key !== lastGroup ? <tr className="common-data-table-group" key={`group:${group.key}`}><td className="border-y-[2.5px] border-slate-700 bg-slate-100 px-3 py-2 font-black" colSpan={displayColumns.length}>■ {group.label}</td></tr> : null; if (group) lastGroup = group.key;
          return [groupRow, <tr aria-rowindex={pageBase + rowOffset + rowIndex + 2} className={`${compact ? "h-8" : "h-10"} ${failedKeys.has(rowKey(row)) ? "bg-rose-100" : "odd:bg-white even:bg-slate-50/60"}`} key={rowKey(row)}>{selection ? <td className="sticky left-0 z-10 border-b border-slate-200 bg-inherit px-2"><input aria-label="줄 선택" checked={selection.selected.has(rowKey(row))} onChange={(event) => { const next = new Set(selection.selected); event.target.checked ? next.add(rowKey(row)) : next.delete(rowKey(row)); selection.onChange(next); }} type="checkbox" /></td> : null}{numbered ? <td className="sticky z-10 border-b border-slate-200 bg-inherit px-2 text-right text-xs tabular-nums text-slate-400" style={{ left: selection ? LEAD_SELECT_PX : 0 }}>{rowNumber(currentPage, pageSize, rowOffset + rowIndex).toLocaleString("ko-KR")}</td> : null}{displayColumns.map((item, columnIndex) => <td className={`border-b border-slate-200 px-3 ${virtual || compact ? "py-1" : "py-2.5"} ${item.column.align === "right" ? "text-right tabular-nums" : item.column.align === "center" ? "text-center" : ""} ${item.pinned ? "sticky z-10 bg-inherit" : ""} ${cursor?.row === rowOffset + rowIndex && cursor.col === columnIndex ? "ring-2 ring-inset ring-teal-700" : ""}`} aria-colindex={columnIndex + leadCount + 1} aria-current={cursor?.row === rowOffset + rowIndex && cursor.col === columnIndex ? "true" : undefined} data-cell={`${rowOffset + rowIndex}:${columnIndex}`} data-col={item.key} key={item.key} style={item.pinned ? { left: lead + displayColumns.slice(0, columnIndex).filter((value) => value.pinned).reduce((sum, value) => sum + (value.width ?? value.column.width ?? 160), 0) } : undefined} title={typeof item.column.value(row) === "string" ? String(item.column.value(row)) : undefined}><div className={item.column.path ? "truncate" : virtual ? "max-h-8 overflow-hidden" : "line-clamp-2 break-words"} title={item.column.path ? String(item.column.value(row) ?? "") : undefined}>{item.column.render ? item.column.render(row, (pageSize === PAGE_SIZE_ALL ? 0 : (currentPage - 1) * pageSize) + rowOffset + rowIndex) : item.column.path ? shortenCategoryPath(String(item.column.value(row) ?? "")) || "-" : item.column.value(row) ?? "-"}</div></td>)}</tr>];
        })}{virtual && windowRange.end < pageRows.length ? <tr aria-hidden="true" style={{ height: (pageRows.length - windowRange.end) * rowHeight }}><td colSpan={displayColumns.length + leadCount} /></tr> : null}{!pageRows.length ? <tr><td className="px-4 py-12 text-center font-bold text-slate-500" colSpan={displayColumns.length + leadCount} role={error ? "alert" : undefined}>{stateMessage}</td></tr> : null}</tbody>
        {totals.some((value) => value !== null) ? <tfoot><tr className="font-black">{leadCount ? <td className="border-t-4 border-double border-slate-900 px-3 py-3" colSpan={leadCount}>합계</td> : null}<td className="border-t-4 border-double border-slate-900 px-3 py-3">{leadCount ? "" : "합계"}</td>{displayColumns.slice(1).map((item, index) => <td className="border-t-4 border-double border-slate-900 px-3 py-3 text-right" key={item.key}>{totals[index + 1]?.toLocaleString("ko-KR") ?? ""}</td>)}</tr></tfoot> : null}
      </table>
    </div>}
    {/* 휴대폰(≤640px): 줄마다 카드. 같은 열 설정(보이기·순서)을 따른다. */}
    {mobile ? <ul className="divide-y divide-slate-200">
      {pageRows.map((row, rowIndex) => <li className="space-y-1 px-3 py-3 text-sm" key={rowKey(row)}>
        {selection ? <input aria-label="줄 선택" checked={selection.selected.has(rowKey(row))} onChange={(event) => { const next = new Set(selection.selected); event.target.checked ? next.add(rowKey(row)) : next.delete(rowKey(row)); selection.onChange(next); }} type="checkbox" /> : null}
        {displayColumns.map((item) => <div className="flex justify-between gap-3" key={item.key}><span className="shrink-0 text-xs font-bold text-slate-500">{item.column.label}</span><span className={`min-w-0 text-right ${item.column.align === "right" ? "tabular-nums" : ""}`}>{item.column.render ? item.column.render(row, (pageSize === PAGE_SIZE_ALL ? 0 : (currentPage - 1) * pageSize) + rowIndex) : item.column.value(row) ?? "-"}</span></div>)}
      </li>)}
      {!pageRows.length ? <li className="px-4 py-10 text-center text-sm font-bold text-slate-500" role={error ? "alert" : undefined}>{stateMessage}</li> : null}
    </ul> : null}
    <div className="common-data-table-tools flex items-center justify-between border-t border-slate-200 p-3 text-xs font-bold text-slate-500"><span>{sortedRows.length ? (pageSize === PAGE_SIZE_ALL ? `전체 ${sortedRows.length}` : `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, sortedRows.length)} / ${sortedRows.length}`) : "0건"}{selection && sortedRows.length > pageRows.length ? <button className="ml-3 font-bold text-teal-700 underline" onClick={() => selection.onChange(new Set(sortedRows.map(rowKey)))} type="button">필터된 {sortedRows.length.toLocaleString("ko-KR")}개 모두 선택</button> : null}</span><div className="flex items-center gap-2"><button disabled={currentPage <= 1} onClick={() => setPage((value) => value - 1)} type="button">이전</button><span>{currentPage} / {totalPages}</span><button disabled={currentPage >= totalPages} onClick={() => setPage((value) => value + 1)} type="button">다음</button></div></div>
    {helpOpen ? <div aria-label="표 단축키" className="common-data-table-tools fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-slate-300 bg-white p-4 text-xs shadow-xl" role="dialog">
      <div className="mb-2 flex items-center justify-between"><b className="text-sm">표 단축키</b><button aria-label="단축키 닫기" onClick={() => setHelpOpen(false)} type="button">✕</button></div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {[["↑ ↓ ← →", "칸 이동"], ["Enter / F2", "편집 시작 · 저장 후 아래 칸"], ["Shift+Enter", "저장 후 위 칸"], ["Tab / Shift+Tab", "저장 후 옆 입력칸"], ["Esc", "편집 취소 · 칸 선택 해제"], ["글자 입력", "그 칸 편집(덮어쓰기)"], ["Space", "줄 선택 켜기/끄기"], ["Shift+↑↓ · Shift+클릭", "여러 줄 선택"], ["Ctrl/⌘+A", "걸러진 줄 전체 선택"], ["Ctrl/⌘+C", "선택 줄(없으면 현재 칸) 복사"], ["Home / End", "줄 처음/끝 (Ctrl: 표 처음/끝)"], ["PageUp / PageDown", "한 화면씩"], ["/", "검색칸으로"], ["?", "이 도움말"]].map(([keys, what]) => <div className="contents" key={keys}><dt className="font-mono font-bold text-slate-700">{keys}</dt><dd className="text-slate-600">{what}</dd></div>)}
      </dl>
    </div> : null}
    <div className="common-data-table-print-legend hidden">■ 묶음 · ★ 요청 · ※ 주의·계근 · ▲ 시세 · ☐ 체크</div>
    <style>{`@media print{.common-data-table-tools{display:none!important}.common-data-table{color:#000}.common-data-table table{font-size:11px}.common-data-table th,.common-data-table td{border-color:#777!important}.common-data-table-group td{border-color:#000!important;border-width:2.5px 0!important}.common-data-table-print-legend{display:block!important;border-top:1px solid #777;margin-top:8px;padding-top:6px;font-size:10px}.common-data-table td{background:#fff!important}.common-data-table td:nth-last-child(1){font-weight:700}.common-data-table tfoot td{border-top:3px double #000!important}}`}</style>
  </div>;
}

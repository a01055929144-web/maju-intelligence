"use client";
import { useState } from "react";
import { X } from "lucide-react";

// M2a: 지도 검색 결과를 검색창 아래 떠 있는 목록 대신 오른쪽 패널(휴대폰은 지도 아래)에 묶음으로 보여 준다.
// 묶음 4개: 거래처 → 영업 리드 → 신규 리드 → 카카오 미등록 매장. 번호 핀·마우스 올림 강조·결과 전체 보기·아래에서 올라오는 목록은 M2b.
export type SearchResultRow = { id: string; name: string; address: string; industry?: string; chip: string };

type Props = {
  readonly query: string;
  readonly customers: readonly SearchResultRow[];
  readonly salesLeads: readonly SearchResultRow[];
  readonly newLeads: readonly SearchResultRow[];
  readonly unregistered: readonly SearchResultRow[];
  readonly loading: boolean;
  readonly message: string;
  readonly selectedIds: ReadonlySet<string>;
  readonly bulkBusy: boolean;
  readonly bulkMessage: string;
  readonly onClose: () => void;
  readonly onOpenCustomer: (id: string) => void;
  readonly onOpenLead: (id: string) => void;
  readonly onRegister: (id: string) => void;
  readonly onToggle: (id: string) => void;
  readonly onToggleAll: () => void;
  readonly onRegisterSelected: () => void;
};

export function MapSearchResultsPanel(props: Props) {
  const { customers, salesLeads, newLeads, unregistered, selectedIds } = props;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const total = customers.length + salesLeads.length + newLeads.length + unregistered.length;
  const toggleGroup = (key: string) => setCollapsed((old) => { const next = new Set(old); if (next.has(key)) next.delete(key); else next.add(key); return next; });

  const group = (key: string, title: string, rows: readonly SearchResultRow[], action: string, onAction: (id: string) => void, selectable = false) => (
    <section aria-label={title} className="border-b border-slate-100">
      <div className="flex items-center justify-between gap-2 bg-slate-50 px-3 py-1.5">
        <button aria-expanded={!collapsed.has(key)} className="flex min-h-8 items-center gap-1 text-xs font-black text-slate-700" onClick={() => toggleGroup(key)} type="button">
          <span aria-hidden>{collapsed.has(key) ? "▸" : "▾"}</span>{title} {rows.length.toLocaleString()}
        </button>
        {selectable && rows.length ? <label className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-slate-500">
          <input checked={selectedIds.size > 0 && selectedIds.size === rows.length} className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600" onChange={props.onToggleAll} type="checkbox" />전체 선택
        </label> : null}
      </div>
      {collapsed.has(key) ? null : rows.map((row) => <div className={`flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 hover:bg-teal-50 ${selectedIds.has(row.id) ? "bg-teal-50" : ""}`} key={row.id}>
        <div className="flex min-w-0 items-center gap-2">
          {selectable ? <input aria-label={`${row.name} 선택`} checked={selectedIds.has(row.id)} className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-teal-600" onChange={() => props.onToggle(row.id)} type="checkbox" /> : null}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950">{row.name}</p>
            <p className="mt-0.5 truncate text-xs font-bold text-slate-500">{[row.address || "주소 정보 없음", row.industry].filter(Boolean).join(" · ")}</p>
            <span className="mt-0.5 inline-block rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{row.chip}</span>
          </div>
        </div>
        <button className="maju-button-secondary h-8 shrink-0 px-2.5 text-xs" onClick={() => onAction(row.id)} type="button">{action}</button>
      </div>)}
    </section>
  );

  return <section aria-label="검색 결과" className="flex h-full min-h-0 flex-col bg-white">
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
      <h2 className="truncate text-sm font-black text-slate-900">검색 결과 {total.toLocaleString()} <span className="font-semibold text-slate-500">“{props.query.trim()}”</span></h2>
      <button aria-label="검색 결과 닫기" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={props.onClose} type="button"><X className="h-4 w-4" /></button>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto">
      {customers.length ? group("customers", "거래처", customers, "지도에서 보기", props.onOpenCustomer) : null}
      {salesLeads.length ? group("sales", "영업 리드", salesLeads, "상세", props.onOpenLead) : null}
      {newLeads.length ? group("new", "신규 리드", newLeads, "상세", props.onOpenLead) : null}
      {unregistered.length ? group("unregistered", "카카오 미등록 매장", unregistered, "거래처로 등록", props.onRegister, true) : null}
      {props.loading ? <p className="px-3 py-2 text-xs font-bold text-slate-400">미등록 매장 검색 중...</p> : null}
      {!props.loading && !total ? <p className="px-3 py-4 text-sm font-bold text-slate-500">{props.message || "검색 결과가 없습니다."}</p> : null}
      {!props.loading && total && !unregistered.length && props.message ? <p className="px-3 py-2 text-xs font-bold text-slate-400">{props.message}</p> : null}
    </div>
    {selectedIds.size > 0 ? <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 bg-white px-3 py-2">
      <p className="text-xs font-bold text-slate-500">{selectedIds.size}곳 선택됨</p>
      <button className="maju-button-primary h-8 shrink-0 px-3 text-xs disabled:opacity-60" disabled={props.bulkBusy} onClick={props.onRegisterSelected} type="button">{props.bulkBusy ? "등록 중" : `선택 ${selectedIds.size}곳 거래처로 등록`}</button>
    </div> : null}
    {props.bulkMessage ? <p className="shrink-0 border-t border-slate-100 px-3 py-2 text-xs font-bold text-slate-600">{props.bulkMessage}</p> : null}
  </section>;
}

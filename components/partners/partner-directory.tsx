"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FileSpreadsheet, FilePlus2, Plus } from "lucide-react";
import { CommonDataTable, type CommonTableColumn } from "@/components/common-data-table";
import { ErpPartnerDirectoryToolbar } from "@/components/erp-partner-directory-toolbar";
import { formatBusinessNumber, partnerDocumentHref, PARTNER_LABELS, PARTNER_TABS, type PartnerRow, type PartnerTabId, type PartnerType } from "@/domains/partner/directory";
import { formatWon } from "@/domains/shared/money";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

// CC-73 공용 거래처 틀. 왼쪽 목록(공용 표) · 오른쪽 상세(공통 탭 순서: 기본 정보 · 품목/단가 · 전표 · 원장 · 메모). 매출처 · 매입처는 partnerType만 바꿔 쓴다.
// 이 틀은 UI만 맡는다 — 탭 안 내용(기본 정보 폼·품목/단가 표 등)은 쓰는 화면이 주고, 원장·전표 진입은 두 화면 공통이라 여기서 준다.
const money = (value?: number | null) => (value == null ? "-" : formatWon(Math.round(value)));
const dash = (value?: string | null) => (value && value.trim() ? value : "-");

type Props<Row extends PartnerRow> = {
  readonly partnerType: PartnerType;
  readonly rows: readonly Row[];
  readonly companyId?: string;
  readonly loadError?: string;
  /** [+ 등록]: 함수면 버튼, registerHref가 있으면 그 주소로 가는 링크. */
  readonly onRegister?: () => void;
  readonly registerHref?: string;
  /** [엑셀 올리기]가 가는 화면. */
  readonly uploadHref: string;
  /** 매출처만 있는 열(등급 · 영업 단계 · 지도) 같은 추가 열. 렌더마다 새로 만들지 말고 useMemo로 넘긴다. */
  readonly extraColumns?: CommonTableColumn<Row>[];
  /** 탭 내용. 안 주면 "전표"·"원장"은 공통 기본 화면, 나머지는 안내 글. */
  readonly tabs?: Partial<Record<PartnerTabId, (row: Row) => ReactNode>>;
  /** 공통 탭 뒤에 붙는 추가 탭(예: 매출처 영업 타임라인·지도). */
  readonly extraTabs?: ReadonlyArray<{ id: string; label: string; render: (row: Row) => ReactNode }>;
  readonly selectedId?: string;
  readonly onSelect?: (id: string) => void;
};

const NO_COLUMNS: never[] = [];

export function PartnerDirectory<Row extends PartnerRow>({ companyId = "", extraColumns = NO_COLUMNS, extraTabs = [], loadError, onRegister, onSelect, partnerType, registerHref, rows, selectedId, tabs = {}, uploadHref }: Props<Row>) {
  const labels = PARTNER_LABELS[partnerType];
  const [innerId, setInnerId] = useState(rows[0]?.id ?? "");
  const currentId = selectedId ?? innerId;
  const selected = rows.find((row) => row.id === currentId) ?? rows[0];
  const [tab, setTab] = useState<string>("info");
  const selectedKey = selected?.id;
  useEffect(() => { setTab("info"); }, [selectedKey]);

  const columns = useMemo<CommonTableColumn<Row>[]>(() => {
    const choose = (id: string) => { setInnerId(id); onSelect?.(id); };
    return [
      { key: "displayName", label: "표시 상호", value: (row) => row.displayName, searchable: true, sortable: true, priority: 1,
        render: (row) => <button aria-pressed={row.id === selectedKey} className={`text-left font-bold underline-offset-2 hover:underline ${row.id === selectedKey ? "text-teal-800" : "text-slate-900"}`} onClick={() => choose(row.id)} type="button">{row.displayName}</button> },
      { key: "businessName", label: "사업자 상호", value: (row) => row.businessName ?? "", searchable: true, priority: 3, render: (row) => dash(row.businessName) },
      { key: "businessNumber", label: "사업자번호", value: (row) => row.businessNumber ?? "", searchable: true, priority: 2, render: (row) => dash(formatBusinessNumber(row.businessNumber)) },
      { key: "subBusinessNumber", label: "종사업장", value: (row) => row.subBusinessNumber ?? "", priority: 3, render: (row) => dash(row.subBusinessNumber) },
      { key: "representativeName", label: "대표자", value: (row) => row.representativeName ?? "", searchable: true, priority: 3, render: (row) => dash(row.representativeName) },
      { key: "phone", label: "연락처", value: (row) => row.phone ?? "", searchable: true, priority: 2, render: (row) => dash(row.phone) },
      { key: "lastTradeDate", label: "최근 거래일", value: (row) => row.lastTradeDate ?? "", sortable: true, priority: 2, render: (row) => dash(row.lastTradeDate) },
      { key: "monthAmount", label: "이번 달 거래액", value: (row) => row.monthAmount ?? "", sortable: true, align: "right", priority: 2, render: (row) => money(row.monthAmount) },
      { key: "balance", label: labels.balance, value: (row) => row.balance ?? "", sortable: true, align: "right", priority: 1, render: (row) => money(row.balance) },
      { key: "status", label: "상태", value: (row) => row.status, sortable: true, priority: 2 },
      ...extraColumns
    ];
  }, [extraColumns, labels.balance, onSelect, selectedKey]);

  const tabList: ReadonlyArray<readonly [string, string]> = [...PARTNER_TABS.map(([id, label]) => [id, label] as const), ...extraTabs.map((t) => [t.id, t.label] as const)];
  const panel = !selected ? null
    : tab === "documents" ? (tabs.documents?.(selected) ?? <PartnerDocumentsTab companyId={companyId} partner={selected} partnerType={partnerType} />)
    : tab === "ledger" ? (tabs.ledger?.(selected) ?? <PartnerLedgerTab companyId={companyId} partnerId={selected.id} partnerType={partnerType} />)
    : tab === "info" || tab === "items" || tab === "memo" ? (tabs[tab]?.(selected) ?? <p className="text-sm text-slate-500">이 탭의 내용이 아직 연결되지 않았습니다.</p>)
    : (extraTabs.find((t) => t.id === tab)?.render(selected) ?? null);

  return (
    <div className="space-y-3" data-partner-type={partnerType}>
      <div aria-label={`${labels.name} 작업`} className="flex flex-wrap items-center gap-2" role="toolbar">
        <h2 className="mr-auto text-lg font-black text-slate-950">{labels.name}</h2>
        {registerHref
          ? <Link className="maju-button-primary min-h-11 px-3 text-xs sm:min-h-9" href={registerHref}><Plus className="h-4 w-4" /> 등록</Link>
          : <button className="maju-button-primary min-h-11 px-3 text-xs sm:min-h-9" disabled={!onRegister} onClick={onRegister} type="button"><Plus className="h-4 w-4" /> 등록</button>}
        <Link className="maju-button-secondary min-h-11 px-3 text-xs sm:min-h-9" href={uploadHref}><FileSpreadsheet className="h-4 w-4" /> 엑셀 올리기</Link>
        {selected
          ? <Link className="maju-button-secondary min-h-11 px-3 text-xs sm:min-h-9" href={partnerDocumentHref(partnerType, selected.id, companyId)}><FilePlus2 className="h-4 w-4" /> 전표 쓰기</Link>
          : <button className="maju-button-secondary min-h-11 px-3 text-xs sm:min-h-9" disabled type="button"><FilePlus2 className="h-4 w-4" /> 전표 쓰기</button>}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:items-start">
        <section aria-label={`${labels.name} 목록`} className="maju-section-card min-w-0 overflow-hidden">
          <ErpPartnerDirectoryToolbar countLabel={`${rows.length}곳`} description="표시 상호를 눌러 상세를 엽니다. 열은 [열 편집]에서 바꿉니다." error={loadError || undefined} onRetry={loadError ? () => window.location.reload() : undefined} title={`${labels.name} 목록`} />
          <div className="p-3">
            <CommonDataTable columns={columns} emptyMessage={`등록된 ${labels.name}가 없습니다.`} filename={`${labels.name}.csv`} rowKey={(row) => row.id} rows={[...rows]} selectable={false} settingsKey={`partners:${partnerType}`} />
          </div>
        </section>
        <section aria-label={`${labels.name} 상세`} className="maju-section-card min-w-0">
          {selected ? (
            <>
              <div className="border-b border-slate-200/80 px-4 py-3">
                <h3 className="break-words text-base font-black text-slate-950">{selected.displayName}</h3>
                {selected.businessName || selected.subBusinessNumber
                  ? <p className="mt-0.5 text-xs font-semibold text-slate-500">{[selected.businessName ? `사업자 상호 ${selected.businessName}` : "", selected.subBusinessNumber ? `종사업장 ${selected.subBusinessNumber}` : ""].filter(Boolean).join(" · ")}</p>
                  : null}
              </div>
              <div aria-label={`${labels.name} 상세 탭`} className="flex gap-1 overflow-x-auto border-b border-slate-200/80 p-2" role="tablist">
                {tabList.map(([id, label]) => (
                  <button aria-selected={tab === id} className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold ${tab === id ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100"}`} key={id} onClick={() => setTab(id)} role="tab" type="button">{label}</button>
                ))}
              </div>
              <div className="p-4" role="tabpanel">{panel}</div>
            </>
          ) : <p className="p-4 text-sm text-slate-500">{labels.name}를 고르면 상세가 보입니다.</p>}
        </section>
      </div>
    </div>
  );
}

/** 전표 탭 기본 화면 — 전표 목록은 전표 화면이 맡고, 여기서는 그 거래처로 여는 길을 준다. */
function PartnerDocumentsTab({ companyId, partner, partnerType }: { companyId: string; partner: PartnerRow; partnerType: PartnerType }) {
  return (
    <div className="space-y-2 text-sm">
      <p className="text-slate-600">{partner.displayName}의 {partnerType === "customer" ? "매출·반품" : "매입·반품"} 전표는 전표 화면에서 쓰고 봅니다.</p>
      <Link className="maju-button-secondary inline-flex min-h-11 px-3 text-xs sm:min-h-9" href={partnerDocumentHref(partnerType, partner.id, companyId)}>전표 화면 열기</Link>
    </div>
  );
}

type Ledger = { openingBalance: number; closingBalance: number; entries: Array<{ id: string; entry_date: string; entry_type: string; amount: number; runningBalance: number; memo: string | null }> };

/** 원장 탭 기본 화면 — 두 거래처 종류가 같은 `/api/partner-ledger`를 쓴다(읽기 전용). */
export function PartnerLedgerTab({ companyId = "", partnerId, partnerType }: { companyId?: string; partnerId: string; partnerType: PartnerType }) {
  const [state, setState] = useState<{ key: string; data?: Ledger; error?: string }>({ key: "" });
  const key = `${partnerType}|${partnerId}|${companyId}`;
  useEffect(() => {
    let live = true;
    const query = new URLSearchParams({ ...(companyId ? { companyId } : {}), partnerType, partnerId });
    void fetchWithTimeout(`/api/partner-ledger?${query.toString()}`, { cache: "no-store" }, 12000)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || "원장을 불러오지 못했습니다.");
        if (live) setState({ key, data: body as Ledger });
      })
      .catch((error) => { if (live) setState({ key, error: error instanceof Error ? error.message : "원장을 불러오지 못했습니다." }); });
    return () => { live = false; };
  }, [key, companyId, partnerId, partnerType]);
  const labels = PARTNER_LABELS[partnerType];
  const columns = useMemo<CommonTableColumn<Ledger["entries"][number]>[]>(() => [
    { key: "date", label: "날짜", value: (row) => row.entry_date, sortable: true },
    { key: "type", label: "구분", value: (row) => row.entry_type },
    { key: "amount", label: "금액", value: (row) => row.amount, render: (row) => money(row.amount), align: "right", sortable: true },
    { key: "balance", label: labels.balance, value: (row) => row.runningBalance, render: (row) => money(row.runningBalance), align: "right" },
    { key: "memo", label: "메모", value: (row) => row.memo ?? "" }
  ], [labels.balance]);
  const loading = state.key !== key;
  return (
    <div className="space-y-2">
      {state.data ? <p className="text-xs font-bold text-slate-600">기초 {money(state.data.openingBalance)} · 현재 {labels.balance} {money(state.data.closingBalance)}</p> : null}
      <CommonDataTable columns={columns} emptyMessage="원장 내역이 없습니다." error={state.key === key ? state.error : undefined} filename="원장.csv" loading={loading} rowKey={(row) => row.id} rows={state.data?.entries ?? []} selectable={false} settingsKey={`partners:${partnerType}:ledger`} />
    </div>
  );
}

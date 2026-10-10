"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Search, Save, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SortableTh } from "@/components/sortable-th";
import { useTableSort } from "@/lib/use-table-sort";

// 2026-09-01: MAJU 운영자가 고객사별 월 이용료(원)를 설정하는 화면입니다. 이 값이 0원이면
// lib/store.ts의 chargeDueSubscriptions()가 해당 구독을 자동으로 건너뛰므로, 새 고객사는 여기서
// 금액을 먼저 지정해야 자동청구가 시작됩니다.

export type AdminSubscriptionRow = {
  id: string;
  companyId: string;
  companyName: string;
  billingKey: string | null;
  cardNumberMasked: string | null;
  planAmountWon: number;
  status: "pending_card" | "active" | "paused" | "canceled";
  nextBillingDate: string | null;
  lastPaymentStatus: string | null;
  lastPaymentAt: string | null;
};

const statusLabels: Record<AdminSubscriptionRow["status"], string> = {
  pending_card: "카드 미등록",
  active: "정상 청구중",
  paused: "일시중지",
  canceled: "해지됨"
};

const statusTone: Record<AdminSubscriptionRow["status"], string> = {
  pending_card: "bg-amber-50 text-amber-800",
  active: "bg-emerald-50 text-emerald-800",
  paused: "bg-slate-100 text-slate-700",
  canceled: "bg-rose-50 text-rose-800"
};

type SortKey = "companyName" | "lastPaymentStatus" | "nextBillingDate" | "planAmountWon" | "status";
const PAGE_SIZE_OPTIONS = [10, 30, 50, 100] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
type StatusFilter = "all" | AdminSubscriptionRow["status"];

export function AdminBillingWorkspace({ initialSubscriptions, loadError = "" }: { readonly initialSubscriptions: AdminSubscriptionRow[]; readonly loadError?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState(initialSubscriptions);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingCompanyId, setSavingCompanyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [savedCompanyId, setSavedCompanyId] = useState<string | null>(null);
  const [query, setQuery] = useState(() => searchParams.get("q") || "");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => parseStatusFilter(searchParams.get("status")));
  const [page, setPage] = useState(() => parsePositiveInteger(searchParams.get("page"), 1));
  const [pageSize, setPageSize] = useState<PageSize>(() => parsePageSize(searchParams.get("pageSize")));

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    setOrDelete(nextParams, "q", query.trim());
    setOrDelete(nextParams, "status", statusFilter === "all" ? "" : statusFilter);
    setOrDelete(nextParams, "page", page > 1 ? String(page) : "");
    setOrDelete(nextParams, "pageSize", pageSize === 30 ? "" : String(pageSize));
    const nextQuery = nextParams.toString();
    if (nextQuery !== searchParams.toString()) router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [page, pageSize, pathname, query, router, searchParams, statusFilter]);

  const filteredRows = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("ko");
    return rows.filter((row) => {
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesQuery = !keyword || [row.companyName, row.cardNumberMasked || "", row.lastPaymentStatus || ""].some((value) => value.toLocaleLowerCase("ko").includes(keyword));
      return matchesStatus && matchesQuery;
    });
  }, [query, rows, statusFilter]);

  const statusCounts = useMemo(() => ({
    active: rows.filter((row) => row.status === "active").length,
    pending_card: rows.filter((row) => row.status === "pending_card").length,
    paused: rows.filter((row) => row.status === "paused").length,
    canceled: rows.filter((row) => row.status === "canceled").length
  }), [rows]);

  const { sortDirection, sortKey, sortedRows, toggleSort } = useTableSort<AdminSubscriptionRow, SortKey>(filteredRows, {
    companyName: (a, b) => a.companyName.localeCompare(b.companyName, "ko"),
    lastPaymentStatus: (a, b) => (a.lastPaymentStatus || "").localeCompare(b.lastPaymentStatus || ""),
    nextBillingDate: (a, b) => (a.nextBillingDate || "").localeCompare(b.nextBillingDate || ""),
    planAmountWon: (a, b) => a.planAmountWon - b.planAmountWon,
    status: (a, b) => a.status.localeCompare(b.status)
  });
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [currentPage, pageSize, sortedRows]);
  const pageStart = sortedRows.length ? (currentPage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(sortedRows.length, currentPage * pageSize);

  async function savePlanAmount(companyId: string) {
    const draftValue = drafts[companyId];
    const planAmountWon = Number(draftValue);
    if (draftValue === undefined || Number.isNaN(planAmountWon) || planAmountWon < 0) {
      setError("월 이용료는 0 이상의 숫자로 입력해주세요.");
      return;
    }
    setError("");
    setSavedCompanyId(null);
    setSavingCompanyId(companyId);
    try {
      const response = await fetch("/api/admin/billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, planAmountWon })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message || "저장하지 못했습니다.");
      setRows((current) => current.map((row) => (row.companyId === companyId ? { ...row, planAmountWon: body.subscription.planAmountWon } : row)));
      setDrafts((current) => {
        const next = { ...current };
        delete next[companyId];
        return next;
      });
      setSavedCompanyId(companyId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "저장하지 못했습니다.");
    } finally {
      setSavingCompanyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {loadError ? <div role="alert" className="maju-filter-box border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">{loadError}</div> : null}
      {error ? <div aria-live="assertive" className="maju-filter-box border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">{error}</div> : null}

      {statusCounts.pending_card || statusCounts.paused ? (
        <section className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <p className="font-black text-amber-950">청구 전 확인이 필요한 고객사가 {statusCounts.pending_card + statusCounts.paused}곳 있습니다.</p>
              <p className="mt-1 text-sm font-semibold text-amber-800">카드 미등록 고객사를 먼저 확인하고, 일시중지 고객사는 이용료와 재개 여부를 점검하세요.</p>
            </div>
          </div>
          <button className="h-10 shrink-0 rounded-md bg-amber-900 px-4 text-sm font-black text-white hover:bg-amber-950" onClick={() => { setStatusFilter("pending_card"); setPage(1); }} type="button">카드 미등록 보기</button>
        </section>
      ) : (
        <section className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="text-sm font-black">현재 카드 미등록 또는 일시중지 고객사가 없습니다.</p>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <BillingMetric active={statusFilter === "active"} label="정상 청구중" onClick={() => { setStatusFilter("active"); setPage(1); }} value={statusCounts.active} tone="success" />
        <BillingMetric active={statusFilter === "pending_card"} label="카드 미등록" onClick={() => { setStatusFilter("pending_card"); setPage(1); }} value={statusCounts.pending_card} tone="warning" />
        <BillingMetric active={statusFilter === "paused"} label="일시중지" onClick={() => { setStatusFilter("paused"); setPage(1); }} value={statusCounts.paused} />
        <BillingMetric active={statusFilter === "canceled"} label="해지됨" onClick={() => { setStatusFilter("canceled"); setPage(1); }} value={statusCounts.canceled} tone="danger" />
      </div>

      <section className="maju-section-card">
        <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="maju-section-title">고객사별 구독 현황</p>
            <p className="mt-1 maju-muted-label">월 이용료 설정 · 자동결제 상태</p>
          </div>
          <Badge className="bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">{rows.length.toLocaleString()}개 고객사</Badge>
        </div>

        <div className="grid gap-3 border-b border-slate-200 bg-slate-50/60 p-4 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-center">
          <label className="flex h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100">
            <Search className="h-4 w-4 text-slate-400" />
            <span className="sr-only">고객사 또는 카드번호 검색</span>
            <input className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="고객사, 카드번호, 결제 상태 검색..." value={query} />
            {query ? <button aria-label="검색어 지우기" className="-mr-3 grid h-11 w-11 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => { setQuery(""); setPage(1); }} type="button"><X className="h-4 w-4" /></button> : null}
          </label>
          <select className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-teal-500" onChange={(event) => { setStatusFilter(event.target.value as StatusFilter); setPage(1); }} value={statusFilter}>
            <option value="all">전체 결제 상태</option>
            {(Object.keys(statusLabels) as AdminSubscriptionRow["status"][]).map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
          <div className="text-sm font-bold text-slate-500">검색 결과 <strong className="text-slate-950">{filteredRows.length.toLocaleString()}개</strong></div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-500">
          <label className="flex h-9 items-center gap-1 rounded-md border border-slate-200 px-2">
            보기
            <select className="bg-transparent font-black text-slate-900 outline-none" onChange={(event) => { setPageSize(Number(event.target.value) as PageSize); setPage(1); }} value={pageSize}>
              {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}개</option>)}
            </select>
          </label>
          <span>{pageStart.toLocaleString()}-{pageEnd.toLocaleString()} / {sortedRows.length.toLocaleString()}개</span>
          <button className="maju-button-secondary !h-9" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">이전</button>
          <span>{currentPage.toLocaleString()} / {totalPages.toLocaleString()}</span>
          <button className="maju-button-secondary !h-9" disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} type="button">다음</button>
        </div>

        <div className="grid gap-3 p-4 md:hidden">
          {pagedRows.map((row) => <BillingMobileCard drafts={drafts} key={row.id} row={row} saved={savedCompanyId === row.companyId} saving={savingCompanyId === row.companyId} setDrafts={setDrafts} onSave={savePlanAmount} />)}
          {!sortedRows.length ? (
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
              <p className="font-black text-slate-800">{rows.length ? "검색 조건에 맞는 고객사가 없습니다." : "아직 결제 관리 대상 고객사가 없습니다."}</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{rows.length ? "검색어 또는 결제 상태를 변경해보세요." : "고객사가 결제 관리 화면을 한 번 열면 여기에 표시됩니다."}</p>
            </div>
          ) : null}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[960px] border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="text-left text-xs font-black text-slate-500">
                <SortableTh active={sortKey === "companyName"} className="border-b border-slate-200 px-4 py-3" direction={sortDirection} label="고객사" onClick={() => toggleSort("companyName")} />
                <SortableTh active={sortKey === "status"} className="border-b border-slate-200 px-4 py-3" direction={sortDirection} label="상태" onClick={() => toggleSort("status")} />
                <th className="border-b border-slate-200 px-4 py-3">카드</th>
                <SortableTh
                  active={sortKey === "planAmountWon"}
                  className="border-b border-slate-200 px-4 py-3"
                  direction={sortDirection}
                  label="월 이용료"
                  onClick={() => toggleSort("planAmountWon")}
                />
                <SortableTh
                  active={sortKey === "nextBillingDate"}
                  className="border-b border-slate-200 px-4 py-3"
                  direction={sortDirection}
                  label="다음 청구일"
                  onClick={() => toggleSort("nextBillingDate")}
                />
                <SortableTh
                  active={sortKey === "lastPaymentStatus"}
                  className="border-b border-slate-200 px-4 py-3"
                  direction={sortDirection}
                  label="최근 결제"
                  onClick={() => toggleSort("lastPaymentStatus")}
                />
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => (
                <tr key={row.id} className="font-bold text-slate-800 odd:bg-white even:bg-slate-50/60">
                  <td className="border-b border-slate-100 px-4 py-3 text-slate-950">{row.companyName}</td>
                  <td className="border-b border-slate-100 px-4 py-3">
                    <Badge className={statusTone[row.status]}>{statusLabels[row.status]}</Badge>
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">{row.cardNumberMasked || "미등록"}</td>
                  <td className="border-b border-slate-100 px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <input
                        className="w-28 rounded-md border border-slate-200 px-2 py-1 text-right text-sm font-bold text-slate-900 focus:border-teal-400 focus:outline-none"
                        inputMode="numeric"
                        onChange={(event) => setDrafts((current) => ({ ...current, [row.companyId]: event.target.value }))}
                        placeholder={String(row.planAmountWon)}
                        type="number"
                        value={drafts[row.companyId] ?? row.planAmountWon}
                      />
                      <span className="text-xs text-slate-400">원</span>
                      <button
                        aria-label={`${row.companyName} 월 이용료 저장`}
                        className="maju-button-secondary !h-11 !w-11 !px-0"
                        disabled={savingCompanyId === row.companyId}
                        onClick={() => savePlanAmount(row.companyId)}
                        type="button"
                      >
                        {savingCompanyId === row.companyId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      </button>
                    </div>
                    {savedCompanyId === row.companyId ? <p aria-live="polite" className="mt-1 text-xs font-bold text-emerald-700">저장 완료</p> : drafts[row.companyId] !== undefined ? <p className="mt-1 text-xs font-bold text-amber-700">저장하지 않은 변경</p> : null}
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3 text-slate-700">{row.nextBillingDate || "-"}</td>
                  <td className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">
                    {row.lastPaymentStatus ? `${row.lastPaymentStatus === "succeeded" ? "성공" : "실패"} · ${row.lastPaymentAt ? new Date(row.lastPaymentAt).toLocaleDateString("ko-KR") : ""}` : "-"}
                  </td>
                </tr>
              ))}
              {!sortedRows.length ? (
                <tr>
                  <td className="px-4 py-12 text-center text-sm font-bold text-slate-500" colSpan={6}>
                    {rows.length ? "검색 조건에 맞는 고객사가 없습니다. 검색어 또는 결제 상태를 변경해보세요." : "아직 결제 관리 대상 고객사가 없습니다. 고객사가 결제 관리 화면을 한 번 열면 여기에 표시됩니다."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function BillingMetric({ active, label, onClick, tone = "default", value }: { active: boolean; label: string; onClick: () => void; tone?: "danger" | "default" | "success" | "warning"; value: number }) {
  const toneClass = tone === "success" ? "border-emerald-200 bg-emerald-50" : tone === "warning" ? "border-amber-200 bg-amber-50" : tone === "danger" ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white";
  return <button aria-pressed={active} className={`rounded-lg border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${toneClass} ${active ? "ring-2 ring-teal-600 ring-offset-2" : ""}`} onClick={onClick} type="button"><p className="text-xs font-bold text-slate-500">{label} · 눌러서 보기</p><p className="mt-1 text-2xl font-black text-slate-950">{value.toLocaleString()}<span className="ml-1 text-sm text-slate-500">곳</span></p></button>;
}

function BillingMobileCard({ drafts, onSave, row, saved, saving, setDrafts }: { drafts: Record<string, string>; onSave: (companyId: string) => void; row: AdminSubscriptionRow; saved: boolean; saving: boolean; setDrafts: Dispatch<SetStateAction<Record<string, string>>> }) {
  return <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-black text-slate-950">{row.companyName}</p><p className="mt-1 text-xs font-semibold text-slate-500">{row.cardNumberMasked || "등록된 카드 없음"}</p></div><Badge className={statusTone[row.status]}>{statusLabels[row.status]}</Badge></div>
    <div className="mt-4 grid grid-cols-2 gap-2 text-sm"><div className="rounded-md bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">다음 청구일</p><p className="mt-1 font-black">{row.nextBillingDate || "미정"}</p></div><div className="rounded-md bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">최근 결제</p><p className="mt-1 font-black">{row.lastPaymentStatus === "succeeded" ? "성공" : row.lastPaymentStatus ? "실패" : "내역 없음"}</p></div></div>
    <label className="mt-4 block text-xs font-bold text-slate-500">월 이용료</label><div className="mt-1 flex gap-2"><input className="h-11 min-w-0 flex-1 rounded-md border border-slate-200 px-3 text-right font-bold outline-none focus:border-teal-500" inputMode="numeric" min={0} onChange={(event) => setDrafts((current) => ({ ...current, [row.companyId]: event.target.value }))} type="number" value={drafts[row.companyId] ?? row.planAmountWon} /><button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-black text-white disabled:opacity-60" disabled={saving} onClick={() => onSave(row.companyId)} type="button">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}저장</button></div>
    {saved ? <p aria-live="polite" className="mt-2 text-xs font-bold text-emerald-700">월 이용료 저장 완료</p> : drafts[row.companyId] !== undefined ? <p className="mt-2 text-xs font-bold text-amber-700">저장하지 않은 변경이 있습니다.</p> : null}
  </article>;
}

function parseStatusFilter(value: string | null): StatusFilter {
  return value && value in statusLabels ? value as AdminSubscriptionRow["status"] : "all";
}

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePageSize(value: string | null): PageSize {
  const parsed = Number(value);
  return PAGE_SIZE_OPTIONS.includes(parsed as PageSize) ? parsed as PageSize : 30;
}

function setOrDelete(params: URLSearchParams, key: string, value: string) {
  if (value) params.set(key, value);
  else params.delete(key);
}

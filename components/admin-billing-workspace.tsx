"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
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

export function AdminBillingWorkspace({ initialSubscriptions }: { readonly initialSubscriptions: AdminSubscriptionRow[] }) {
  const [rows, setRows] = useState(initialSubscriptions);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingCompanyId, setSavingCompanyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const { sortDirection, sortKey, sortedRows, toggleSort } = useTableSort<AdminSubscriptionRow, SortKey>(rows, {
    companyName: (a, b) => a.companyName.localeCompare(b.companyName, "ko"),
    lastPaymentStatus: (a, b) => (a.lastPaymentStatus || "").localeCompare(b.lastPaymentStatus || ""),
    nextBillingDate: (a, b) => (a.nextBillingDate || "").localeCompare(b.nextBillingDate || ""),
    planAmountWon: (a, b) => a.planAmountWon - b.planAmountWon,
    status: (a, b) => a.status.localeCompare(b.status)
  });

  async function savePlanAmount(companyId: string) {
    const draftValue = drafts[companyId];
    const planAmountWon = Number(draftValue);
    if (draftValue === undefined || Number.isNaN(planAmountWon) || planAmountWon < 0) {
      setError("월 이용료는 0 이상의 숫자로 입력해주세요.");
      return;
    }
    setError("");
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
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "저장하지 못했습니다.");
    } finally {
      setSavingCompanyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <div className="maju-filter-box border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">{error}</div> : null}

      <section className="maju-section-card">
        <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="maju-section-title">고객사별 구독 현황</p>
            <p className="mt-1 maju-muted-label">월 이용료 설정 · 자동결제 상태</p>
          </div>
          <Badge className="bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">{rows.length.toLocaleString()}개 고객사</Badge>
        </div>
        <div className="overflow-x-auto">
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
              {sortedRows.map((row) => (
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
                        className="maju-button-secondary !h-7 !px-2"
                        disabled={savingCompanyId === row.companyId}
                        onClick={() => savePlanAmount(row.companyId)}
                        type="button"
                      >
                        {savingCompanyId === row.companyId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      </button>
                    </div>
                  </td>
                  <td className="border-b border-slate-100 px-4 py-3 text-slate-700">{row.nextBillingDate || "-"}</td>
                  <td className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">
                    {row.lastPaymentStatus ? `${row.lastPaymentStatus === "succeeded" ? "성공" : "실패"} · ${row.lastPaymentAt ? new Date(row.lastPaymentAt).toLocaleDateString("ko-KR") : ""}` : "-"}
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td className="px-4 py-12 text-center text-sm font-bold text-slate-500" colSpan={6}>
                    아직 결제 관리 대상 고객사가 없습니다. 고객사가 결제 관리 화면을 한 번 열면 여기에 표시됩니다.
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

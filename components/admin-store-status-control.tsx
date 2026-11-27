"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";

type CompanyOption = { id: string; name: string };

export function AdminStoreStatusControl({ companies, enabled, initialStatus, storeProfileId }: {
  companies: CompanyOption[];
  enabled: boolean;
  initialStatus: string;
  storeProfileId: string;
}) {
  const [companyId, setCompanyId] = useState(companies[0]?.id || "");
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const canChange = enabled && companies.length > 0 && (status === "active" || status === "suspended");
  const nextStatus = status === "suspended" ? "active" : "suspended";
  const actionLabel = status === "suspended" ? "풀기" : "멈추기";

  async function changeStatus() {
    if (!canChange || !window.confirm(`이 매장을 ${actionLabel} 처리할까요?`)) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/stores/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId, storeProfileId, status: nextStatus, requestKey: crypto.randomUUID() }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string; status?: string };
      if (!response.ok || payload.status !== nextStatus) throw new Error(payload.message || "상태를 바꾸지 못했습니다.");
      setStatus(nextStatus);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "상태를 바꾸지 못했습니다.");
    } finally {
      setPending(false);
    }
  }

  return <div className="flex min-w-0 flex-wrap items-center gap-2">
    <Badge>{statusLabel(status)}</Badge>
    {canChange ? <>
      {companies.length > 1 ? <select aria-label="상태 변경 회사" className="h-11 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs font-bold" onChange={(event) => setCompanyId(event.target.value)} value={companyId}>
        {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
      </select> : null}
      <button className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-xs font-black text-slate-800 disabled:opacity-50" disabled={pending} onClick={changeStatus} type="button">
        {pending ? "처리 중" : actionLabel}
      </button>
    </> : null}
    {error ? <p className="w-full text-xs font-bold text-destructive" role="alert">{error} 현재 상태는 바뀌지 않았습니다.</p> : null}
  </div>;
}

const statusLabel = (value: string) => ({ active: "활성", suspended: "멈춤", closed: "종료" }[value] || value);

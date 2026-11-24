"use client";

import { useCallback, useEffect, useState } from "react";
import { CompanyLinksTable, type CompanyLinkOverview } from "@/components/company-public-links";

type Row = Partial<CompanyLinkOverview> & { companyId: string; companyName: string };

// CX-140 ④: 마주 관리자가 링크 기능이 켜진 모든 고객사의 공개 링크를 보고 만든다.
export function AdminCompanyLinks() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/company-links?all=1"); const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "고객사 링크를 불러오지 못했습니다.");
      setRows(data.companies as Row[]); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "고객사 링크를 불러오지 못했습니다."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (error) return <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</p>;
  if (!rows) return <p className="text-sm font-semibold text-slate-500">불러오는 중…</p>;
  if (!rows.length) return <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm font-semibold text-slate-600">링크 정리 기능이 켜진 고객사가 없습니다.</p>;
  return <div className="space-y-4">{rows.map(row => <section className="rounded-xl border border-slate-200 bg-white p-4" key={row.companyId}>
    <h2 className="mb-2 break-words text-base font-black text-slate-950">{row.companyName}</h2>
    {row.links && row.documents ? <CompanyLinksTable companyId={row.companyId} compact overview={{ defaultDocumentId: row.defaultDocumentId ?? null, defaultPinned: Boolean(row.defaultPinned), documents: row.documents, links: row.links }} onChanged={() => void load()} />
      : <p className="text-sm font-semibold text-rose-700">이 고객사의 링크를 불러오지 못했습니다.</p>}
  </section>)}</div>;
}

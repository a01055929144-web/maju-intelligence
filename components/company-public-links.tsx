"use client";

import { useCallback, useEffect, useState } from "react";

// CX-140: 고객사 공개 링크 표(고객사 화면·마주 관리자 화면 공용). 문서당 1개, 조회수·마지막 열람·만료일 표시.
export type CompanyLink = { id: string; documentId: string; title: string; publicUrl: string; expiresAt: string; viewCount: number;
  firstViewedAt: string | null; lastViewedAt: string | null; isDefault: boolean; duplicateCount: number };
export type CompanyLinkOverview = { defaultDocumentId: string | null; defaultPinned: boolean; documents: Array<{ id: string; title: string }>; links: CompanyLink[] };

const day = (value: string | null) => value ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "아직 없음";
const absolute = (url: string) => (typeof window === "undefined" || /^https?:/.test(url) ? url : `${window.location.origin}${url}`);

async function call(companyId: string | undefined, body: Record<string, unknown>) {
  const response = await fetch("/api/company-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, ...(companyId ? { companyId } : {}) }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "처리하지 못했습니다.");
  return data;
}

export function CompanyLinksTable({ companyId, overview, onChanged, compact = false }: { companyId?: string; overview: CompanyLinkOverview; onChanged: () => void; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pick, setPick] = useState(overview.defaultDocumentId ?? "");
  const run = async (body: Record<string, unknown>, ok: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setMessage("");
    try { await call(companyId, body); setMessage(ok); onChanged(); } catch (error) { setMessage(error instanceof Error ? error.message : "처리하지 못했습니다."); } finally { setBusy(false); }
  };
  const defaultHasLink = overview.links.some(l => l.isDefault);
  return <div className="space-y-3">
    <div className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-xs font-bold text-slate-600">기본 단가표
        <select className="h-11 min-w-48 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900" value={pick} onChange={e => setPick(e.target.value)} disabled={busy || !overview.documents.length}>
          {!overview.documents.length ? <option value="">게시한 단가표가 없습니다</option> : null}
          {overview.documents.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
        </select></label>
      <button className="min-h-11 rounded-lg bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-50" disabled={busy || !pick} onClick={() => run({ action: "set-default", documentId: pick }, "기본 단가표를 지정했습니다.")} type="button">기본 단가표 지정</button>
      {!defaultHasLink ? <button className="min-h-11 rounded-lg border border-teal-700 px-4 text-sm font-black text-teal-800 disabled:opacity-50" disabled={busy || !overview.documents.length} onClick={() => run({ action: "ensure" }, "기본 단가표 링크를 만들었습니다.")} type="button">링크 만들기</button> : null}
    </div>
    {!overview.defaultPinned && overview.documents.length ? <p className="text-xs font-semibold text-slate-500">지정하지 않아 가장 최근 게시한 단가표를 기본으로 씁니다.</p> : null}
    {message ? <p role="status" className="text-sm font-bold text-slate-800">{message}</p> : null}
    {overview.links.length ? <div className={compact ? "overflow-x-auto" : "overflow-x-auto rounded-xl border border-slate-200 bg-white"}>
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-slate-50 text-xs font-bold text-slate-500"><tr><th className="px-3 py-2">단가표</th><th className="px-3 py-2">링크</th><th className="px-3 py-2 text-right">조회수</th><th className="px-3 py-2">마지막 열람</th><th className="px-3 py-2">만료일</th><th className="px-3 py-2" /></tr></thead>
        <tbody>{overview.links.map(l => <tr key={l.id} className="border-t border-slate-100 align-top">
          <td className="px-3 py-2 font-bold text-slate-900">{l.title}{l.isDefault ? <span className="ml-2 rounded bg-teal-100 px-1.5 py-0.5 text-xs text-teal-900">기본</span> : null}
            {l.duplicateCount > 1 ? <p className="text-xs font-semibold text-amber-700">같은 단가표에 링크가 {l.duplicateCount}개 있습니다. 새로 만들 때는 1개만 허용됩니다.</p> : null}</td>
          <td className="max-w-64 px-3 py-2"><a className="break-all text-xs font-semibold text-blue-700 underline" href={l.publicUrl} rel="noreferrer" target="_blank">{absolute(l.publicUrl)}</a>
            <button className="ml-2 text-xs font-bold text-slate-600 underline" onClick={() => navigator.clipboard?.writeText(absolute(l.publicUrl)).then(() => setMessage("링크를 복사했습니다."), () => setMessage("복사하지 못했습니다."))} type="button">복사</button></td>
          <td className="px-3 py-2 text-right tabular-nums">{l.viewCount.toLocaleString("ko-KR")}</td>
          <td className="px-3 py-2 text-xs">{day(l.lastViewedAt)}</td><td className="px-3 py-2 text-xs">{day(l.expiresAt)}</td>
          <td className="px-3 py-2">{l.duplicateCount > 1 ? <button className="text-xs font-bold text-rose-700 underline disabled:opacity-50" disabled={busy} onClick={() => run({ action: "revoke", linkId: l.id }, "링크를 끊었습니다.", "이 링크를 끊으면 이미 퍼진 이 주소는 열리지 않습니다. 계속할까요?")} type="button">끊기</button> : null}</td>
        </tr>)}</tbody>
      </table></div> : <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm font-semibold text-slate-600">아직 공개 링크가 없습니다. 기본 단가표를 지정하고 [링크 만들기]를 누르세요.</p>}
  </div>;
}

/** 고객사 화면: 열 때 기본 단가표 링크가 없으면 한 번 자동으로 만든다(이미 있으면 그대로 1개). */
export function CompanyPublicLinks({ companyId }: { companyId?: string }) {
  const [overview, setOverview] = useState<CompanyLinkOverview | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async (auto: boolean) => {
    try {
      const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
      const read = async () => { const r = await fetch(`/api/company-links${query}`); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.message || "링크를 불러오지 못했습니다."); return d as CompanyLinkOverview; };
      let data = await read();
      if (auto && data.defaultDocumentId && !data.links.some(l => l.isDefault)) { await call(companyId, { action: "ensure" }).catch(() => null); data = await read(); }
      setOverview(data); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "링크를 불러오지 못했습니다."); }
  }, [companyId]);
  useEffect(() => { void load(true); }, [load]);
  if (error) return <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</p>;
  if (!overview) return <p className="text-sm font-semibold text-slate-500">링크를 불러오는 중…</p>;
  return <section className="space-y-3" aria-label="고객사 단가표 링크">
    <h2 className="text-base font-black text-slate-950">단가표 링크</h2>
    <CompanyLinksTable companyId={companyId} overview={overview} onChanged={() => void load(false)} />
  </section>;
}

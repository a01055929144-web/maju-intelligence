"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LEAD_DM_TEMPLATES, renderLeadDm, type LeadDmTarget } from "@/domains/lead/dm-template";

// CC-31: 영업 문구 카드 — 매장용|유통사용 탭, 기본 템플릿 3개(샘플 리드로 미리보기) → [이 템플릿으로 시작] → 고쳐서 저장. 변수 칩은 커서 자리에 넣는다.
// companyId가 있으면 MAJU 관리자가 그 회사 대신 저장(서버가 감사 기록을 남김).
type Loaded = { canEdit: boolean; excluded: string; template: string; distributorTemplate: string; distributorEnabled: boolean; context: { companyName?: string; region?: string; mainItems?: string; newCount?: number } };
const CHIPS: Record<LeadDmTarget, string[]> = {
  restaurant: ["{상호}", "{회사명}", "{지역}", "{업종}", "{품목}", "{주력품목}"],
  distributor: ["{상호}", "{회사명}", "{지역}", "{주력품목}", "{신규수}"],
};
const SAMPLE = { businessName: "샘플상회", industry: "한식", items: ["채소", "두부"] };

export function LeadDmTemplateSettings({ companyId }: { companyId?: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [tab, setTab] = useState<LeadDmTarget>("restaurant");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const url = `/api/leads/dm-template${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ""}`;

  const load = useCallback(async () => {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) { setNotice({ ok: false, text: "영업 문구를 불러오지 못했습니다." }); return; }
    const body = await response.json() as Loaded;
    setData(body); setDraft(body.template);
  }, [url]);
  useEffect(() => { void load(); }, [load]);

  function pick(next: LeadDmTarget) {
    if (!data) return;
    setTab(next); setNotice(null);
    setDraft(next === "restaurant" ? data.template : data.distributorTemplate || LEAD_DM_TEMPLATES.distributor[0].body);
  }
  function insert(chip: string) {
    const el = area.current, at = el?.selectionStart ?? draft.length, end = el?.selectionEnd ?? at;
    setDraft(draft.slice(0, at) + chip + draft.slice(end));
  }
  async function save() {
    if (!data) return;
    setBusy(true); setNotice(null);
    try {
      const body = tab === "restaurant" ? { companyId, excluded: data.excluded, template: draft } : { companyId, excluded: data.excluded, template: data.template, distributorTemplate: draft };
      const response = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(result.message || "저장하지 못했습니다.");
      setData({ ...data, ...(tab === "restaurant" ? { template: draft } : { distributorTemplate: draft }) });
      setNotice({ ok: true, text: tab === "restaurant" ? "매장용 문구를 저장했습니다." : "유통사용 문구를 저장했습니다." });
    } catch (e) { setNotice({ ok: false, text: e instanceof Error ? e.message : "저장하지 못했습니다." }); }
    finally { setBusy(false); }
  }
  if (!data) return <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">{notice?.text || "영업 문구를 불러오는 중…"}</section>;
  const preview = (body: string) => renderLeadDm(body, { ...SAMPLE, ...data.context, target: tab });
  return <section aria-label="영업 문구" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
    <div><h2 className="text-base font-black">영업 문구</h2>
      <p className="text-xs text-slate-500">리드 상세의 문구 기본값입니다. 리드마다 이번에만 고쳐서 보낼 수 있습니다. 값이 없는 변수가 든 줄은 자동으로 빠집니다.</p></div>
    {data.distributorEnabled ? <div className="flex gap-1" role="tablist">
      {(["restaurant", "distributor"] as const).map((key) => <button aria-selected={tab === key} className={`min-h-11 rounded-full border px-4 text-sm font-bold ${tab === key ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 text-slate-600"}`} key={key} onClick={() => pick(key)} role="tab" type="button">{key === "restaurant" ? "매장용" : "유통사용"}</button>)}
    </div> : null}
    <ul className="grid gap-2 md:grid-cols-3">{LEAD_DM_TEMPLATES[tab].map((t) => <li className="flex flex-col rounded-lg border border-slate-200 p-2" key={t.id}>
      <b className="text-sm">{t.id} · {t.name}</b>
      <p className="mt-1 max-h-40 flex-1 overflow-y-auto whitespace-pre-wrap text-xs text-slate-600">{preview(t.body)}</p>
      <button className="mt-2 min-h-11 rounded-md border border-teal-700 text-xs font-bold text-teal-800 disabled:opacity-50" disabled={!data.canEdit} onClick={() => { setDraft(t.body); setNotice(null); }} type="button">이 템플릿으로 시작</button></li>)}</ul>
    <div className="flex flex-wrap gap-1">{CHIPS[tab].map((chip) => <button className="rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700" disabled={!data.canEdit} key={chip} onClick={() => insert(chip)} type="button">{chip}</button>)}</div>
    <textarea aria-label={tab === "restaurant" ? "매장용 문구" : "유통사용 문구"} className="min-h-40 w-full rounded-md border border-slate-300 p-2 text-sm leading-6" disabled={!data.canEdit} onChange={(e) => setDraft(e.target.value)} ref={area} value={draft} />
    <div><p className="text-xs font-bold text-slate-500">미리보기(샘플 리드)</p><p className="whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-sm">{preview(draft)}</p></div>
    {notice ? <p className={`rounded p-2 text-sm ${notice.ok ? "bg-teal-50 text-teal-800" : "bg-rose-50 text-rose-800"}`} role={notice.ok ? "status" : "alert"}>{notice.text}</p> : null}
    {data.canEdit ? <button className="min-h-11 rounded-md bg-teal-700 px-4 text-sm font-bold text-white disabled:opacity-50" disabled={busy || !draft.trim()} onClick={() => void save()} type="button">{busy ? "저장 중…" : "문구 저장"}</button> : <p className="text-xs text-slate-500">문구는 대표·관리자가 바꿉니다.</p>}
  </section>;
}

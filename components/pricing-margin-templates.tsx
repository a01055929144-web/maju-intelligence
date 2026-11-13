"use client";
import { InfoTooltip } from "@/components/info-tooltip";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PriceItem, PriceState } from "@/domains/pricing/price-rules";
import { averageDeltaPercent, templatePrice, type MarginTemplate } from "@/domains/pricing/margin-template";

// CC-19b: 카탈로그(가격 묶음) 선택·만들기·비교. 스위치(MARGIN_TEMPLATES)를 켠 회사에만 보인다.
type Template = { id: string; name: string; storeCount?: number; margin: number; rounding: number; categories: { category: string; margin: number }[] };
const field = "h-10 rounded-md border border-slate-300 bg-white px-2 text-sm";
const asTemplate = (t: Template): MarginTemplate => ({ margin: t.margin, rounding: t.rounding, categories: t.categories, items: [] });

export function PricingMarginTemplates({ companyId, state }: { companyId: string; state: PriceState }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<string>(""); // "" = 기본(회사 마진 규칙 그대로), "new" = 만드는 중
  const [draft, setDraft] = useState<Template | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [byStores, setByStores] = useState(false); // 정렬: 매장 많은 순
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const call = useCallback(async (payload?: Record<string, unknown>) => {
    const response = await fetch(payload ? "/api/margin-templates" : `/api/margin-templates?${new URLSearchParams({ companyId })}`, payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...payload }) } : { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || "처리하지 못했습니다.");
    return body as { id?: string; templates: Template[] };
  }, [companyId]);
  useEffect(() => { void call().then((b) => setTemplates(b.templates)).catch((e) => setError(e instanceof Error ? e.message : "불러오지 못했습니다.")); }, [call]);

  const current = templates.find((t) => t.id === selected) ?? null;
  useEffect(() => { setDraft(current ? { ...current, categories: current.categories.map((c) => ({ ...c })) } : null); }, [current]);

  // 새 카탈로그: 기본 복사(분류에 연결된 그룹 마진 그대로) 또는 빈 카탈로그(회사 기본 마진만 채움)
  const startNew = (copy: boolean) => {
    setSelected("new");
    setDraft({ id: "", name: "", margin: state.defaultMargin, rounding: state.defaultRounding, categories: copy ? state.categories.flatMap((link) => { const group = state.groups.find((g) => g.id === link.groupId); return group ? [{ category: link.category, margin: group.margin }] : []; }) : [] });
  };
  async function save() {
    if (!draft) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await call({ action: "save", ...(draft.id ? { id: draft.id } : {}), name: draft.name, margin: draft.margin, rounding: draft.rounding, categories: draft.categories });
      setTemplates(result.templates); setSelected(result.id || ""); setMessage("카탈로그를 저장했습니다.");
    } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function archive() {
    if (!current || !window.confirm(`"${current.name}" 카탈로그를 보관할까요? 이 카탈로그를 쓰는 매장가 있으면 보관되지 않습니다.`)) return;
    setBusy(true); setError(""); setMessage("");
    try { const result = await call({ action: "archive", id: current.id }); setTemplates(result.templates); setSelected(""); setMessage("카탈로그를 보관했습니다."); }
    catch (e) { setError(e instanceof Error ? e.message : "보관하지 못했습니다."); }
    finally { setBusy(false); }
  }

  const shown = useMemo(() => (byStores ? [...templates].sort((a, b) => (b.storeCount ?? 0) - (a.storeCount ?? 0)) : templates), [templates, byStores]);
  const avg = useMemo(() => new Map(templates.map((tp) => [tp.id, averageDeltaPercent(asTemplate(tp), state.items)])), [templates, state.items]);
  const avgLabel = (id: string) => { const v = avg.get(id); return v === null || v === undefined ? "-" : `${v > 0 ? "+" : ""}${v}%`; };
  const compare = useMemo(() => state.items.slice(0, 20).map((item: PriceItem) => ({ item, prices: templates.map((t) => templatePrice(asTemplate(t), { id: item.id, category: item.category, cost: item.cost }).price) })), [state.items, templates]);

  return <section aria-label="카탈로그" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
      <div aria-label="보기" className="inline-flex overflow-hidden rounded-md border border-slate-300" role="group">{(["cards", "table"] as const).map((v) => <button aria-pressed={view === v} className={`h-8 px-3 ${view === v ? "bg-slate-800 text-white" : "bg-white text-slate-600"}`} key={v} onClick={() => setView(v)} type="button">{v === "cards" ? "카드" : "표"}</button>)}</div>
      <button aria-pressed={byStores} className={`h-8 rounded-md border px-3 ${byStores ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-600"}`} onClick={() => setByStores(!byStores)} type="button">매장 많은 순</button>
    </div>
    {view === "table" ? <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full text-sm">
      <thead className="bg-slate-50 text-xs font-black text-slate-600"><tr><th className="px-3 py-2 text-left">카탈로그</th><th className="px-2 py-2 text-right">기본 마진</th><th className="px-2 py-2 text-right">품목</th><th className="px-2 py-2 text-right">매장</th><th className="px-2 py-2 text-right">기본 대비</th></tr></thead>
      <tbody>
        <tr className={`cursor-pointer border-t ${selected === "" ? "bg-teal-50" : ""}`} onClick={() => setSelected("")}><td className="px-3 py-2 font-bold">기본 카탈로그 <span className="ml-1 rounded bg-teal-700 px-1.5 py-0.5 text-[11px] text-white">기본</span></td><td className="px-2 text-right">{state.defaultMargin}%</td><td className="px-2 text-right">{state.items.length.toLocaleString("ko-KR")}</td><td className="px-2 text-right">-</td><td className="px-2 text-right">-</td></tr>
        {shown.map((tp) => <tr aria-selected={selected === tp.id} className={`cursor-pointer border-t ${selected === tp.id ? "bg-teal-50" : ""}`} key={tp.id} onClick={() => setSelected(tp.id)}><td className="px-3 py-2 font-bold">{tp.name}</td><td className="px-2 text-right">{tp.margin}%</td><td className="px-2 text-right">{state.items.length.toLocaleString("ko-KR")}</td><td className="px-2 text-right">{(tp.storeCount ?? 0).toLocaleString("ko-KR")}</td><td className="px-2 text-right tabular-nums">{avgLabel(tp.id)}</td></tr>)}
      </tbody></table></div> : null}
    <div className={`grid gap-2 sm:grid-cols-2 xl:grid-cols-4 ${view === "table" ? "hidden" : ""}`} role="group" aria-label="카탈로그 선택">
      <button aria-pressed={selected === ""} className={`rounded-xl border p-3 text-left ${selected === "" ? "border-teal-700 bg-teal-50 ring-1 ring-teal-700" : "border-slate-200 hover:bg-slate-50"}`} onClick={() => setSelected("")} type="button">
        <span className="flex items-center gap-2"><b className="text-sm">기본 카탈로그</b><span className="rounded bg-teal-700 px-1.5 py-0.5 text-[11px] font-bold text-white">기본</span></span>
        <span className="mt-1 block text-xs text-slate-500">품목 {state.items.length.toLocaleString("ko-KR")}개 · 지정하지 않은 매장이 씁니다</span>
      </button>
      {shown.map((t) => <button aria-pressed={selected === t.id} className={`rounded-xl border p-3 text-left ${selected === t.id ? "border-teal-700 bg-teal-50 ring-1 ring-teal-700" : "border-slate-200 hover:bg-slate-50"}`} key={t.id} onClick={() => setSelected(t.id)} type="button">
        <b className="block truncate text-sm">{t.name}</b>
        <span className="mt-1 flex flex-wrap gap-1 text-[11px] font-bold text-slate-700"><span className="rounded bg-slate-100 px-1.5 py-0.5">기본 {t.margin}%</span>{t.categories.slice(0, 3).map((c) => <span className="rounded bg-slate-100 px-1.5 py-0.5" key={c.category}>{c.category.split(">").pop()?.trim()} {c.margin}%</span>)}{t.categories.length > 3 ? <span className="px-1 py-0.5 text-slate-500">+{t.categories.length - 3}</span> : null}</span>
        <span className="mt-1 block text-xs text-slate-500">품목 {state.items.length.toLocaleString("ko-KR")}개 · 매장 {(t.storeCount ?? 0).toLocaleString("ko-KR")}곳 · 기본 대비 {avgLabel(t.id)}</span>
      </button>)}
      <button className="min-h-[44px] rounded-full border border-dashed border-teal-700 px-4 text-sm font-bold text-teal-800" onClick={() => startNew(true)} type="button">+ 새 카탈로그(기본 복사)</button>
      <button className="min-h-[44px] rounded-full border border-dashed border-slate-400 px-4 text-sm font-bold text-slate-700" onClick={() => startNew(false)} type="button">+ 빈 카탈로그</button>
    </div>
    {error ? <p role="alert" className="rounded border border-rose-300 bg-rose-50 p-2 text-sm text-rose-800">{error}</p> : null}
    {message ? <p role="status" className="rounded border border-teal-300 bg-teal-50 p-2 text-sm text-teal-900">{message}</p> : null}
    {selected === "" ? <p className="flex items-center gap-1 text-sm font-bold text-slate-700">기본 카탈로그 <InfoTooltip size="sm" text="기본은 지금 쓰는 회사 마진 규칙(아래 탭)입니다. 도매·VIP처럼 매장마다 다른 마진이 필요하면 새 카탈로그를 만드세요. 카탈로그에 없는 값은 그 카탈로그의 기본 마진으로 계산합니다." /></p> : null}
    {draft ? <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-sm font-bold">이름<input aria-label="카탈로그 이름" className={`${field} mt-1 w-full`} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required value={draft.name} /></label>
        <label className="text-sm font-bold">기본 마진(%)<input aria-label="카탈로그 기본 마진" className={`${field} mt-1 w-full text-right`} max="1000" min="0" onChange={(e) => setDraft({ ...draft, margin: Number(e.target.value) })} required step="0.01" type="number" value={draft.margin} /></label>
        <label className="text-sm font-bold">끝자리 올림<select className={`${field} mt-1 w-full`} onChange={(e) => setDraft({ ...draft, rounding: Number(e.target.value) })} value={draft.rounding}>{[1, 10, 100].map((v) => <option key={v} value={v}>{v}원</option>)}</select></label>
      </div>
      <div className="space-y-1" aria-label="분류별 마진">
        <p className="text-sm font-bold">분류별 마진 {draft.categories.length}개</p>
        {draft.categories.map((c, index) => <div className="flex items-center gap-2" key={c.category}>
          <span className="min-w-0 flex-1 break-words text-sm">{c.category}</span>
          <input aria-label={`${c.category} 마진`} className={`${field} w-24 text-right`} max="1000" min="0" onChange={(e) => setDraft({ ...draft, categories: draft.categories.map((x, i) => (i === index ? { ...x, margin: Number(e.target.value) } : x)) })} step="0.01" type="number" value={c.margin} />%
          <button aria-label={`${c.category} 빼기`} className="min-h-[44px] px-2 text-sm font-bold text-rose-700" onClick={() => setDraft({ ...draft, categories: draft.categories.filter((_, i) => i !== index) })} type="button">빼기</button>
        </div>)}
        <AddCategory known={Array.from(new Set(state.items.map((i) => i.category).filter(Boolean)))} taken={draft.categories.map((c) => c.category)} onAdd={(category) => setDraft({ ...draft, categories: [...draft.categories, { category, margin: draft.margin }] })} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="maju-button-primary min-h-[44px] px-4" disabled={busy || !draft.name.trim()} type="submit">카탈로그 저장</button>
        {current ? <button className="min-h-[44px] rounded-lg border px-4 text-rose-700" disabled={busy} onClick={() => void archive()} type="button">보관</button> : null}
      </div>
    </form> : null}
    {templates.length ? <div className="overflow-x-auto" aria-label="카탈로그 판매가 비교">
      <p className="mb-1 text-sm font-bold">카탈로그 비교(불러온 상품 앞 20개)</p>
      <table className="min-w-[480px] text-sm"><thead><tr><th className="border bg-slate-50 p-2 text-left">상품</th><th className="border bg-slate-50 p-2 text-right">기본</th>{templates.map((t) => <th className="border bg-slate-50 p-2 text-right" key={t.id}>{t.name}</th>)}</tr></thead>
        <tbody>{compare.map(({ item, prices }) => <tr key={item.id}><td className="border p-2">{item.name}</td><td className="border p-2 text-right">{item.price.toLocaleString()}원</td>{prices.map((price, i) => <td className="border p-2 text-right" key={templates[i].id}>{price.toLocaleString()}원</td>)}</tr>)}</tbody></table>
    </div> : null}
    {templates.length ? <CustomerAssign companyId={companyId} templates={templates} /> : null}
  </section>;
}

// CC-19c: 거래처에 카탈로그 지정(없으면 기본). 검색한 거래처 20곳까지.
function CustomerAssign({ companyId, templates }: { companyId: string; templates: Template[] }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Array<{ id: string; name: string; templateId: string | null }>>([]);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const search = useCallback(async (text: string) => {
    const response = await fetch(`/api/margin-templates/customers?${new URLSearchParams({ companyId, q: text })}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(body.message || "거래처를 불러오지 못했습니다."); return; }
    setRows(body.customers); setMessage("");
  }, [companyId]);
  async function assign(customerId: string, templateId: string) {
    setBusyId(customerId); setMessage("");
    try {
      const response = await fetch("/api/margin-templates/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, customerId, templateId: templateId || null }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "지정하지 못했습니다.");
      setRows((list) => list.map((r) => (r.id === customerId ? { ...r, templateId: templateId || null } : r)));
      setMessage("지정했습니다.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "지정하지 못했습니다."); }
    finally { setBusyId(""); }
  }
  return <div className="space-y-2 border-t pt-3" aria-label="거래처 카탈로그 지정">
    <p className="text-sm font-bold">거래처에 카탈로그 지정</p>
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void search(q); }}>
      <input aria-label="거래처 검색" className={`${field} min-w-0 flex-1`} onChange={(e) => setQ(e.target.value)} placeholder="거래처 이름" value={q} />
      <button className="min-h-[44px] rounded-lg border px-4 text-sm font-bold" type="submit">검색</button>
    </form>
    {message ? <p role="status" className="text-sm text-teal-900">{message}</p> : null}
    {rows.map((r) => <div className="flex items-center gap-2" key={r.id}>
      <span className="min-w-0 flex-1 break-words text-sm">{r.name}</span>
      <select aria-label={`${r.name} 카탈로그`} className={`${field} w-40`} disabled={busyId === r.id} onChange={(e) => void assign(r.id, e.target.value)} value={r.templateId ?? ""}>
        <option value="">기본</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </div>)}
  </div>;
}

function AddCategory({ known, taken, onAdd }: { known: string[]; taken: string[]; onAdd: (category: string) => void }) {
  const [value, setValue] = useState("");
  const options = known.filter((c) => !taken.includes(c)).sort((a, b) => a.localeCompare(b, "ko"));
  return <div className="flex items-center gap-2"><select aria-label="분류 추가" className={`${field} min-w-0 flex-1`} onChange={(e) => setValue(e.target.value)} value={value}><option value="">분류 추가…</option>{options.map((c) => <option key={c} value={c}>{c}</option>)}</select>
    <button className="min-h-[44px] rounded-lg border px-3 text-sm font-bold disabled:opacity-50" disabled={!value} onClick={() => { onAdd(value); setValue(""); }} type="button">추가</button></div>;
}

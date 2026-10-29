"use client";
import { useCallback, useEffect, useState } from "react";
import type { PriceState } from "@/domains/pricing/price-rules";
import type { PricingCommand } from "@/application/pricing/manage-price-sheets";
const fieldClass = "rounded border p-2";
export function PriceSheetsWorkspace({ companyId }: { companyId: string }) {
  const [state, setState] = useState<PriceState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [groupId, setGroupId] = useState("");
  const [name, setName] = useState("");
  const [margin, setMargin] = useState("12");
  const [rounding, setRounding] = useState("10");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const request = useCallback(async (command?: PricingCommand) => {
    setBusy(true); setError(""); setMessage("");
    try {
      const query = new URLSearchParams({ companyId, q: search, page: String(page) });
      const response = await fetch(`/api/price-sheets?${query}`, command ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) } : { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "불러오지 못했습니다.");
      setState(body);
      if (command) setMessage(command.action === "restore" ? "직전 계산을 복구했습니다." : "저장했습니다.");
    } catch (e) { setError(e instanceof Error ? e.message : "다시 시도해 주세요."); }
    finally { setBusy(false); }
  }, [companyId, search, page]);
  useEffect(() => { void request(); }, [request]);
  return <div className="space-y-4" aria-busy={busy}>
    <p className="text-sm text-slate-600">마진율(매입가 대비)을 적용해 매입가 × (1 + 마진율)로 계산한 후 올림합니다. 직접 단가 → 품목 마진 → 그룹 마진 → 기본 마진 순서입니다. 견적·계약 단가는 변경하지 않습니다.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {message && <p role="status">{message}</p>}
    <button disabled={busy} onClick={() => void request()} className={fieldClass}>새로고침</button>
    {!state && !error && <p role="status">불러오는 중…</p>}
    {state && <>
      <section className="maju-section-card space-y-3 p-4"><h2 className="font-semibold">마진 그룹</h2>
        {!state.groups.length ? <p>등록된 마진 그룹이 없습니다.</p> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{state.groups.map(g => <article key={g.id} className="space-y-2 rounded-lg border p-3">
          <h3 className="font-semibold">{g.name}</h3><p>마진율(매입가 대비) {g.margin}% · {g.rounding}원 올림</p>
          <p className="text-sm text-slate-600">연결된 분류: {state.categories.filter(c => c.groupId === g.id).map(c => c.category).join(", ") || "없음"}</p>
          <button disabled={busy} className={fieldClass} onClick={() => { setGroupId(g.id); setName(g.name); setMargin(String(g.margin)); setRounding(String(g.rounding)); }}>{g.name} 수정</button>
        </article>)}</div>}

        <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); void request({ action: "group", ...(groupId ? { id: groupId } : {}), name, margin: Number(margin), rounding: Number(rounding) }); }}>
          <label>그룹 선택<select className={`block ${fieldClass}`} value={groupId} onChange={e => { setGroupId(e.target.value); const g = state.groups.find(g => g.id === e.target.value); setName(g?.name || ""); setMargin(String(g?.margin ?? 12)); setRounding(String(g?.rounding ?? 10)); }}><option value="">새 그룹</option>{state.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
          <label>그룹명<input required maxLength={80} className={`block ${fieldClass}`} value={name} onChange={e => setName(e.target.value)} /></label>
          <label>마진율(매입가 대비) %<input required type="number" min="0" max="1000" step="0.01" className={`block w-28 ${fieldClass}`} value={margin} onChange={e => setMargin(e.target.value)} /></label>
          <label>올림 단위<select className={`block ${fieldClass}`} value={rounding} onChange={e => setRounding(e.target.value)}>{[1,10,100].map(n => <option key={n} value={n}>{n}원</option>)}</select></label>
          <button disabled={busy} className={fieldClass}>그룹 저장</button>
        </form>
        <h3 className="font-semibold">카테고리 연결</h3>
        <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void request({ action: "category", category: String(data.get("category")), groupId: String(data.get("groupId")) }); }}>
          <label>상품 원장 카테고리<input name="category" required maxLength={100} className={`block ${fieldClass}`} /></label>
          <label>적용 그룹<select name="groupId" required className={`block ${fieldClass}`}><option value="">선택</option>{state.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
          <button disabled={busy || !state.groups.length} className={fieldClass}>카테고리 연결 저장</button>
        </form>
        {state.categories.length === 0 ? <p>연결된 카테고리가 없습니다.</p> : <ul>{state.categories.map(c => <li key={c.category} className="flex flex-wrap items-center gap-3 py-1"><span>{c.category} → {state.groups.find(g => g.id === c.groupId)?.name}</span><button disabled={busy} className={fieldClass} onClick={() => void request({ action: "category", category: c.category, groupId: "" })}>{c.category} 연결 해제</button></li>)}</ul>}
      </section>
      <section className="maju-section-card space-y-3 p-4"><h2 className="font-semibold">회사 기본 마진</h2>
        <form key={`${state.defaultMargin}-${state.defaultRounding}`} className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void request({ action: "defaults", margin: Number(data.get("margin")), rounding: Number(data.get("rounding")) }); }}>
          <label>기본 마진율(매입가 대비) %<input required name="margin" type="number" min="0" max="1000" step="0.01" defaultValue={state.defaultMargin} className={`block w-28 ${fieldClass}`} /></label>
          <label>기본 올림 단위<select name="rounding" defaultValue={state.defaultRounding} className={`block ${fieldClass}`}>{[1,10,100].map(n => <option key={n} value={n}>{n}원</option>)}</select></label>
          <button disabled={busy} className={fieldClass}>기본 마진 저장</button>
        </form>
      </section>
      <section className="maju-section-card space-y-3 p-4"><h2 className="font-semibold">다시 계산 필요 {state.pendingCount}개</h2>
        <p className="text-sm text-slate-600">검색·현재 페이지와 관계없이 회사 전체의 변동분을 계산합니다. 직접 단가와 0원 매입·비활성 품목은 제외합니다.</p>
        <div className="flex flex-wrap gap-2"><button disabled={busy || !state.pendingCount} className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-50" onClick={() => void request({ action: "recalculate" })}>변동분 일괄 재계산</button>
        <button disabled={busy || !state.lastBatch || state.restored} className={`${fieldClass} disabled:opacity-50`} onClick={() => { if (state.lastBatch) void request({ action: "restore", batchId: state.lastBatch }); }}>직전 계산 복구</button></div>
        <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); setSearch(String(new FormData(e.currentTarget).get("q") || "").trim()); setPage(1); }}><label>품목·카테고리 검색<input name="q" maxLength={100} className={`ml-2 ${fieldClass}`} /></label><button disabled={busy} className={fieldClass}>검색</button></form>
        <p>검색 결과 {state.total}개 · {state.page} / {Math.max(1, Math.ceil(state.total / state.pageSize))}페이지</p>
        {!state.items.length ? <p>해당 상품이 없습니다.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["품목 / 카테고리", "매입가", "그룹 우선 지정", "품목 마진율(매입가 대비) %", "판매가", "직접 단가"].map(t => <th key={t} className="p-2">{t}</th>)}</tr></thead><tbody>{state.items.map(i => <tr key={i.id} className="border-t">
          <td className="p-2">{i.name}{!i.active && " (비활성)"}<span className="block text-slate-500">{i.category || "카테고리 없음"}</span></td><td className="p-2">{i.cost.toLocaleString()}원</td>
          <td className="p-2"><select aria-label={`${i.name} 그룹 우선 지정`} disabled={busy} value={i.groupId || ""} onChange={e => void request({ action: "assign", productId: i.id, groupId: e.target.value })}><option value="">카테고리 규칙 적용</option>{state.groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.margin}%)</option>)}</select></td>
          <td className="p-2"><form onSubmit={e => { e.preventDefault(); const value = new FormData(e.currentTarget).get("margin"); void request({ action: "item-margin", productId: i.id, margin: value === "" ? null : Number(value) }); }}><input key={String(i.itemMargin)} aria-label={`${i.name} 품목 마진`} name="margin" type="number" min="0" max="1000" step="0.01" defaultValue={i.itemMargin ?? ""} className="w-24 rounded border p-1" /><button disabled={busy} className="ml-1 rounded border p-1">저장</button></form></td>
          <td className="p-2">{i.price.toLocaleString()}원</td><td className="p-2"><form onSubmit={e => { e.preventDefault(); const value = new FormData(e.currentTarget).get("price"); void request({ action: "direct", productId: i.id, price: value === "" ? null : Number(value) }); }}><input key={String(i.directPrice)} aria-label={`${i.name} 직접 단가`} name="price" type="number" min="0" max="1000000000000" step="1" defaultValue={i.directPrice ?? ""} className="w-28 rounded border p-1" /><button disabled={busy} className="ml-1 rounded border p-1">저장</button></form></td>
        </tr>)}</tbody></table></div>}
        <p className="text-sm text-slate-600">품목 마진·직접 단가를 비우고 저장하면 다음 우선순위 규칙을 적용합니다. 직접 단가에는 올림을 적용하지 않습니다.</p>
        <div className="flex gap-3"><button disabled={busy || page<=1} onClick={() => setPage(p => p-1)} className={fieldClass}>이전</button><button disabled={busy || page*state.pageSize>=state.total} onClick={() => setPage(p => p+1)} className={fieldClass}>다음</button></div>
      </section>
    </>}
  </div>;
}

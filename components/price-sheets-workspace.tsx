"use client";
import { useCallback, useEffect, useState } from "react";
import type { PriceState } from "@/domains/pricing/price-rules";
import type { PricingCommand } from "@/application/pricing/manage-price-sheets";
type State = PriceState & { pendingCount: number };
export function PriceSheetsWorkspace({ companyId }: { companyId: string }) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [groupId, setGroupId] = useState("");
  const [name, setName] = useState("");
  const [margin, setMargin] = useState("12");
  const [rounding, setRounding] = useState("10");
  const request = useCallback(async (command?: PricingCommand) => {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/price-sheets?companyId=${encodeURIComponent(companyId)}`, command ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) } : { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "불러오지 못했습니다.");
      setState(body);
      if (command) setMessage(command.action === "restore" ? "직전 계산을 복구했습니다." : "저장했습니다.");
    } catch (e) { setError(e instanceof Error ? e.message : "다시 시도해 주세요."); }
    finally { setBusy(false); }
  }, [companyId]);
  useEffect(() => { void request(); }, [request]);
  return <div className="space-y-4" aria-busy={busy}>
    <p className="text-sm text-slate-600">상품 원장의 매입가로 계산합니다. 직접 단가를 우선 적용하며 견적·계약 단가는 변경하지 않습니다.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {message && <p role="status">{message}</p>}
    <button disabled={busy} onClick={() => void request()} className="rounded border px-3 py-2">새로고침</button>
    {!state && !error && <p role="status">불러오는 중…</p>}
    {state && <>
      <section className="maju-section-card space-y-3 p-4"><h2 className="font-semibold">마진 그룹</h2>
        <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); void request({ action: "group", ...(groupId ? { id: groupId } : {}), name, margin: Number(margin), rounding: Number(rounding) }); }}>
          <label>그룹 선택<select className="block rounded border p-2" value={groupId} onChange={e => { setGroupId(e.target.value); const g = state.groups.find(g => g.id === e.target.value); setName(g?.name || ""); setMargin(String(g?.margin ?? 12)); setRounding(String(g?.rounding ?? 10)); }}><option value="">새 그룹</option>{state.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
          <label>그룹명<input required maxLength={80} className="block rounded border p-2" value={name} onChange={e => setName(e.target.value)} /></label>
          <label>마진율 (%)<input required type="number" min="0" max="99.99" step="0.01" className="block w-28 rounded border p-2" value={margin} onChange={e => setMargin(e.target.value)} /></label>
          <label>올림 단위<select className="block rounded border p-2" value={rounding} onChange={e => setRounding(e.target.value)}>{[1,10,100].map(n => <option key={n} value={n}>{n}원</option>)}</select></label>
          <button disabled={busy} className="rounded border px-3 py-2">그룹 저장</button>
        </form>
      </section>
      <section className="maju-section-card space-y-3 p-4"><h2 className="font-semibold">다시 계산 필요 {state.pendingCount}개</h2>
        <div className="flex flex-wrap gap-2"><button disabled={busy || !state.pendingCount} className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-50" onClick={() => void request({ action: "recalculate" })}>변동분 일괄 재계산</button>
        <button disabled={busy || !state.lastBatch || state.restored} className="rounded border px-3 py-2 disabled:opacity-50" onClick={() => { if (state.lastBatch) void request({ action: "restore", batchId: state.lastBatch }); }}>직전 계산 복구</button></div>
        <p className="text-sm text-slate-600">0원 매입·비활성·그룹 미지정·직접 단가 품목은 일괄 계산에서 제외합니다. 직접 단가를 비우고 저장하면 마진을 적용합니다.</p>
        {!state.items.length ? <p>등록된 상품이 없습니다.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["품목", "매입가", "마진 그룹", "판매가", "직접 단가"].map(t => <th key={t} className="p-2">{t}</th>)}</tr></thead><tbody>{state.items.map(i => <tr key={i.id} className="border-t">
          <td className="p-2">{i.name}{!i.active && " (비활성)"}</td><td className="p-2">{i.cost.toLocaleString()}원</td>
          <td className="p-2"><select aria-label={`${i.name} 마진 그룹`} disabled={busy} value={i.groupId || ""} onChange={e => void request({ action: "assign", productId: i.id, groupId: e.target.value })}><option value="">미지정</option>{state.groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.margin}%)</option>)}</select></td>
          <td className="p-2">{i.price.toLocaleString()}원</td><td className="p-2"><form onSubmit={e => { e.preventDefault(); const value = new FormData(e.currentTarget).get("price"); void request({ action: "direct", productId: i.id, price: value === "" ? null : Number(value) }); }}><input key={String(i.directPrice)} aria-label={`${i.name} 직접 단가`} name="price" type="number" min="0" max="1000000000000" step="1" defaultValue={i.directPrice ?? ""} className="w-28 rounded border p-1" /><button disabled={busy} className="ml-2 rounded border p-1">저장</button></form></td>
        </tr>)}</tbody></table></div>}
      </section>
    </>}
  </div>;
}

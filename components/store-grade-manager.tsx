"use client";
import { useCallback, useState } from "react";

// CC-30b: 카탈로그 관리 — 카탈로그 목록·새로 만들기·보관. 이름·분류 마진 수정은 카탈로그 화면에서(여기서 저장하면 분류 마진이 지워지므로 새로 만들기만 둔다).
type Template = { id: string; name: string; margin: number };

export function StoreGradeManager({ companyId, onChanged }: { companyId: string; onChanged: () => void }) {
  const [items, setItems] = useState<Template[] | null>(null);
  const [name, setName] = useState("");
  const [margin, setMargin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/margin-templates?${new URLSearchParams({ companyId })}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as { templates?: Template[]; message?: string };
      if (!response.ok) throw new Error(body.message || "카탈로그를 불러오지 못했습니다.");
      setItems(body.templates ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "카탈로그를 불러오지 못했습니다."); }
  }, [companyId]);

  async function post(payload: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/margin-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...payload }) });
      const body = await response.json().catch(() => ({})) as { templates?: Template[]; message?: string };
      if (!response.ok) throw new Error(body.message || "저장하지 못했습니다.");
      setItems(body.templates ?? []); setName(""); setMargin(""); onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  return <details className="rounded-md border border-slate-200 p-2 text-sm" onToggle={(e) => { if (e.currentTarget.open && items === null) void load(); }}>
    <summary className="cursor-pointer text-xs font-bold text-slate-600">카탈로그 관리</summary>
    <div className="mt-2 space-y-2">
      {error ? <p className="rounded border border-rose-300 bg-rose-50 p-2 text-xs text-rose-800" role="alert">{error}</p> : null}
      <ul className="divide-y">
        {(items ?? []).map((t) => <li className="flex items-center justify-between gap-2 py-1" key={t.id}>
          <span className="min-w-0 truncate">{t.name} <span className="text-xs text-slate-500">마진 {t.margin}%</span></span>
          <button className="text-xs font-bold text-rose-700 disabled:opacity-50" disabled={busy} onClick={() => { if (window.confirm(`'${t.name}' 카탈로그를 보관할까요? 쓰는 매장이 있으면 보관되지 않습니다.`)) void post({ action: "archive", id: t.id }); }} type="button">보관</button></li>)}
        {items && !items.length ? <li className="py-1 text-xs text-slate-500">카탈로그가 없습니다. 아래에서 만드세요.</li> : null}
      </ul>
      <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); void post({ action: "save", name, margin: Number(margin), rounding: 10, categories: [] }); }}>
        <input aria-label="새 카탈로그 이름" className="h-8 min-w-0 flex-1 rounded border border-slate-300 px-1.5 text-sm" maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="카탈로그 이름" value={name} />
        <input aria-label="새 카탈로그 마진(%)" className="h-8 w-16 rounded border border-slate-300 px-1.5 text-right text-sm" inputMode="decimal" onChange={(e) => setMargin(e.target.value)} placeholder="마진%" value={margin} />
        <button className="h-8 rounded bg-teal-700 px-2 text-xs font-bold text-white disabled:opacity-50" disabled={busy || !name.trim() || margin.trim() === "" || !Number.isFinite(Number(margin))} type="submit">추가</button>
      </form>
    </div>
  </details>;
}

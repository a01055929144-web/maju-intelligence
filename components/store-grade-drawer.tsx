"use client";
import { useState } from "react";
import { gradeChipClass, STORE_GRADE_COLORS, type StoreGradeColor } from "@/domains/pricing/store-grade";

// CC-32c: 매장 등급 관리 서랍 — 회사가 직접 만드는 등급(VIP·일반·신규 …)의 이름·색·순서·보관. 스위치 STORE_GRADES를 켠 회사에만 보인다.
export type StoreGrade = { id: string; name: string; color: StoreGradeColor; sortOrder: number; storeCount: number };
const colorLabel: Record<StoreGradeColor, string> = { slate: "회색", teal: "청록", blue: "파랑", amber: "노랑", rose: "분홍", violet: "보라", emerald: "초록" };

export function StoreGradeDrawer({ companyId, grades, onChanged }: { companyId: string; grades: StoreGrade[]; onChanged: (next: { grades: StoreGrade[]; assignments: Record<string, string> }) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<StoreGradeColor>("slate");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function post(payload: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/store-grades", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...payload }) });
      const body = await response.json().catch(() => ({})) as { message?: string; grades?: StoreGrade[]; assignments?: Record<string, string> };
      if (!response.ok) throw new Error(body.message || "처리하지 못했습니다.");
      onChanged({ grades: body.grades ?? [], assignments: body.assignments ?? {} });
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "처리하지 못했습니다."); return false; }
    finally { setBusy(false); }
  }

  return <>
    <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700" onClick={() => setOpen(true)} type="button">매장 등급 관리</button>
    {open ? <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={() => setOpen(false)}>
      <section aria-label="매장 등급 관리" aria-modal="true" className="h-full w-full max-w-md space-y-3 overflow-y-auto bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="flex items-center justify-between"><h2 className="text-lg font-black">매장 등급</h2><button className="min-h-[44px] rounded-lg border px-4" onClick={() => setOpen(false)} type="button">닫기</button></div>
        <p className="text-xs text-slate-500">VIP·일반·신규처럼 회사가 직접 만드는 매장 분류입니다. 카탈로그(가격 묶음)와 따로 관리하며, 쓰는 매장이 없을 때만 보관할 수 있습니다.</p>
        {error ? <p className="rounded border border-rose-300 bg-rose-50 p-2 text-sm text-rose-800" role="alert">{error}</p> : null}
        <ul className="space-y-1.5">{grades.map((g) => <li className="flex items-center gap-2 rounded-lg border border-slate-200 p-2" key={g.id}>
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${gradeChipClass[g.color]}`}>{g.name}</span>
          <span className="text-xs text-slate-500">매장 {g.storeCount.toLocaleString("ko-KR")}곳</span>
          <select aria-label={`${g.name} 색`} className="ml-auto h-8 rounded border border-slate-300 px-1 text-xs" disabled={busy} onChange={(e) => void post({ action: "save", id: g.id, name: g.name, color: e.target.value, sortOrder: g.sortOrder })} value={g.color}>{STORE_GRADE_COLORS.map((c) => <option key={c} value={c}>{colorLabel[c]}</option>)}</select>
          <button aria-label={`${g.name} 보관`} className="h-8 rounded border border-slate-300 px-2 text-xs font-bold text-rose-700 disabled:opacity-50" disabled={busy || g.storeCount > 0} onClick={() => void post({ action: "archive", id: g.id })} title={g.storeCount > 0 ? "쓰는 매장이 있어 보관할 수 없습니다" : "보관"} type="button">보관</button>
        </li>)}{!grades.length ? <li className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">아직 매장 등급이 없습니다.</li> : null}</ul>
        <form className="flex flex-wrap items-end gap-2 border-t pt-3" onSubmit={(e) => { e.preventDefault(); void post({ action: "save", name, color, sortOrder: grades.length }).then((ok) => { if (ok) setName(""); }); }}>
          <label className="min-w-0 flex-1 text-sm font-bold">새 등급 이름<input className="mt-1 block h-10 w-full rounded-md border border-slate-300 px-2 text-sm" maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="예: VIP" value={name} /></label>
          <select aria-label="새 등급 색" className="h-10 rounded-md border border-slate-300 px-2 text-sm" onChange={(e) => setColor(e.target.value as StoreGradeColor)} value={color}>{STORE_GRADE_COLORS.map((c) => <option key={c} value={c}>{colorLabel[c]}</option>)}</select>
          <button className="maju-button-primary h-10 px-4 text-sm" disabled={busy || !name.trim()} type="submit">추가</button>
        </form>
      </section>
    </div> : null}
  </>;
}

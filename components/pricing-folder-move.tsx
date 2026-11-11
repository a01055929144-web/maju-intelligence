"use client";
import { useState } from "react";

// CC-17: 선택한 폴더의 이름 바꾸기·이동. 합치기 확인 문구와 "이동 직후 판매가 재계산"은 필수(지시).
export function PricingFolderMove({ companyId, folder, busy, onMoved, onError }: { companyId: string; folder: string; busy: boolean; onMoved: (to: string, count: number) => void; onError: (message: string) => void }) {
  const [to, setTo] = useState(folder);
  const [working, setWorking] = useState(false);
  async function move() {
    const target = to.trim();
    if (!target || target === folder) return;
    if (!window.confirm(`"${folder}" 폴더를 "${target}"(으)로 옮길까요?\n하위 폴더와 상품 분류가 함께 바뀌고, 같은 경로가 이미 있으면 대상 폴더의 마진 연결을 유지합니다.\n옮긴 뒤 판매가를 바로 다시 계산합니다.`)) return;
    setWorking(true); onError("");
    try {
      const response = await fetch("/api/price-sheets/move-category", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, from: folder, to: target }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "폴더를 옮기지 못했습니다.");
      onMoved(String(body.to || target), Number(body.productCount || 0));
    } catch (e) { onError(e instanceof Error ? e.message : "폴더를 옮기지 못했습니다."); }
    finally { setWorking(false); }
  }
  return <form aria-label="폴더 이름 바꾸기·이동" className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2" onSubmit={(e) => { e.preventDefault(); void move(); }} key={folder}>
    <label className="min-w-[240px] flex-1 text-sm font-bold">폴더 이름·경로 (예: 식품 &gt; 채소)
      <input className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm font-normal" maxLength={100} onChange={(e) => setTo(e.target.value)} value={to} />
    </label>
    <button className="min-h-[44px] rounded-lg border border-teal-700 px-4 text-sm font-bold text-teal-800 disabled:opacity-50" disabled={busy || working || !to.trim() || to.trim() === folder} type="submit">폴더 이동</button>
  </form>;
}

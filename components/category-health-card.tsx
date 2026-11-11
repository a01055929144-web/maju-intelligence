"use client";
import { useCallback, useEffect, useState } from "react";
import { categoryHealth, type CategoryHealth } from "@/domains/pricing/product-category";
import { fetchAllPriceItems } from "@/lib/pricing/fetch-all-price-items";

// CC-27: "비슷한 분류 점검" — 예전 경로·체계에 없는 대분류·같은 소분류 이름·하위가 비어 있는 상품을 보여 주고,
// 합칠 수 있는 것은 폴더 이동(합치기, CC-17 API)으로 바로 처리한다. 합친 뒤 판매가를 다시 계산한다.
export function CategoryHealthCard({ companyId }: { companyId: string }) {
  const [health, setHealth] = useState<CategoryHealth | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const query = companyId ? `?${new URLSearchParams({ companyId })}` : "";

  const load = useCallback(async () => {
    setError("");
    try {
      const items = await fetchAllPriceItems(companyId);
      const counts = new Map<string, number>();
      for (const item of items) if (item.active && item.category.trim()) counts.set(item.category, (counts.get(item.category) || 0) + 1);
      setHealth(categoryHealth(counts));
    } catch (e) { setError(e instanceof Error ? e.message : "분류를 불러오지 못했습니다."); }
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);

  async function merge(from: string, to: string) {
    if (!window.confirm(`"${from}" 폴더를 "${to}"(으)로 합칠까요?\n상품 분류와 마진 연결이 함께 바뀌고, 같은 경로가 이미 있으면 대상 폴더의 마진 연결을 유지합니다.\n합친 뒤 판매가를 바로 다시 계산합니다.`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/price-sheets/move-category", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, from, to }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "합치지 못했습니다.");
      const recalc = await fetch(`/api/price-sheets${query}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "recalculate" }) });
      if (!recalc.ok) throw new Error("합쳤지만 판매가 재계산에 실패했습니다. 마진 설정에서 다시 계산해 주세요.");
      setMessage(`"${from}" → "${to}" 합쳤습니다(상품 ${Number(body.productCount || 0)}개). 판매가를 다시 계산했습니다.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "합치지 못했습니다."); }
    finally { setBusy(false); }
  }

  const empty = health && !health.legacy.length && !health.unknownTop.length && !health.sameLeaf.length && !health.missingSub.length;
  const merge44 = "min-h-[44px] rounded-lg border border-teal-700 px-3 text-sm font-bold text-teal-800 disabled:opacity-50";
  return <section aria-label="비슷한 분류 점검" className="maju-section-card space-y-3 p-4" id="category-health">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-lg font-black">비슷한 분류 점검</h2>
        <p className="text-sm text-slate-600">표준 분류와 다른 폴더를 찾아 합칠 수 있게 보여 줍니다. 합쳐도 발행된 문서는 그대로입니다.</p>
      </div>
      <button className="min-h-[44px] rounded-lg border px-4 text-sm font-bold" disabled={busy} onClick={() => void load()} type="button">다시 점검</button>
    </div>
    {error ? <p className="rounded border border-rose-300 bg-rose-50 p-2 text-sm text-rose-800" role="alert">{error}</p> : null}
    {message ? <p className="rounded border border-teal-300 bg-teal-50 p-2 text-sm text-teal-900" role="status">{message}</p> : null}
    {!health && !error ? <p className="text-sm text-slate-600" role="status">분류를 점검하는 중입니다.</p> : null}
    {empty ? <p className="text-sm font-bold text-teal-800">점검할 항목이 없습니다. 분류가 표준 체계와 같습니다.</p> : null}
    {health?.legacy.length ? <div className="space-y-1">
      <h3 className="text-sm font-black">예전 경로 → 표준 경로로 합치기</h3>
      {health.legacy.map((item) => <div className="flex flex-wrap items-center gap-2 rounded border border-slate-200 p-2" key={item.from}>
        <span className="min-w-0 flex-1 break-words text-sm">{item.from} <span aria-hidden="true">→</span> <strong>{item.to}</strong> · {item.count}개</span>
        <button className={merge44} disabled={busy} onClick={() => void merge(item.from, item.to)} type="button">합치기</button>
      </div>)}
    </div> : null}
    {health?.unknownTop.length ? <div className="space-y-1">
      <h3 className="text-sm font-black">체계에 없는 대분류</h3>
      <ul className="text-sm">{health.unknownTop.map((item) => <li key={item.top}>{item.top} · {item.count}개 — 상품 옮기기나 폴더 이동으로 표준 분류에 넣어 주세요.</li>)}</ul>
    </div> : null}
    {health?.sameLeaf.length ? <div className="space-y-1">
      <h3 className="text-sm font-black">같은 이름의 소분류가 여러 곳에 있음</h3>
      <ul className="text-sm">{health.sameLeaf.map((group) => <li key={group.leaf}>{group.leaf}: {group.paths.map((item) => `${item.path}(${item.count})`).join(" · ")}</li>)}</ul>
    </div> : null}
    {health?.missingSub.length ? <div className="space-y-1">
      <h3 className="text-sm font-black">소분류가 비어 있는 상품</h3>
      <ul className="text-sm">{health.missingSub.map((item) => <li key={item.path}>{item.path} · {item.count}개 — 상품을 골라 소분류로 옮겨 주세요.</li>)}</ul>
    </div> : null}
  </section>;
}

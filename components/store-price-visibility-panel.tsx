"use client";

import { useEffect, useState } from "react";
import type { StorePriceVisibilityItem } from "@/lib/store/07-store-price-visibility";

export function StorePriceVisibilityPanel({ canManage, initialStores }: {
  canManage: boolean; initialStores?: StorePriceVisibilityItem[];
}) {
  const [stores, setStores] = useState<StorePriceVisibilityItem[]>(initialStores || []);
  const [loading, setLoading] = useState(!initialStores);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [memo, setMemo] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true); setError("");
    const response = await fetch("/api/customer/store-price-visibility", { cache: "no-store" }).catch(() => null);
    const payload = response ? await response.json().catch(() => null) : null;
    if (!response?.ok) setError(payload?.message || "새 매장 확인 목록을 불러오지 못했습니다.");
    else setStores(payload.stores || []);
    setLoading(false);
  };
  useEffect(() => { if (!initialStores && canManage) void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (item: StorePriceVisibilityItem, action: "cancel" | "confirm") => {
    setBusy(item.id); setError("");
    const response = await fetch("/api/customer/store-price-visibility", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, memo: memo[item.id] || "", storeAccountId: item.id }) }).catch(() => null);
    const payload = response ? await response.json().catch(() => null) : null;
    if (!response?.ok) setError(payload?.message || "가격 공개 상태를 저장하지 못했습니다.");
    else await load();
    setBusy("");
  };

  const pending = stores.filter(item => item.status === "pending" && item.businessStatus !== "registration_pending").length;
  return <section aria-labelledby="store-price-title" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h2 className="text-lg font-black text-slate-950" id="store-price-title">새 매장 외식업 확인</h2>
        <p className="mt-1 text-sm text-slate-600">고객사가 직접 확인한 매장에만 가격을 공개합니다. 참고 표시는 자동 승인 조건이 아닙니다.</p></div>
      <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-900">확인 전 {pending}곳</span>
    </div>
    {!canManage ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-900" role="status">점주 또는 관리자만 외식업 확인과 취소를 할 수 있습니다.</p> : null}
    {loading ? <p className="mt-4 text-sm text-slate-600" role="status">새 매장을 불러오는 중입니다.</p> : null}
    {error ? <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm font-bold text-rose-800" role="alert">{error}</p> : null}
    {!loading && canManage && !error && stores.length === 0 ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">확인할 매장이 없습니다.</p> : null}
    <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-2">{stores.map(item => {
      const preopening = item.businessStatus === "registration_pending";
      return <article className="min-w-0 rounded-xl border border-slate-200 p-4" key={item.id}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="break-words font-black text-slate-950">{item.name}</h3>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.status === "confirmed" ? "bg-teal-100 text-teal-900" : "bg-slate-100 text-slate-700"}`}>{item.status === "confirmed" ? "가격 공개" : "확인 전"}</span></div>
        <ul className="mt-3 grid gap-1 text-sm text-slate-600">
          <li>고객사 링크 가입: {item.reference.joinedFromCompanyLink ? "참고 확인" : "자료 없음"}</li>
          <li>국세청 계속사업자: {item.reference.ntsActiveBusiness ? "참고 확인" : "자료 없음"}</li>
          <li>영업신고 일치: {item.reference.foodPermitMatch === true ? "참고 확인" : item.reference.foodPermitMatch === false ? "불일치 참고" : "자료 없음"}</li>
        </ul>
        {preopening ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-900">개업 준비 매장입니다. 고객사 대표번호로 먼저 확인해 주세요.</p> : <>
          <label className="mt-3 block text-sm font-bold text-slate-700" htmlFor={`memo-${item.id}`}>확인 메모</label>
          <textarea className="mt-1 min-h-20 w-full rounded-lg border border-slate-300 p-2 text-base" id={`memo-${item.id}`} maxLength={500}
            onChange={event => setMemo(current => ({ ...current, [item.id]: event.target.value }))} value={memo[item.id] || ""} />
          <button className={`mt-2 min-h-11 w-full rounded-lg px-4 font-bold text-white disabled:opacity-50 ${item.status === "confirmed" ? "bg-slate-700" : "bg-teal-700"}`}
            disabled={!canManage || busy === item.id} onClick={() => void save(item, item.status === "confirmed" ? "cancel" : "confirm")} type="button">
            {item.status === "confirmed" ? "가격 공개 취소" : "외식업 확인 · 가격 공개"}
          </button>
        </>}
      </article>;
    })}</div>
  </section>;
}

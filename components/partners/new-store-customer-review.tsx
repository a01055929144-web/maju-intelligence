"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { PendingStoreCustomerReview } from "@/lib/business-partner-new-stores";
import type { ReviewCandidate } from "@/lib/pricing/store-customer-review";

function businessNumber(value: string | null) {
  const digits = value?.replace(/\D/g, "") || "";
  return digits.length === 10 ? digits.replace(/(\d{3})(\d{2})(\d{5})/, "$1-$2-$3") : value;
}

export function NewStoreCustomerReview({ companyId = "" }: { companyId?: string }) {
  const [items, setItems] = useState<PendingStoreCustomerReview[]>([]);
  const [selected, setSelected] = useState<PendingStoreCustomerReview | null>(null);
  const [candidates, setCandidates] = useState<ReviewCandidate[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const api = useCallback(async (body?: Record<string, unknown>) => {
    const response = await fetchWithTimeout(
      body ? "/api/business-partners/new-stores" : `/api/business-partners/new-stores?companyId=${encodeURIComponent(companyId)}`,
      body
        ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: companyId || undefined, ...body }) }
        : { cache: "no-store" },
      12000,
    );
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "요청을 처리하지 못했습니다.");
    return payload;
  }, [companyId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems((await api()).items || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "새 매장을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const review = async (item: PendingStoreCustomerReview) => {
    setError("");
    try {
      setSelected(item);
      setCandidates((await api({ action: "candidates", storeAccountId: item.storeAccountId })).candidates || []);
    } catch (caught) {
      setSelected(null);
      setError(caught instanceof Error ? caught.message : "매출처 후보를 불러오지 못했습니다.");
    }
  };

  const decide = async (action: "confirm_customer" | "link_customer", customerId?: string) => {
    if (!selected) return;
    setError("");
    try {
      await api({ action, customerId, storeAccountId: selected.storeAccountId });
      setSelected(null);
      setCandidates([]);
      setMessage(action === "confirm_customer" ? "새 매출처로 확인했습니다." : "기존 매출처에 연결했습니다.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "새 매장을 처리하지 못했습니다.");
    }
  };

  return <section className="maju-section-card space-y-4 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-black">새 매장 확인</h2><p className="text-sm text-slate-600">매장 정보와 기존 매출처 후보를 확인한 뒤 새로 확인하거나 연결합니다.</p></div>
      <button className="maju-button-secondary min-h-11" onClick={() => void load()} type="button">새로고침</button>
    </div>
    <p className="text-xs text-slate-500">출입 비밀번호는 이 확인 목록에 포함되지 않습니다.</p>
    {message ? <p role="status">{message}</p> : null}
    {loading ? <LoadingState bare label="새 매장을 불러오는 중입니다..." /> : null}
    {!loading && error ? <ErrorState bare message={error} onRetry={() => void load()} /> : null}
    {!loading && !error && !items.length ? <EmptyState bare message="확인할 새 매장이 없습니다." /> : null}
    {!loading && !error && items.length ? <ul className="space-y-2">{items.map((item) => <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3" key={item.storeAccountId}>
      <span><b>{item.name}</b><br/><span className="text-sm text-slate-600">{item.address || "주소 없음"}</span>{item.businessNumber ? <><br/><span className="text-xs text-slate-500">사업자번호 {businessNumber(item.businessNumber)}</span></> : null}</span>
      <button className="maju-button-secondary min-h-11" onClick={() => void review(item)} type="button">매출처 확인</button>
    </li>)}</ul> : null}
    {selected ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <h3 className="font-black">{selected.name} 후보</h3>
      {!candidates.length ? <p className="mt-2 text-sm text-slate-600">일치하는 기존 매출처 후보가 없습니다.</p> : null}
      {candidates.map((candidate) => <div className="mt-2 flex flex-wrap items-center justify-between gap-2" key={candidate.customerId}><span>{candidate.name} · {candidate.address || "주소 없음"}<br/><small className="text-slate-600">후보 사유: {candidate.reason}</small></span><button className="maju-button-secondary min-h-11" onClick={() => void decide("link_customer", candidate.customerId)} type="button">이 매출처에 연결</button></div>)}
      <button className="maju-button-primary mt-3 min-h-11" onClick={() => void decide("confirm_customer")} type="button">새 매출처로 확인</button>
    </div> : null}
  </section>;
}

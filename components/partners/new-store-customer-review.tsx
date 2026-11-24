"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import type { PendingStoreCustomerReview } from "@/lib/business-partner-new-stores";
import type { ReviewCandidate } from "@/lib/pricing/store-customer-review";

type IncompleteSignup = { id: string; name: string; phone: string | null; startedAt: string; sourceLabel: string };

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
  const [tab, setTab] = useState<"registered" | "incomplete">("registered");
  const [incompleteAvailable, setIncompleteAvailable] = useState(false);
  const [incompleteSignups, setIncompleteSignups] = useState<IncompleteSignup[]>([]);

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
      const result = await api();
      setItems(result.items || []);
      setIncompleteAvailable(result.signupIncompleteAvailable === true);
      setIncompleteSignups(result.incompleteSignups || []);
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
    {incompleteAvailable ? <div className="flex gap-2" role="tablist" aria-label="새 매장 확인 단계">
      <button aria-selected={tab === "registered"} className="min-h-11 rounded-full border px-4 text-sm font-bold" onClick={() => setTab("registered")} role="tab" type="button">매장 등록 완료 {items.length}</button>
      <button aria-selected={tab === "incomplete"} className="min-h-11 rounded-full border px-4 text-sm font-bold" onClick={() => setTab("incomplete")} role="tab" type="button">가입 미완료 {incompleteSignups.length}</button>
    </div> : null}
    {message ? <p role="status">{message}</p> : null}
    {loading ? <LoadingState bare label="새 매장을 불러오는 중입니다..." /> : null}
    {!loading && error ? <ErrorState bare message={error} onRetry={() => void load()} /> : null}
    {!loading && !error && tab === "registered" && !items.length ? <EmptyState bare message="확인할 새 매장이 없습니다." /> : null}
    {!loading && !error && tab === "registered" && items.length ? <ul className="space-y-2">{items.map((item) => <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3" key={item.storeAccountId}>
      <span><b>{item.name}</b><br/><span className="text-sm text-slate-600">{item.address || "주소 없음"}</span>{item.businessNumber ? <><br/><span className="text-xs text-slate-500">사업자번호 {businessNumber(item.businessNumber)}</span></> : null}</span>
      <button className="maju-button-secondary min-h-11" onClick={() => void review(item)} type="button">매출처 확인</button>
    </li>)}</ul> : null}
    {!loading && !error && tab === "incomplete" && !incompleteSignups.length ? <EmptyState bare message="가입을 시작하고 매장 등록을 기다리는 점주가 없습니다." /> : null}
    {!loading && !error && tab === "incomplete" && incompleteSignups.length ? <ul className="space-y-2">{incompleteSignups.map(item => <li className="rounded-xl border p-3" key={item.id}>
      <div className="flex flex-wrap items-start justify-between gap-3"><span><b>{item.name || "이름 확인 전"}</b><br/><span className="text-sm text-slate-600">{new Date(item.startedAt).toLocaleString("ko-KR")} · {item.sourceLabel}</span></span>
        {item.phone ? <a className="inline-flex min-h-11 items-center rounded border px-3 font-bold" href={`tel:${item.phone.replace(/[^0-9+]/g, "")}`}>전화</a> : <span className="text-sm text-slate-500">동의 연락처 없음</span>}</div>
      <ol className="mt-3 grid gap-1 text-xs text-slate-600 sm:grid-cols-5"><li className="font-bold text-teal-700">열람 완료</li><li className="font-bold text-teal-700">가입 시작</li><li>매장 등록 대기</li><li>외식업 확인 대기</li><li>첫 주문 대기</li></ol>
    </li>)}</ul> : null}
    {selected ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <h3 className="font-black">{selected.name} 후보</h3>
      {!candidates.length ? <p className="mt-2 text-sm text-slate-600">일치하는 기존 매출처 후보가 없습니다.</p> : null}
      {candidates.map((candidate) => <div className="mt-2 flex flex-wrap items-center justify-between gap-2" key={candidate.customerId}><span>{candidate.name} · {candidate.address || "주소 없음"}<br/><small className="text-slate-600">후보 사유: {candidate.reason}</small></span><button className="maju-button-secondary min-h-11" onClick={() => void decide("link_customer", candidate.customerId)} type="button">이 매출처에 연결</button></div>)}
      <button className="maju-button-primary mt-3 min-h-11" onClick={() => void decide("confirm_customer")} type="button">새 매출처로 확인</button>
    </div> : null}
  </section>;
}

"use client";
import { useCallback, useEffect, useState } from "react";
import type { PendingStoreCustomerReview } from "@/lib/business-partner-new-stores";
import type { ReviewCandidate } from "@/lib/pricing/store-customer-review";

export function NewStoreCustomerReview({ companyId = "" }: { companyId?: string }) {
  const [items, setItems] = useState<PendingStoreCustomerReview[]>([]), [selected, setSelected] = useState<PendingStoreCustomerReview | null>(null);
  const [candidates, setCandidates] = useState<ReviewCandidate[]>([]), [message, setMessage] = useState("");
  const api = useCallback(async (body?: Record<string, unknown>) => {
    const response = await fetch(body ? "/api/business-partners/new-stores" : `/api/business-partners/new-stores?companyId=${encodeURIComponent(companyId)}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: companyId || undefined, ...body }) } : { cache: "no-store" });
    const payload = await response.json(); if (!response.ok) throw new Error(payload.message); return payload;
  }, [companyId]);
  const load = useCallback(async () => { try { setItems((await api()).items || []); } catch (e) { setMessage(e instanceof Error ? e.message : "새 매장을 불러오지 못했습니다."); } }, [api]);
  useEffect(() => { void load(); }, [load]);
  const review = async (item: PendingStoreCustomerReview) => { setSelected(item); setCandidates((await api({ action: "candidates", storeAccountId: item.storeAccountId })).candidates || []); };
  const decide = async (action: "confirm_customer" | "link_customer", customerId?: string) => { if (!selected) return; await api({ action, customerId, storeAccountId: selected.storeAccountId }); setSelected(null); setCandidates([]); setMessage(action === "confirm_customer" ? "새 매출처로 확인했습니다." : "기존 매출처에 연결했습니다."); await load(); };
  return <section className="maju-section-card space-y-4 p-5"><h2 className="text-lg font-black">새 매장 확인</h2><p className="text-sm text-slate-600">매장 정보와 기존 매출처 후보를 확인한 뒤 새로 확인하거나 연결합니다.</p>{message ? <p role="status">{message}</p> : null}
    <ul className="space-y-2">{items.map(item => <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3" key={item.storeAccountId}><span><b>{item.name}</b><br/><span className="text-sm text-slate-600">{item.address || "주소 없음"}</span></span><button className="maju-button-secondary min-h-11" onClick={() => void review(item)} type="button">매출처 확인</button></li>)}</ul>
    {!items.length ? <p className="text-sm text-slate-600">확인할 새 매장이 없습니다.</p> : null}
    {selected ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4"><h3 className="font-black">{selected.name} 후보</h3>{candidates.map(candidate => <div className="mt-2 flex flex-wrap items-center justify-between gap-2" key={candidate.customerId}><span>{candidate.name} · {candidate.address || "주소 없음"}</span><button className="maju-button-secondary min-h-11" onClick={() => void decide("link_customer", candidate.customerId)} type="button">이 매출처에 연결</button></div>)}<button className="maju-button-primary mt-3 min-h-11" onClick={() => void decide("confirm_customer")} type="button">새 매출처로 확인</button></div> : null}
  </section>;
}

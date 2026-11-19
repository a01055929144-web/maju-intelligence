"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type Item = {
  storeAccountId: string;
  customerId: string;
  storeName: string;
  customerName: string;
  businessRegistrationNumber: string | null;
  businessStatus: string;
  address: string | null;
  createdAt: string;
};
type Candidate = { customerId: string; name: string; address: string | null; reason: "business_number" | "name_address" };

function formatBusinessNumber(value: string | null) {
  const digits = (value || "").replace(/\D/g, "");
  return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}` : "개업 준비 중";
}

async function post(body: Record<string, string>) {
  const response = await fetchWithTimeout("/api/customer/store-reviews", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }, 12000);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "처리하지 못했습니다.");
  return payload;
}

export function StoreCustomerReviewWorkspace() {
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoaded(false); setError("");
    fetchWithTimeout("/api/customer/store-reviews", { cache: "no-store" }, 12000)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || "새 매장을 불러오지 못했습니다.");
        if (!active) return;
        const next = Array.isArray(payload.items) ? payload.items : [];
        setItems(next); setSelectedId((current) => next.some((item: Item) => item.storeAccountId === current) ? current : next[0]?.storeAccountId || "");
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "새 매장을 불러오지 못했습니다."))
      .finally(() => active && setLoaded(true));
    return () => { active = false; };
  }, [reload]);

  const selected = items.find((item) => item.storeAccountId === selectedId) || null;
  const businessCounts = useMemo(() => items.reduce<Record<string, number>>((counts, item) => {
    const key = item.businessRegistrationNumber || item.storeAccountId;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {}), [items]);

  async function confirmNew() {
    if (!selected) return;
    setBusy(true); setMessage("");
    try {
      await post({ action: "confirm_new", storeAccountId: selected.storeAccountId });
      setMessage("새 매출처로 확인했습니다."); setCandidates(null); setReload((value) => value + 1);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "처리하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function loadCandidates() {
    if (!selected) return;
    setBusy(true); setMessage(""); setTargetId("");
    try {
      const payload = await post({ action: "candidates", storeAccountId: selected.storeAccountId });
      const next = Array.isArray(payload.candidates) ? payload.candidates : [];
      setCandidates(next); setTargetId(next[0]?.customerId || "");
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "후보를 불러오지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function linkExisting() {
    if (!selected || !targetId) return;
    setBusy(true); setMessage("");
    try {
      await post({ action: "link_existing", storeAccountId: selected.storeAccountId, customerId: targetId });
      setMessage("기존 매출처에 연결했습니다."); setCandidates(null); setReload((value) => value + 1);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "연결하지 못했습니다."); }
    finally { setBusy(false); }
  }

  if (!loaded) return <LoadingState label="새 매장을 확인하는 중입니다" />;
  if (error) return <ErrorState message={error} onRetry={() => setReload((value) => value + 1)} />;
  if (!items.length) return <EmptyState message="확인이 필요한 새 매장이 없습니다" description="새 매장이 연결되면 이곳에서 새 매출처로 만들거나 기존 매출처에 연결할 수 있습니다." />;

  return <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
    <section className="maju-section-card min-w-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 p-4">
        <div><h2 className="font-black text-slate-950">새로 가입한 매장 {items.length}곳</h2><p className="mt-1 text-xs font-bold text-slate-500">같은 사업자번호는 같은 법인으로 표시합니다.</p></div>
        <button aria-label="새로고침" className="maju-button-secondary h-9 px-3" onClick={() => setReload((value) => value + 1)} type="button"><RefreshCw className="h-4 w-4" /></button>
      </div>
      <div className="divide-y divide-slate-100">
        {items.map((item) => {
          const selectedRow = item.storeAccountId === selectedId;
          const groupCount = businessCounts[item.businessRegistrationNumber || item.storeAccountId];
          return <button className={`block w-full p-4 text-left transition ${selectedRow ? "bg-teal-50" : "hover:bg-slate-50"}`} key={item.storeAccountId}
            onClick={() => { setSelectedId(item.storeAccountId); setCandidates(null); setMessage(""); }} type="button">
            <span className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-slate-950">{item.storeName}</strong><span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-black text-amber-800">확인 필요</span></span>
            <span className="mt-1 block text-xs font-bold text-slate-600">{formatBusinessNumber(item.businessRegistrationNumber)}{groupCount > 1 ? ` · 같은 법인 ${groupCount}개 매장` : ""}</span>
            <span className="mt-1 block truncate text-xs text-slate-500">{item.address || "주소 미등록"}</span>
          </button>;
        })}
      </div>
    </section>

    {selected ? <section className="maju-section-card min-w-0 p-4">
      <h2 className="text-base font-black text-slate-950">{selected.storeName}</h2>
      <dl className="mt-4 space-y-3 text-sm">
        <div><dt className="text-xs font-bold text-slate-500">사업자번호</dt><dd className="mt-1 font-bold text-slate-900">{formatBusinessNumber(selected.businessRegistrationNumber)}</dd></div>
        <div><dt className="text-xs font-bold text-slate-500">매장이 입력한 주소</dt><dd className="mt-1 break-words font-bold text-slate-900">{selected.address || "주소 미등록"}</dd></div>
        <div><dt className="text-xs font-bold text-slate-500">자동 생성된 매출처</dt><dd className="mt-1 font-bold text-slate-900">{selected.customerName}</dd></div>
      </dl>
      <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-600">출입 비밀번호는 이 목록과 매출처 연결 정보에 포함되지 않습니다. 매장 정보가 나중에 바뀌면 별도 알림에서 선택해 반영합니다.</p>
      <div className="mt-4 grid gap-2">
        <button className="maju-button-primary h-11" disabled={busy} onClick={confirmNew} type="button">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} 새 매출처로 만들기</button>
        <button className="maju-button-secondary h-11" disabled={busy} onClick={loadCandidates} type="button">기존 매출처에 연결</button>
      </div>
      {candidates ? <div className="mt-4 rounded-lg border border-slate-200 p-3">
        <h3 className="text-sm font-black text-slate-900">연결 후보</h3>
        {candidates.length ? <><select aria-label="연결할 기존 매출처" className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" onChange={(event) => setTargetId(event.target.value)} value={targetId}>
          {candidates.map((candidate) => <option key={candidate.customerId} value={candidate.customerId}>{candidate.name} · {candidate.reason === "business_number" ? "사업자번호 일치" : "이름·주소 일치"}</option>)}
        </select><button className="maju-button-primary mt-2 h-10 w-full" disabled={busy || !targetId} onClick={linkExisting} type="button">선택한 매출처에 연결</button></>
          : <p className="mt-2 text-sm font-bold text-slate-500">안전하게 연결할 기존 매출처 후보가 없습니다.</p>}
      </div> : null}
      {message ? <p aria-live="polite" className="mt-3 text-sm font-bold text-slate-700">{message}</p> : null}
    </section> : null}
  </div>;
}

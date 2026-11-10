"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type Result = { address: string | null; baseAddress: string | null; addressDetail: string | null; message?: string };

export function StoreAddressManagementPanel({ companyId, storeAccountId }: { companyId: string; storeAccountId: string }) {
  const [current, setCurrent] = useState<Result | null>(null);
  const [query, setQuery] = useState(""); const [results, setResults] = useState<string[]>([]);
  const [baseAddress, setBaseAddress] = useState(""); const [addressDetail, setAddressDetail] = useState("");
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const scope = new URLSearchParams({ companyId, storeAccountId }).toString();
  useEffect(() => { void fetch(`/api/store/address?${scope}`, { cache: "no-store" }).then(async response => {
    const body = await response.json() as Result; if (!response.ok) throw new Error(body.message);
    setCurrent(body); setBaseAddress(body.baseAddress || ""); setAddressDetail(body.addressDetail || "");
  }).catch(cause => setMessage(cause instanceof Error ? cause.message : "주소를 불러오지 못했습니다.")); }, [scope]);
  async function search(event: FormEvent) { event.preventDefault(); setBusy(true); setMessage("");
    try { const response = await fetch(`/api/store/address?${scope}&query=${encodeURIComponent(query)}`);
      const body = await response.json() as { message?: string; results?: Array<{ address: string }> };
      if (!response.ok) throw new Error(body.message); setResults((body.results || []).map(item => item.address));
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "주소를 검색하지 못했습니다."); } finally { setBusy(false); } }
  async function save() { setBusy(true); setMessage(""); try {
    const response = await fetch(`/api/store/address?${scope}`, { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseAddress, addressDetail }) }); const body = await response.json() as { message?: string };
    if (!response.ok) throw new Error(body.message); setCurrent({ address: `${baseAddress} ${addressDetail}`, baseAddress, addressDetail });
    setResults([]); setMessage("배송지 주소를 저장했습니다. 배송권역이 달라지면 주문 전 담당자 확인이 필요합니다.");
  } catch (cause) { setMessage(cause instanceof Error ? cause.message : "주소를 저장하지 못했습니다."); } finally { setBusy(false); } }
  return <Card><CardHeader><CardTitle>배송지 주소</CardTitle><p className="text-sm text-slate-600">카카오 주소 검색에서 기본 주소를 고르고 상세 주소를 입력해 주세요.</p></CardHeader>
    <CardContent className="space-y-4"><p className="break-words text-sm">현재 주소: {current?.address || "등록되지 않음"}</p>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={search}><input aria-label="주소 검색어" className="min-h-[44px] min-w-0 flex-1 rounded border px-3" value={query} onChange={e => setQuery(e.target.value)} placeholder="도로명 또는 지번" />
        <Button disabled={busy || query.trim().length < 2}>주소 검색</Button></form>
      {results.length > 0 && <ul className="space-y-2">{results.map(address => <li key={address}><button type="button" className="min-h-[44px] w-full rounded border p-3 text-left" onClick={() => { setBaseAddress(address); setResults([]); }}>{address}</button></li>)}</ul>}
      <div><label className="text-sm font-medium" htmlFor="store-base-address">기본 주소</label><input id="store-base-address" readOnly className="mt-1 min-h-[44px] w-full rounded border bg-slate-50 px-3" value={baseAddress} /></div>
      <div><label className="text-sm font-medium" htmlFor="store-address-detail">상세 주소</label><input id="store-address-detail" maxLength={100} className="mt-1 min-h-[44px] w-full rounded border px-3" value={addressDetail} onChange={e => setAddressDetail(e.target.value)} /></div>
      <Button className="w-full sm:w-auto" disabled={busy || !baseAddress || !addressDetail.trim()} onClick={() => void save()}>주소 저장</Button>
      {message && <p role="status" className="text-sm text-slate-700">{message}</p>}</CardContent></Card>;
}

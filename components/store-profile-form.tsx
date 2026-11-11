"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";

type AddressResult = { address: string; buildingName: string };

/** 직접 가입: 카카오로 로그인한 점주가 매장 정보를 입력한다. 유통사 연결은 이 화면에서 하지 않는다. */
export function StoreProfileForm() {
  const router = useRouter();
  const [storeName, setStoreName] = useState("");
  const [openingSoon, setOpeningSoon] = useState(false);
  const [businessNumber, setBusinessNumber] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddressResult[]>([]);
  const [baseAddress, setBaseAddress] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function searchAddress() {
    setMessage("");
    if (query.trim().length < 2) return setMessage("주소 검색어를 2글자 이상 입력해 주세요.");
    try {
      const response = await fetch(`/api/address-search?query=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { results?: AddressResult[]; message?: string };
      if (!response.ok) return setMessage(body.message || "주소를 검색하지 못했습니다.");
      setResults(body.results ?? []);
      if (!body.results?.length) setMessage("검색 결과가 없습니다. 도로명이나 건물명으로 다시 검색해 보세요.");
    } catch { setMessage("주소를 검색하지 못했습니다. 잠시 후 다시 시도해 주세요."); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/store/profile", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeName, openingSoon, businessNumber, baseAddress, addressDetail, termsAccepted }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (response.ok || response.status === 409) return router.refresh();
      setMessage(body.message || "가입을 완료하지 못했습니다.");
    } catch { setMessage("가입을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  const field = "min-h-[44px] w-full rounded-lg border border-slate-300 px-3 text-sm";
  return <form aria-label="매장 정보 입력" className="space-y-4" onSubmit={submit}>
    <label className="block text-sm font-semibold">매장 이름
      <input autoComplete="organization" className={`${field} mt-1 font-normal`} maxLength={100} onChange={(e) => setStoreName(e.target.value)} required value={storeName} />
    </label>
    <div className="space-y-2">
      <label className="block text-sm font-semibold">사업자등록번호
        <input autoComplete="off" className={`${field} mt-1 font-normal disabled:bg-slate-100`} disabled={openingSoon} inputMode="numeric" maxLength={12} onChange={(e) => setBusinessNumber(e.target.value)} placeholder="000-00-00000" required={!openingSoon} value={openingSoon ? "" : businessNumber} />
      </label>
      <label className="flex min-h-[44px] items-center gap-2 text-sm"><input checked={openingSoon} onChange={(e) => setOpeningSoon(e.target.checked)} type="checkbox" />개업 예정(사업자등록번호가 아직 없어요)</label>
    </div>
    <div className="space-y-2">
      <label className="block text-sm font-semibold" htmlFor="store-address-query">매장 주소</label>
      <div className="flex gap-2">
        <input className={`${field} font-normal`} id="store-address-query" onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void searchAddress(); } }} placeholder="도로명·건물명으로 검색" value={query} />
        <Button className="min-h-[44px] shrink-0" onClick={() => void searchAddress()} type="button" variant="outline">검색</Button>
      </div>
      {results.length ? <ul aria-label="주소 검색 결과" className="max-h-56 divide-y overflow-auto rounded-lg border">
        {results.map((item) => <li key={item.address}><button className="min-h-[44px] w-full px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setBaseAddress(item.address); setResults([]); }} type="button">{item.address}{item.buildingName ? ` · ${item.buildingName}` : ""}</button></li>)}
      </ul> : null}
      {baseAddress ? <p className="text-sm">선택한 주소: <strong>{baseAddress}</strong></p> : <p className="text-xs text-slate-500">검색한 뒤 주소를 눌러 선택해 주세요.</p>}
      <input aria-label="상세 주소" className={`${field} font-normal`} maxLength={200} onChange={(e) => setAddressDetail(e.target.value)} placeholder="상세 주소(층·호수 등)" value={addressDetail} />
    </div>
    <label className="flex min-h-[44px] items-center gap-2 text-sm"><input checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} required type="checkbox" />MAJU 매장 이용 약관에 동의합니다.</label>
    {message ? <p className="text-sm text-rose-700" role="alert">{message}</p> : null}
    <Button className="min-h-[44px] w-full" disabled={busy || !baseAddress} type="submit">{busy ? "가입 중…" : "매장 등록하기"}</Button>
  </form>;
}

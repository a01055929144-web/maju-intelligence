"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "./ui/button";
import { BottomSheet } from "./ui/mobile/bottom-sheet";
import { DELIVERY_RECEIVE_METHODS } from "@/domains/order/delivery-info";

type Info = { baseAddress: string; addressDetail: string; accessNote: string; deliveryContactPhone: string; receiveMethod: string;
  hasAccessPassword: boolean; hasProfile: boolean; required: { profile: boolean; receiveMethod: boolean }; message?: string };
const field = "mt-1 min-h-[44px] w-full rounded border px-3";

/** CX-152: 배송 정보 입력 시트 하나(주문 화면·홈·매장 정보가 같이 쓴다). 저장은 /api/store/delivery-info 한 경로. 비밀번호 값은 읽어 오지 않는다. */
export function StoreDeliveryInfoSheet({ companyId, storeAccountId, onClose, onSaved }: { companyId: string; storeAccountId: string; onClose: () => void; onSaved: () => void }) {
  const scope = new URLSearchParams({ companyId, storeAccountId }).toString();
  const [info, setInfo] = useState<Info | null>(null);
  const [query, setQuery] = useState(""); const [results, setResults] = useState<Array<{ address: string; selectionProof: string }>>([]);
  const [baseAddress, setBaseAddress] = useState(""); const [selectionProof, setSelectionProof] = useState("");
  const [addressDetail, setAddressDetail] = useState(""); const [receiveMethod, setReceiveMethod] = useState("");
  const [accessNote, setAccessNote] = useState(""); const [phone, setPhone] = useState("");
  const [accessControlled, setAccessControlled] = useState(false); const [password, setPassword] = useState("");
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void fetch(`/api/store/delivery-info?${scope}`, { cache: "no-store" }).then(async response => {
      const body = await response.json() as Info; if (!response.ok) throw new Error(body.message);
      if (!live) return;
      setInfo(body); setBaseAddress(body.baseAddress); setAddressDetail(body.addressDetail); setReceiveMethod(body.receiveMethod);
      setAccessNote(body.accessNote); setPhone(body.deliveryContactPhone);
    }).catch(cause => { if (live) setMessage(cause instanceof Error ? cause.message : "배송 정보를 불러오지 못했습니다."); });
    return () => { live = false; };
  }, [scope]);
  async function search(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/store/delivery-info?${scope}&query=${encodeURIComponent(query)}`);
      const body = await response.json() as { message?: string; results?: Array<{ address: string; selectionProof: string }> };
      if (!response.ok) throw new Error(body.message); setResults(body.results || []);
      if (!body.results?.length) setMessage("검색 결과가 없습니다. 도로명이나 지번을 확인해 주세요.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "주소를 검색하지 못했습니다."); } finally { setBusy(false); }
  }
  const required = info?.required;
  const needPassword = Boolean(required?.receiveMethod) && (receiveMethod === "dawn" || accessControlled);
  // 저장 전에 빠진 것을 한 줄로 알려 준다(서버도 같은 규칙으로 다시 확인한다).
  const missing = !info ? ["불러오는 중"] : [
    !baseAddress.trim() && "배송 주소", !addressDetail.trim() && "상세 주소",
    ...(required?.profile ? [
      required.receiveMethod && !receiveMethod && "받는 방법", !accessNote.trim() && "적치 위치", phone.replace(/\D/g, "").length < 9 && "배송 연락처",
      needPassword && !password && !info.hasAccessPassword && "출입 비밀번호"] : [])].filter(Boolean) as string[];
  async function save() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/store/delivery-info?${scope}`, { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectionProof, addressDetail, receiveMethod, accessNote, deliveryContactPhone: phone, accessControlled, ...(password ? { accessPassword: password } : {}) }) });
      const body = await response.json().catch(() => ({})) as { message?: string }; if (!response.ok) throw new Error(body.message || "배송 정보를 저장하지 못했습니다.");
      setPassword(""); onSaved();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "배송 정보를 저장하지 못했습니다."); } finally { setBusy(false); }
  }
  return <BottomSheet title="배송 정보 입력" onClose={onClose}>
    <div className="mx-auto max-w-2xl space-y-3">
      <p className="text-sm text-slate-600">배송 정보를 모두 넣어야 배송됩니다.</p>
      <form className="flex gap-2" onSubmit={search}>
        <input aria-label="주소 검색어" className={`${field} min-w-0 flex-1`} onChange={event => setQuery(event.target.value)} placeholder="도로명·지번으로 검색" value={query} />
        <Button disabled={busy || query.trim().length < 2} type="submit">주소 검색</Button>
      </form>
      {results.length > 0 && <ul className="space-y-2">{results.map(item => <li key={item.selectionProof}><button className="min-h-[44px] w-full rounded border p-3 text-left" type="button"
        onClick={() => { setBaseAddress(item.address); setSelectionProof(item.selectionProof); setResults([]); }}>{item.address}</button></li>)}</ul>}
      <label className="block text-sm font-medium">배송 주소<input className={`${field} bg-slate-50`} readOnly value={baseAddress} /></label>
      <label className="block text-sm font-medium">상세 주소<input className={field} maxLength={100} onChange={event => setAddressDetail(event.target.value)} value={addressDetail} /></label>
      {required?.profile && <>
        {required.receiveMethod && <label className="block text-sm font-medium">받는 방법<select className={field} onChange={event => setReceiveMethod(event.target.value)} value={receiveMethod}>
          <option value="">선택해 주세요</option>{DELIVERY_RECEIVE_METHODS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
        <label className="block text-sm font-medium">적치 위치<input className={field} maxLength={500} onChange={event => setAccessNote(event.target.value)} placeholder="예: 후문 냉장고 앞" value={accessNote} /></label>
        <label className="block text-sm font-medium">배송 연락처<input className={field} inputMode="tel" maxLength={30} onChange={event => setPhone(event.target.value)} value={phone} /></label>
        {required.receiveMethod && <>
          <label className="flex min-h-[44px] items-center gap-2 text-sm font-medium"><input checked={accessControlled} onChange={event => setAccessControlled(event.target.checked)} type="checkbox" />출입 통제 있음</label>
          {needPassword && <label className="block text-sm font-medium">출입 비밀번호
            <input autoComplete="new-password" className={field} maxLength={100} onChange={event => setPassword(event.target.value)} placeholder={info?.hasAccessPassword ? "저장됨 · 바꿀 때만 입력" : ""} type="password" value={password} />
            <span className="mt-1 block text-xs text-slate-500">저장된 값은 화면에 다시 보여 주지 않습니다.</span></label>}
        </>}
      </>}
      {missing.length > 0 && <p aria-live="polite" className="text-sm text-amber-800" data-testid="delivery-info-missing">빠진 항목: {missing.join(", ")}</p>}
      {message && <p className="text-sm text-red-700" role="status">{message}</p>}
      <Button className="min-h-[48px] w-full" disabled={busy || missing.length > 0} onClick={() => void save()} type="button">{busy ? "저장 중" : "배송 정보 저장"}</Button>
    </div>
  </BottomSheet>;
}

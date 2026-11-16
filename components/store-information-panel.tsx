"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ErrorState, LoadingState } from "./ui/state";
import { Notice } from "./ui/notice";

type Information = { businessRegistrationNumber: string; canEdit: boolean; phone: string; representativeName: string; storeName: string;
  profileSettingsEnabled?: boolean; baseAddress?: string; addressDetail?: string; accessNote?: string; deliveryContactPhone?: string; preferredDeliveryTime?: string };
type Draft = { phone: string; representativeName: string; storeName: string; baseAddress: string; addressDetail: string; accessNote: string; deliveryContactPhone: string; preferredDeliveryTime: string };
const draftOf = (value?: Information): Draft => ({ phone: value?.phone || "", representativeName: value?.representativeName || "", storeName: value?.storeName || "",
  baseAddress: value?.baseAddress || "", addressDetail: value?.addressDetail || "", accessNote: value?.accessNote || "",
  deliveryContactPhone: value?.deliveryContactPhone || "", preferredDeliveryTime: value?.preferredDeliveryTime || "" });

export function StoreInformationPanel({ canManageAddress, canManageMembers, companyId, storeAccountId }: {
  canManageAddress: boolean; canManageMembers: boolean; companyId: string; storeAccountId: string;
}) {
  const [information, setInformation] = useState<Information | null>(null);
  const [draft, setDraft] = useState<Draft>(draftOf());
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const query = new URLSearchParams({ companyId, storeAccountId }).toString();
  async function load() {
    setError("");
    try {
      const response = await fetch(`/api/store/information?${query}`, { cache: "no-store" });
      const body = await response.json() as Information & { message?: string };
      if (!response.ok) throw new Error(body.message || "매장 정보를 불러오지 못했습니다.");
      setInformation(body); setDraft(draftOf(body));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "매장 정보를 불러오지 못했습니다."); }
  }
  useEffect(() => { void load(); }, [query]);
  async function save() {
    setBusy(true); setError(""); setSaved(false);
    try {
      const response = await fetch(`/api/store/information?${query}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const body = await response.json() as { message?: string };
      if (!response.ok) throw new Error(body.message || "매장 정보를 저장하지 못했습니다.");
      await load(); setEditing(false); setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "매장 정보를 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  if (error && !information) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!information) return <LoadingState label="매장 정보를 불러오는 중입니다." />;
  const field = "mt-1 min-h-[44px] w-full rounded border px-3 disabled:bg-slate-50";
  return <div className="grid gap-4 xl:grid-cols-2">
    <Card><CardHeader><CardTitle>기본 정보</CardTitle></CardHeader><CardContent className="space-y-3">
      <label className="block text-sm font-medium">상호<input className={field} disabled={!editing} maxLength={100} onChange={event => setDraft({ ...draft, storeName: event.target.value })} value={draft.storeName} /></label>
      <label className="block text-sm font-medium">사업자등록번호<input className={field} disabled value={information.businessRegistrationNumber} /></label>
      <p className="text-xs text-slate-500">사업자등록번호 변경은 사업자 확인이 필요해 담당자에게 요청해 주세요.</p>
      <label className="block text-sm font-medium">대표자<input className={field} disabled={!editing} maxLength={50} onChange={event => setDraft({ ...draft, representativeName: event.target.value })} value={draft.representativeName} /></label>
      <label className="block text-sm font-medium">연락처<input className={field} disabled={!editing} inputMode="tel" maxLength={30} onChange={event => setDraft({ ...draft, phone: event.target.value })} value={draft.phone} /></label>
      {information.profileSettingsEnabled ? <>
        <label className="block text-sm font-medium">매장 주소<input className={field} disabled={!editing} maxLength={300} onChange={event => setDraft({ ...draft, baseAddress: event.target.value })} value={draft.baseAddress} /></label>
        <label className="block text-sm font-medium">상세 주소<input className={field} disabled={!editing} maxLength={300} onChange={event => setDraft({ ...draft, addressDetail: event.target.value })} value={draft.addressDetail} /></label>
        <label className="block text-sm font-medium">출입 방법<input className={field} disabled={!editing} maxLength={500} onChange={event => setDraft({ ...draft, accessNote: event.target.value })} value={draft.accessNote} /></label>
        <label className="block text-sm font-medium">받는 분 연락처<input className={field} disabled={!editing} inputMode="tel" maxLength={30} onChange={event => setDraft({ ...draft, deliveryContactPhone: event.target.value })} value={draft.deliveryContactPhone} /></label>
        <label className="block text-sm font-medium">받을 수 있는 시간<input className={field} disabled={!editing} maxLength={100} onChange={event => setDraft({ ...draft, preferredDeliveryTime: event.target.value })} value={draft.preferredDeliveryTime} /></label>
      </> : null}
      {information.canEdit ? editing ? <div className="flex gap-2"><Button disabled={busy || !draft.storeName.trim() || (information.profileSettingsEnabled && !draft.baseAddress.trim())} onClick={() => void save()}>저장</Button><Button disabled={busy} onClick={() => { setEditing(false); setDraft(draftOf(information)); }} variant="outline">취소</Button></div> :
        <Button onClick={() => { setEditing(true); setSaved(false); }} variant="outline">정보 수정</Button> : <p className="text-sm text-slate-600">매장 정보 수정은 점주만 할 수 있습니다.</p>}
      {saved ? <Notice kind="success">매장 정보를 저장했습니다.</Notice> : null}{error ? <Notice kind="error">{error}</Notice> : null}
    </CardContent></Card>
    <div className="space-y-4">
      <Card><CardHeader><CardTitle>배송지와 구성원</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">
        {canManageAddress ? <Link className="maju-button-secondary inline-flex min-h-[44px] items-center" href={`/store?${query}&view=info#store-address-management`}>배송지 관리</Link> : <p className="text-sm text-slate-600">배송지 수정은 점주·관리자만 할 수 있습니다.</p>}
        {canManageMembers ? <Link className="maju-button-secondary inline-flex min-h-[44px] items-center" href={`/store/members?${query}`}>구성원 관리</Link> : null}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>매장 연결</CardTitle></CardHeader><CardContent><p role="status" className="text-sm text-slate-600">연결 해제·이용 종료는 안전한 처리 절차 승인 후 제공됩니다. 지금은 담당자에게 요청해 주세요.</p></CardContent></Card>
    </div>
  </div>;
}

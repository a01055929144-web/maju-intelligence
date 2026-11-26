"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ErrorState, LoadingState } from "./ui/state";
import { Notice } from "./ui/notice";
import { StoreDeliveryInfoSheet } from "./store-delivery-info-sheet";

type Information = { businessRegistrationNumber: string; canEdit: boolean; phone: string; representativeName: string; storeName: string;
  businessIdentityEnabled?: boolean; businessName?: string; subBusinessNumber?: string; businessEntityType?: string;
  profileSettingsEnabled?: boolean; deliverySettingsEnabled?: boolean; baseAddress?: string; addressDetail?: string; accessNote?: string; deliveryContactPhone?: string; preferredDeliveryTime?: string;
  taxInvoiceEmail?: string; receiveMethod?: string; hasAccessPassword?: boolean };
type Draft = { businessName: string; subBusinessNumber: string; businessEntityType: string; phone: string; representativeName: string; storeName: string; baseAddress: string; addressDetail: string; accessNote: string; deliveryContactPhone: string; preferredDeliveryTime: string; taxInvoiceEmail: string; receiveMethod: string; accessPassword: string };
const draftOf = (value?: Information): Draft => ({ businessName: value?.businessName || "", subBusinessNumber: value?.subBusinessNumber || "", businessEntityType: value?.businessEntityType || "", phone: value?.phone || "", representativeName: value?.representativeName || "", storeName: value?.storeName || "",
  baseAddress: value?.baseAddress || "", addressDetail: value?.addressDetail || "", accessNote: value?.accessNote || "",
  deliveryContactPhone: value?.deliveryContactPhone || "", preferredDeliveryTime: value?.preferredDeliveryTime || "",
  taxInvoiceEmail: value?.taxInvoiceEmail || "", receiveMethod: value?.receiveMethod || "", accessPassword: "" });
const attachmentLabels = { cold: "냉장 보관", frozen: "냉동 보관", room: "실온 보관" } as const;

export function StoreInformationPanel({ canManageAddress, canManageMembers, companyId, storeAccountId }: {
  canManageAddress: boolean; canManageMembers: boolean; companyId: string; storeAccountId: string;
}) {
  const [information, setInformation] = useState<Information | null>(null);
  const [draft, setDraft] = useState<Draft>(draftOf());
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [step, setStep] = useState(1);
  const [sheet, setSheet] = useState(false);
  const [attachments, setAttachments] = useState<Partial<Record<keyof typeof attachmentLabels, string>>>({});
  const query = new URLSearchParams({ companyId, storeAccountId }).toString();
  async function load() {
    setError("");
    try {
      const response = await fetch(`/api/store/information?${query}`, { cache: "no-store" });
      const body = await response.json() as Information & { message?: string };
      if (!response.ok) throw new Error(body.message || "매장 정보를 불러오지 못했습니다.");
      setInformation(body); setDraft(draftOf(body));
      if (body.deliverySettingsEnabled) {
        const attachmentResponse = await fetch(`/api/store/information/attachments?${query}`, { cache: "no-store" });
        const attachmentBody = await attachmentResponse.json().catch(() => null) as { attachments?: Array<{ kind: keyof typeof attachmentLabels; url: string }> } | null;
        if (attachmentResponse.ok) setAttachments(Object.fromEntries((attachmentBody?.attachments || []).map(item => [item.kind, item.url])));
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "매장 정보를 불러오지 못했습니다."); }
  }
  async function upload(kind: keyof typeof attachmentLabels, file?: File) {
    if (!file) return;
    setBusy(true); setError("");
    const form = new FormData(); form.set("kind", kind); form.set("file", file);
    try {
      const response = await fetch(`/api/store/information/attachments?${query}`, { method: "POST", body: form });
      const body = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(body?.message || "보관 사진을 저장하지 못했습니다.");
      await load(); setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "보관 사진을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, [query]);
  async function save() {
    setBusy(true); setError(""); setSaved(false);
    try {
      const { businessName, subBusinessNumber, businessEntityType, ...settings } = draft;
      const payload = information?.businessIdentityEnabled ? { ...settings, businessName, subBusinessNumber, businessEntityType } : settings;
      const response = await fetch(`/api/store/information?${query}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json() as { message?: string };
      if (!response.ok) throw new Error(body.message || "매장 정보를 저장하지 못했습니다.");
      await load(); setEditing(false); setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "매장 정보를 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  if (error && !information) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!information) return <LoadingState label="매장 정보를 불러오는 중입니다." />;
  const field = "mt-1 min-h-[44px] w-full rounded border px-3 disabled:bg-slate-50";
  const mobileStep = (value: number) => !editing || step === value ? "" : "max-md:hidden";
  return <div className="space-y-4">
    {sheet && <StoreDeliveryInfoSheet companyId={companyId} storeAccountId={storeAccountId} onClose={() => setSheet(false)} onSaved={() => { setSheet(false); void load().then(() => setSaved(true)); }} />}
    {editing && information.deliverySettingsEnabled ? <div aria-label="매장 정보 입력 단계" className="grid grid-cols-3 gap-2 md:hidden">
      {["사업자 정보", "배송 정보", "보관 정보"].map((label, index) => <Button key={label} onClick={() => setStep(index + 1)} type="button" variant={step === index + 1 ? "default" : "outline"}>{index + 1}. {label}</Button>)}
    </div> : null}
    <div className={`grid gap-4 ${information.deliverySettingsEnabled ? "md:grid-cols-3" : "xl:grid-cols-2"}`}>
    <Card className={mobileStep(1)}><CardHeader><CardTitle>사업자 정보</CardTitle></CardHeader><CardContent className="space-y-3">
      <label className="block text-sm font-medium">상호<input className={field} disabled={!editing} maxLength={100} onChange={event => setDraft({ ...draft, storeName: event.target.value })} value={draft.storeName} /></label>
      <label className="block text-sm font-medium">사업자등록번호<input className={field} disabled value={information.businessRegistrationNumber} /></label>
      <p className="text-xs text-slate-500">사업자등록번호 변경은 사업자 확인이 필요해 담당자에게 요청해 주세요.</p>
      {information.businessIdentityEnabled && <>
        <label className="block text-sm font-medium">사업자 상호<input className={field} disabled={!editing} maxLength={100}
          value={draft.businessName} onChange={event => setDraft({ ...draft, businessName: event.target.value })} /></label>
        <label className="block text-sm font-medium">종사업장번호<input className={field} disabled={!editing} inputMode="numeric" maxLength={4}
          value={draft.subBusinessNumber} onChange={event => setDraft({ ...draft, subBusinessNumber: event.target.value })} /></label>
        <label className="block text-sm font-medium">사업자 유형<select className={field} disabled={!editing}
          value={draft.businessEntityType} onChange={event => setDraft({ ...draft, businessEntityType: event.target.value })}>
          <option value="">선택 안 함</option><option value="individual">개인</option><option value="corporation">법인</option>
        </select></label>
      </>}
      <label className="block text-sm font-medium">대표자<input className={field} disabled={!editing} maxLength={50} onChange={event => setDraft({ ...draft, representativeName: event.target.value })} value={draft.representativeName} /></label>
      <label className="block text-sm font-medium">연락처<input className={field} disabled={!editing} inputMode="tel" maxLength={30} onChange={event => setDraft({ ...draft, phone: event.target.value })} value={draft.phone} /></label>
      {information.deliverySettingsEnabled ? <label className="block text-sm font-medium">계산서 이메일<input autoComplete="email" className={field} disabled={!editing} maxLength={254} onChange={event => setDraft({ ...draft, taxInvoiceEmail: event.target.value })} type="email" value={draft.taxInvoiceEmail} /></label> : null}
    </CardContent></Card>
    {information.profileSettingsEnabled ? <Card className={mobileStep(2)}><CardHeader><CardTitle>배송 정보</CardTitle></CardHeader><CardContent className="space-y-3">
        <label className="block text-sm font-medium">매장 주소</label>
        {/* CX-152: 주소·상세 주소는 배송 정보 입력 시트 한 곳에서만 바꾼다(주문 판정이 보는 저장 위치와 같은 경로). */}
        <input className={field} disabled value={draft.baseAddress} />
        <label className="block text-sm font-medium">상세 주소<input className={field} disabled value={draft.addressDetail} /></label>
        {information.canEdit && <Button onClick={() => setSheet(true)} type="button" variant="outline">배송 정보 입력·수정</Button>}
        <label className="block text-sm font-medium">출입 방법<input className={field} disabled={!editing} maxLength={500} onChange={event => setDraft({ ...draft, accessNote: event.target.value })} value={draft.accessNote} /></label>
        <label className="block text-sm font-medium">받는 분 연락처<input className={field} disabled={!editing} inputMode="tel" maxLength={30} onChange={event => setDraft({ ...draft, deliveryContactPhone: event.target.value })} value={draft.deliveryContactPhone} /></label>
        <label className="block text-sm font-medium">받을 수 있는 시간<input className={field} disabled={!editing} maxLength={100} onChange={event => setDraft({ ...draft, preferredDeliveryTime: event.target.value })} value={draft.preferredDeliveryTime} /></label>
        {information.deliverySettingsEnabled ? <label className="block text-sm font-medium">받는 방법<select className={field} disabled={!editing} onChange={event => setDraft({ ...draft, receiveMethod: event.target.value })} value={draft.receiveMethod}>
          <option value="">선택 안 함</option><option value="door">문 앞</option><option value="inside">매장 안</option><option value="dawn">새벽 배송</option>
        </select></label> : null}
      </CardContent></Card> : null}
    {information.deliverySettingsEnabled ? <Card className={mobileStep(3)}><CardHeader><CardTitle>보관 정보</CardTitle></CardHeader><CardContent className="space-y-3">
      {(Object.keys(attachmentLabels) as Array<keyof typeof attachmentLabels>).map(kind => <label className="block text-sm font-medium" key={kind}>{attachmentLabels[kind]} 사진
        {attachments[kind] ? <a className="ml-2 text-teal-700 underline" href={attachments[kind]} rel="noreferrer" target="_blank">현재 사진</a> : null}
        {editing ? <input accept="image/*" aria-label={`${attachmentLabels[kind]} 사진`} className={`${field} py-2`} disabled={busy} onChange={event => void upload(kind, event.target.files?.[0])} type="file" /> : null}
      </label>)}
      {draft.receiveMethod === "dawn" || information.hasAccessPassword ? <label className="block text-sm font-medium">새벽 출입 비밀번호
        <input autoComplete="new-password" className={field} disabled={!editing} maxLength={100} onChange={event => setDraft({ ...draft, accessPassword: event.target.value })} placeholder={information.hasAccessPassword ? "저장됨 · 바꿀 때만 입력" : "새벽 배송일 때 입력"} type="password" value={draft.accessPassword} />
        <span className="mt-1 block text-xs text-slate-500">저장된 값은 이 화면과 일반 목록에서 다시 보여 주지 않습니다.</span>
      </label> : null}
    </CardContent></Card> : null}
    </div>
    <div className="flex flex-wrap gap-2">
      {information.canEdit ? editing ? <div className="flex gap-2"><Button disabled={busy || !draft.storeName.trim() || (information.profileSettingsEnabled && !draft.baseAddress.trim())} onClick={() => void save()}>저장</Button><Button disabled={busy} onClick={() => { setEditing(false); setDraft(draftOf(information)); }} variant="outline">취소</Button></div> :
        <Button onClick={() => { setEditing(true); setSaved(false); setStep(1); }} variant="outline">정보 수정</Button> : <p className="text-sm text-slate-600">매장 정보 수정은 점주만 할 수 있습니다.</p>}
      {saved ? <Notice kind="success">매장 정보를 저장했습니다.</Notice> : null}{error ? <Notice kind="error">{error}</Notice> : null}
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      <Card><CardHeader><CardTitle>배송지와 구성원</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">
        {canManageAddress ? <Link className="maju-button-secondary inline-flex min-h-[44px] items-center" href={`/store?${query}&view=info#store-address-management`}>배송지 관리</Link> : <p className="text-sm text-slate-600">배송지 수정은 점주·관리자만 할 수 있습니다.</p>}
        {canManageMembers ? <Link className="maju-button-secondary inline-flex min-h-[44px] items-center" href={`/store/members?${query}`}>구성원 관리</Link> : null}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>매장 연결</CardTitle></CardHeader><CardContent><p role="status" className="text-sm text-slate-600">연결 해제·이용 종료는 안전한 처리 절차 승인 후 제공됩니다. 지금은 담당자에게 요청해 주세요.</p></CardContent></Card>
    </div>
  </div>;
}

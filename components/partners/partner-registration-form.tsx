"use client";

import { useState } from "react";
import { AddressPicker } from "@/components/map/address-picker";
import { PARTNER_STATUS_LABELS, type PartnerBusinessStatus } from "@/domains/partner/registration";
import type { PartnerDuplicateCandidate } from "@/lib/business-partners";

const initial = { displayName: "", representativeName: "", phone: "", address: "", addressDetail: "", businessStatus: "active" as PartnerBusinessStatus, expectedOpeningDate: "", businessNumber: "", businessEntityType: "" as "" | "individual" | "corporation", taxInvoiceEmail: "", memo: "" };

export function PartnerRegistrationForm({ companyId = "", partnerType }: { companyId?: string; partnerType: "customer" | "supplier" }) {
  const [form, setForm] = useState(initial);
  const [candidates, setCandidates] = useState<PartnerDuplicateCandidate[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ id: string; inviteUrl?: string } | null>(null);
  const set = (key: keyof typeof form, value: string) => { setForm((current) => ({ ...current, [key]: value })); setCandidates([]); setMessage(""); };
  const save = async (confirmCreate = false) => {
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/business-partners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, companyId: companyId || undefined, partnerType, confirmCreate }) });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 409) { setCandidates(payload.candidates || []); setMessage(payload.message); return; }
      if (!response.ok) throw new Error(payload.message || "거래처를 저장하지 못했습니다.");
      setCreated({ id: payload.partner.id }); setMessage(`${partnerType === "customer" ? "매출처" : "매입처"}를 등록했습니다.`); setCandidates([]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "거래처를 저장하지 못했습니다."); }
    finally { setSaving(false); }
  };
  const issueInvite = async () => {
    const response = await fetch("/api/store-invite-codes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "issue", expiresInDays: 7, companyId: companyId || undefined }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(payload.message || "매장 초대 링크를 만들지 못했습니다."); return; }
    setCreated((current) => current ? { ...current, inviteUrl: `${window.location.origin}/store/activate?code=${encodeURIComponent(payload.code)}` } : current);
  };
  if (created) return <section className="maju-section-card space-y-4 p-5"><h2 className="text-lg font-black">등록 완료</h2><p className="text-sm text-slate-700">{message}</p>{partnerType === "customer" && form.businessStatus === "registration_pending" ? <><button className="maju-button-primary" onClick={() => void issueInvite()} type="button">매장 초대 링크 만들기</button>{created.inviteUrl ? <input aria-label="매장 초대 링크" className="maju-input w-full" readOnly value={created.inviteUrl} /> : null}</> : null}</section>;
  const pending = form.businessStatus === "registration_pending";
  return <form className="maju-section-card space-y-5 p-5" onSubmit={(event) => { event.preventDefault(); void save(); }}>
    <div><h2 className="text-lg font-black">{partnerType === "customer" ? "매출처" : "매입처"} 등록</h2><p className="text-sm text-slate-600">두 거래처 종류가 같은 입력 규칙을 사용합니다.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="상호(예정)"><input className="maju-input w-full" onChange={(e) => set("displayName", e.target.value)} value={form.displayName} /></Field>
      <Field label="대표자"><input className="maju-input w-full" onChange={(e) => set("representativeName", e.target.value)} value={form.representativeName} /></Field>
      <Field label="연락처"><input className="maju-input w-full" onChange={(e) => set("phone", e.target.value)} value={form.phone} /></Field>
      <Field label="상태"><select className="maju-input w-full" onChange={(e) => set("businessStatus", e.target.value)} value={form.businessStatus}>{Object.entries(PARTNER_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <div className="sm:col-span-2"><label className="mb-1 block text-sm font-bold">주소</label><AddressPicker onPick={(picked) => set("address", picked.address)} value={form.address} /></div>
      <Field label="상세 주소"><input className="maju-input w-full" onChange={(e) => set("addressDetail", e.target.value)} value={form.addressDetail} /></Field>
      <Field label="개업 예정일 (선택)"><input className="maju-input w-full" onChange={(e) => set("expectedOpeningDate", e.target.value)} type="date" value={form.expectedOpeningDate} /></Field>
      {!pending ? <><Field label="사업자번호"><input className="maju-input w-full" inputMode="numeric" onChange={(e) => set("businessNumber", e.target.value.replace(/\D/g, ""))} value={form.businessNumber} /></Field><Field label="사업자 형태"><select className="maju-input w-full" onChange={(e) => set("businessEntityType", e.target.value)} value={form.businessEntityType}><option value="">선택</option><option value="individual">개인</option><option value="corporation">법인</option></select></Field><Field label="계산서 이메일"><input className="maju-input w-full" onChange={(e) => set("taxInvoiceEmail", e.target.value)} type="email" value={form.taxInvoiceEmail} /></Field></> : null}
      <Field label="메모"><textarea className="maju-input min-h-24 w-full" onChange={(e) => set("memo", e.target.value)} value={form.memo} /></Field>
    </div>
    {candidates.length ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4"><h3 className="font-black">기존 거래처 후보</h3>{candidates.map((item) => <p className="mt-2 text-sm" key={`${item.partnerType}:${item.id}`}>{item.name} · {item.reason} <a className="font-bold underline" href={item.partnerType === "supplier" ? "/purchasing/suppliers" : "/crm/timeline?section=ledger"}>이 거래처 확인</a></p>)}<button className="maju-button-secondary mt-3" onClick={() => void save(true)} type="button">후보와 다른 새 거래처로 등록</button></div> : null}
    {message ? <p className="text-sm font-bold text-rose-700" role="status">{message}</p> : null}
    <button className="maju-button-primary min-h-11" disabled={saving} type="submit">{saving ? "확인 중" : "중복 확인 후 등록"}</button>
  </form>;
}

function Field({ children, label }: { children: React.ReactNode; label: string }) { return <label className="space-y-1 text-sm font-bold"><span>{label}</span>{children}</label>; }

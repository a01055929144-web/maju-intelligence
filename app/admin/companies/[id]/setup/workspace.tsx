"use client";

import { useState } from "react";
import type { ManagedCompanyAccount } from "@/lib/store";

export function AdminCompanySetupWorkspace({ company }: { company: ManagedCompanyAccount }) {
  const [form, setForm] = useState({
    businessRegistrationNumber: company.businessRegistrationNumber,
    businessType: company.businessType,
    customerEmail: company.customerEmail,
    name: company.name,
    originAddress: company.originAddress,
    ownerName: company.ownerName
  });
  const [region, setRegion] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveCompany() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/companies", {
        body: JSON.stringify({ ...form, id: company.id, status: company.status }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH"
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "고객사 정보를 저장하지 못했습니다.");
      setMessage("고객사 정보를 저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "고객사 정보를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function addSalesArea() {
    if (!region.trim()) return setMessage("시·도와 시·군·구를 입력해주세요.");
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/leads/permits/keyword-search-regions", {
        body: JSON.stringify({ companyId: company.id, label: region.trim() }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "영업 지역을 저장하지 못했습니다.");
      setRegion("");
      setMessage(`영업 지역을 저장했습니다. 기존 리드 ${Number(payload?.existingLeadCount || 0).toLocaleString()}건이 있습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "영업 지역을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="font-black text-slate-950">관리자 대행 입력</h2>
        <p className="mt-1 text-sm text-slate-600">고객 화면으로 이동하지 않고 회사 정보와 영업 지역을 바로 저장합니다.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SetupInput label="회사명" value={form.name} onChange={(value) => update("name", value)} />
        <SetupInput label="대표자" value={form.ownerName} onChange={(value) => update("ownerName", value)} />
        <SetupInput label="사업자등록번호" value={form.businessRegistrationNumber} onChange={(value) => update("businessRegistrationNumber", value.replace(/\D/g, "").slice(0, 10))} />
        <SetupInput label="대표 로그인 이메일" type="email" value={form.customerEmail} onChange={(value) => update("customerEmail", value)} />
        <SetupInput label="영업 기본 업종" value={form.businessType} onChange={(value) => update("businessType", value)} />
        <SetupInput label="출발지 주소" value={form.originAddress} onChange={(value) => update("originAddress", value)} />
      </div>
      <button className="maju-button-primary" disabled={saving} onClick={() => void saveCompany()} type="button">{saving ? "저장 중..." : "회사 정보 저장"}</button>
      <div className="border-t border-slate-200 pt-4">
        <label className="block text-sm font-bold text-slate-700">영업 지역 추가</label>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <input className="maju-input min-w-0 flex-1" onChange={(event) => setRegion(event.target.value)} placeholder="예: 서울특별시 강남구" value={region} />
          <button className="maju-button-secondary shrink-0" disabled={saving} onClick={() => void addSalesArea()} type="button">지역 저장</button>
        </div>
      </div>
      {message ? <p aria-live="polite" className="text-sm font-bold text-slate-700">{message}</p> : null}
    </section>
  );
}

function SetupInput({ label, onChange, type = "text", value }: { label: string; onChange: (value: string) => void; type?: string; value: string }) {
  return <label className="block text-sm font-bold text-slate-700">{label}<input className="maju-input mt-1 w-full" onChange={(event) => onChange(event.target.value)} type={type} value={value} /></label>;
}

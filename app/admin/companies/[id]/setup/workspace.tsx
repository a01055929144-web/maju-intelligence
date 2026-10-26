"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ManagedCompanyAccount } from "@/lib/store";
import { KOREAN_ADMINISTRATIVE_AREAS, KOREAN_PROVINCES } from "@/lib/korean-administrative-areas";

export function AdminCompanySetupWorkspace({ company }: { company: ManagedCompanyAccount }) {
  const router = useRouter();
  const [form, setForm] = useState({
    businessRegistrationNumber: company.businessRegistrationNumber,
    businessType: company.businessType,
    customerEmail: company.customerEmail,
    name: company.name,
    originAddress: company.originAddress,
    ownerName: company.ownerName
  });
  const [province, setProvince] = useState("서울특별시");
  const [district, setDistrict] = useState("");
  const [salesAreaConfigured, setSalesAreaConfigured] = useState(company.salesAreaCount > 0);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const districts = KOREAN_ADMINISTRATIVE_AREAS[province] || [];

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
    if (!district) return setMessage("시·군·구를 선택해주세요.");
    const region = `${province} ${district}`;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/leads/permits/keyword-search-regions", {
        body: JSON.stringify({ companyId: company.id, label: region }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "영업 지역을 저장하지 못했습니다.");
      setDistrict("");
      setSalesAreaConfigured(true);
      setMessage(`${region}을 저장했습니다. 현재 확인되는 기존 리드 ${Number(payload?.existingLeadCount || 0).toLocaleString()}건을 대상으로 시작할 수 있습니다.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "영업 지역을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div id="sales-area-step" className={`rounded-xl border p-4 ${salesAreaConfigured ? "border-emerald-200 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
        <p className="text-xs font-black text-amber-800">필수 1단계</p>
        <h2 className="mt-1 text-lg font-black text-slate-950">영업 지역부터 설정</h2>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">지역이 없으면 매일 수집할 리드가 0곳입니다. 시·도와 시·군·구를 선택하면 현재 리드 수를 확인하고 다음 설정을 진행합니다.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="text-sm font-bold text-slate-700">시·도
            <select className="maju-input mt-1 w-full" onChange={(event) => { setProvince(event.target.value); setDistrict(""); }} value={province}>
              {KOREAN_PROVINCES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-sm font-bold text-slate-700">시·군·구
            <select className="maju-input mt-1 w-full" onChange={(event) => setDistrict(event.target.value)} value={district}>
              <option value="">선택해주세요</option>
              {districts.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <button className="maju-button-primary self-end" disabled={saving || !district} onClick={() => void addSalesArea()} type="button">{saving ? "저장 중..." : "지역 저장"}</button>
        </div>
        {salesAreaConfigured ? <p className="mt-3 text-sm font-black text-emerald-800">영업 지역이 설정되어 다음 단계를 진행할 수 있습니다.</p> : null}
      </div>
      <fieldset className="space-y-4" disabled={!salesAreaConfigured}>
        <div>
          <h2 className="font-black text-slate-950">2단계 이후 · 관리자 대행 입력</h2>
          <p className="mt-1 text-sm text-slate-600">회사 정보와 로그인 기준값을 고객 화면으로 이동하지 않고 저장합니다.</p>
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
      </fieldset>
      {message ? <p aria-live="polite" className="text-sm font-bold text-slate-700">{message}</p> : null}
    </section>
  );
}

function SetupInput({ label, onChange, type = "text", value }: { label: string; onChange: (value: string) => void; type?: string; value: string }) {
  return <label className="block text-sm font-bold text-slate-700">{label}<input className="maju-input mt-1 w-full" onChange={(event) => onChange(event.target.value)} type={type} value={value} /></label>;
}

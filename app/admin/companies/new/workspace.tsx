"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ClipboardCopy, FileText, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KOREAN_ADMINISTRATIVE_AREAS, KOREAN_PROVINCES } from "@/lib/korean-administrative-areas";

const DRAFT_KEY = "maju-admin-company-onboarding-draft-v1";
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const STEPS = ["회사·사업자등록증", "정산 계좌·통장사본", "영업권·영업지역", "배송차·기사", "담당자·로그인", "요금제"] as const;

type Draft = {
  companyName: string;
  businessNumber: string;
  businessType: string;
  ownerName: string;
  originAddress: string;
  bankName: string;
  bankAccountLast4: string;
  province: string;
  district: string;
  vehicleName: string;
  driverName: string;
  driverPhone: string;
  managerName: string;
  customerEmail: string;
  plan: string;
};

const EMPTY_DRAFT: Draft = {
  companyName: "", businessNumber: "", businessType: "식자재 유통", ownerName: "", originAddress: "",
  bankName: "", bankAccountLast4: "", province: "서울특별시", district: "", vehicleName: "", driverName: "",
  driverPhone: "", managerName: "", customerEmail: "", plan: "trial"
};

export function CompanyOnboardingWorkspace({ accountCreationEnabled }: { accountCreationEnabled: boolean }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [password, setPassword] = useState("");
  const [businessDocument, setBusinessDocument] = useState<File>();
  const [bankDocument, setBankDocument] = useState<File>();
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ companyId: string; inviteUrl?: string }>();
  const districts = KOREAN_ADMINISTRATIVE_AREAS[draft.province] || [];

  useEffect(() => {
    const saved = window.sessionStorage.getItem(DRAFT_KEY);
    if (!saved) return;
    try {
      setDraft({ ...EMPTY_DRAFT, ...JSON.parse(saved) });
    } catch {
      window.sessionStorage.removeItem(DRAFT_KEY);
    }
  }, []);

  const canFinish = useMemo(() => Boolean(
    accountCreationEnabled && draft.companyName.trim() && draft.ownerName.trim() && draft.customerEmail.trim() && password.length >= 10 && draft.district
  ), [accountCreationEnabled, draft, password]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function saveDraft() {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    setMessage("민감정보를 제외한 입력값을 이 브라우저 탭에 임시 저장했습니다.");
  }

  function selectDocument(event: ChangeEvent<HTMLInputElement>, setFile: (file?: File) => void) {
    const file = event.target.files?.[0];
    if (!file) return setFile(undefined);
    if (!DOCUMENT_TYPES.includes(file.type) || file.size > MAX_DOCUMENT_BYTES) {
      event.target.value = "";
      setMessage("서류는 PDF·JPG·PNG 형식, 10MB 이하만 선택할 수 있습니다.");
      return;
    }
    setFile(file);
    setMessage("");
  }

  async function finish() {
    if (!canFinish) return setMessage("회사·대표·로그인·영업지역 필수 항목과 10자 이상 임시 비밀번호를 확인해주세요.");
    setSaving(true);
    setMessage("");
    try {
      const companyResponse = await fetch("/api/admin/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.companyName, ownerName: draft.ownerName, businessRegistrationNumber: draft.businessNumber,
          businessType: draft.businessType, originAddress: draft.originAddress, customerEmail: draft.customerEmail,
          customerPassword: password, status: "active"
        })
      });
      const companyPayload = await companyResponse.json().catch(() => null);
      if (!companyResponse.ok || !companyPayload?.company?.id) throw new Error(companyPayload?.message || "고객사를 만들지 못했습니다.");
      const companyId = String(companyPayload.company.id);
      setResult({ companyId });
      const areaResponse = await fetch("/api/leads/permits/keyword-search-regions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, label: `${draft.province} ${draft.district}` })
      });
      if (!areaResponse.ok) throw new Error("고객사는 생성됐지만 영업 지역 저장에 실패했습니다. 고객사 초기 설정에서 이어서 저장해주세요.");
      let inviteUrl = "";
      if (draft.driverName.trim()) {
        const inviteResponse = await fetch("/api/admin/staff-invitations", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId, employeeName: draft.driverName, employeePhone: draft.driverPhone, role: "driver" })
        });
        const invitePayload = await inviteResponse.json().catch(() => null);
        if (!inviteResponse.ok) throw new Error(invitePayload?.message || "고객사는 생성됐지만 기사 초대 링크를 만들지 못했습니다.");
        inviteUrl = invitePayload?.invitation?.inviteUrl || "";
      }
      window.sessionStorage.removeItem(DRAFT_KEY);
      setResult({ companyId, inviteUrl });
      setMessage("고객사와 영업 지역을 등록했습니다. 자동 발송은 하지 않았습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "고객사 등록을 완료하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const 안내문 = result ? [`고객사: ${draft.companyName}`, `로그인: ${draft.customerEmail}`, "임시 비밀번호: 등록 시 입력한 값", result.inviteUrl ? `기사 초대: ${result.inviteUrl}` : ""].filter(Boolean).join("\n") : "";

  return (
    <section className="mx-auto max-w-6xl space-y-4 px-4 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link className="inline-flex h-10 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-bold" href="/admin/companies"><ArrowLeft className="h-4 w-4" /> 고객사 관리</Link>
        <Button onClick={saveDraft} type="button" variant="outline"><Save className="h-4 w-4" /> 임시 저장</Button>
      </div>

      <ol className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {STEPS.map((label, index) => <li key={label}><button className={`h-full w-full rounded-lg border p-3 text-left text-sm font-black ${step === index ? "border-violet-500 bg-violet-50 text-violet-950" : "bg-white text-slate-600"}`} onClick={() => setStep(index)} type="button"><span className="mr-2 text-xs">{index + 1}</span>{label}</button></li>)}
      </ol>

      {!accountCreationEnabled ? <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950">로그인 연동은 기본 OFF입니다. 지금은 민감정보를 제외한 등록안을 임시 저장하고 검토할 수 있으며, 대표 승인 후 플래그를 켜야 고객사 계정이 생성됩니다.</p> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black text-slate-950">{step + 1}. {STEPS[step]}</h2>
        <p className="mt-1 text-sm text-slate-600">입력 중에는 자동 발송·결제·운영 DB 스키마 변경이 일어나지 않습니다.</p>
        <div className="mt-5">{renderStep()}</div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button disabled={step === 0} onClick={() => setStep((current) => current - 1)} type="button" variant="outline">이전</Button>
        {step < STEPS.length - 1
          ? <Button onClick={() => setStep((current) => current + 1)} type="button">다음 <ArrowRight className="h-4 w-4" /></Button>
          : <Button disabled={saving || !canFinish || Boolean(result)} onClick={() => void finish()} type="button">{saving ? "등록 중..." : "등록 완료"} <Check className="h-4 w-4" /></Button>}
      </div>

      {message ? <p aria-live="polite" className="rounded-lg border border-slate-200 bg-white p-3 text-sm font-bold text-slate-700">{message}</p> : null}
      {result ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="font-black text-emerald-950">고객 안내문</p><pre className="mt-2 whitespace-pre-wrap text-sm text-emerald-950">{안내문}</pre><Button className="mt-3" onClick={() => void navigator.clipboard.writeText(안내문)} type="button" variant="outline"><ClipboardCopy className="h-4 w-4" /> 안내문 복사</Button></div> : null}
    </section>
  );

  function renderStep() {
    if (step === 0) return <div className="grid gap-4 sm:grid-cols-2"><Input label="회사명*" value={draft.companyName} onChange={(value) => update("companyName", value)} /><Input label="대표자*" value={draft.ownerName} onChange={(value) => update("ownerName", value)} /><Input label="사업자등록번호" value={draft.businessNumber} onChange={(value) => update("businessNumber", value.replace(/\D/g, "").slice(0, 10))} /><Input label="업종" value={draft.businessType} onChange={(value) => update("businessType", value)} /><Input label="출발지 주소" value={draft.originAddress} onChange={(value) => update("originAddress", value)} /><FileInput file={businessDocument} label="사업자등록증" onChange={(event) => selectDocument(event, setBusinessDocument)} /></div>;
    if (step === 1) return <div className="grid gap-4 sm:grid-cols-2"><Input label="은행" value={draft.bankName} onChange={(value) => update("bankName", value)} /><Input label="계좌 끝 4자리만*" value={draft.bankAccountLast4} onChange={(value) => update("bankAccountLast4", value.replace(/\D/g, "").slice(-4))} /><FileInput file={bankDocument} label="통장사본" onChange={(event) => selectDocument(event, setBankDocument)} /><Notice text="전체 계좌번호·서류 원본은 임시 저장하지 않습니다. 비공개 company-documents 저장소 승인 후 등록 화면에서 업로드합니다." /></div>;
    if (step === 2) return <div className="grid gap-4 sm:grid-cols-2"><Select label="시·도" value={draft.province} onChange={(value) => { update("province", value); update("district", ""); }} options={KOREAN_PROVINCES} /><Select label="시·군·구*" value={draft.district} onChange={(value) => update("district", value)} options={districts} placeholder="선택해주세요" /><Notice text="영업권 준비 기간은 60일입니다. 거래처 엑셀 자동 등록과 겹침 표시는 기존 가져오기 화면에서 이어서 진행합니다." /></div>;
    if (step === 3) return <div className="grid gap-4 sm:grid-cols-2"><Input label="배송차 이름" value={draft.vehicleName} onChange={(value) => update("vehicleName", value)} /><Input label="기사 이름" value={draft.driverName} onChange={(value) => update("driverName", value)} /><Input label="기사 연락처" value={draft.driverPhone} onChange={(value) => update("driverPhone", value)} /><Notice text="기사 이름을 입력하면 등록 완료 시 기존 카카오 초대 흐름으로 링크를 만듭니다." /></div>;
    if (step === 4) return <div className="grid gap-4 sm:grid-cols-2"><Input label="담당자" value={draft.managerName} onChange={(value) => update("managerName", value)} /><Input label="로그인 이메일*" type="email" value={draft.customerEmail} onChange={(value) => update("customerEmail", value)} /><Input label="임시 비밀번호* (10자 이상)" type="password" value={password} onChange={setPassword} /><Notice text="임시 비밀번호는 브라우저 임시 저장과 안내문에 기록하지 않습니다. 로그인 방식 변경 플래그도 켜지 않습니다." /></div>;
    return <div className="grid gap-4 sm:grid-cols-2"><Select label="요금제" value={draft.plan} onChange={(value) => update("plan", value)} options={["trial", "starter", "growth"]} /><Notice text="요금제 선택은 준비 정보이며 결제·청구를 시작하지 않습니다. 돈이 오가는 기능은 기본 OFF 상태를 유지합니다." /></div>;
  }
}

function Input({ label, onChange, type = "text", value }: { label: string; onChange: (value: string) => void; type?: string; value: string }) {
  return <label className="text-sm font-bold text-slate-700">{label}<input className="maju-input mt-1 w-full" onChange={(event) => onChange(event.target.value)} type={type} value={value} /></label>;
}
function Select({ label, onChange, options, placeholder, value }: { label: string; onChange: (value: string) => void; options: readonly string[]; placeholder?: string; value: string }) {
  return <label className="text-sm font-bold text-slate-700">{label}<select className="maju-input mt-1 w-full" onChange={(event) => onChange(event.target.value)} value={value}>{placeholder ? <option value="">{placeholder}</option> : null}{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}
function FileInput({ file, label, onChange }: { file?: File; label: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return <label className="rounded-lg border border-dashed border-slate-300 p-3 text-sm font-bold text-slate-700"><span className="flex items-center gap-2"><FileText className="h-4 w-4" /> {label}</span><input accept="application/pdf,image/jpeg,image/png" className="mt-2 block w-full text-xs" onChange={onChange} type="file" /><span className="mt-1 block text-xs text-slate-500">{file ? file.name : "PDF·JPG·PNG, 최대 10MB"}</span></label>;
}
function Notice({ text }: { text: string }) { return <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-950 sm:col-span-2">{text}</p>; }

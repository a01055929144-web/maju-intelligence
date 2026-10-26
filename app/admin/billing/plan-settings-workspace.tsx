"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";

type PlanDraft = {
  code: string;
  id: string;
  monthlyAmountWon: string;
  monthlyLeadLimit: string;
  name: string;
  staffLimit: string;
  trialDays: string;
};

const emptyPlan = (id: string): PlanDraft => ({ code: "", id, monthlyAmountWon: "", monthlyLeadLimit: "", name: "", staffLimit: "", trialDays: "" });

export function AdminPlanSettingsWorkspace({ enabled }: { readonly enabled: boolean }) {
  const [usageWindowMonths, setUsageWindowMonths] = useState("");
  const [plans, setPlans] = useState<PlanDraft[]>(() => [emptyPlan("plan-1")]);
  const [message, setMessage] = useState("");
  const nextPlanId = useRef(2);

  const validation = useMemo(() => validateDraft(usageWindowMonths, plans), [plans, usageWindowMonths]);

  function updatePlan(index: number, field: keyof PlanDraft, value: string) {
    setPlans((current) => current.map((plan, planIndex) => (planIndex === index ? { ...plan, [field]: value } : plan)));
    setMessage("");
  }

  function reviewDraft() {
    setMessage(validation || "입력 형식 검토가 끝났습니다. SQL 승인·적용과 저장 API 준비 전에는 서버에 저장되지 않습니다.");
  }

  return (
    <section className="maju-section-card mt-6" data-feature-enabled={enabled ? "true" : "false"}>
      <div className="maju-card-header flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="maju-section-title">요금제 정책 설정</p>
          <p className="mt-1 maju-muted-label">금액·체험 기간·리드 기준을 대표 승인값으로 입력하는 WO-8 준비 화면</p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-black ${enabled ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>
          {enabled ? "입력 검토 모드" : "기능 OFF"}
        </span>
      </div>

      <div className={`m-4 flex items-start gap-3 rounded-lg border p-4 ${enabled ? "border-amber-200 bg-amber-50 text-amber-950" : "border-slate-200 bg-slate-50 text-slate-800"}`}>
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-black">SQL 승인·적용 전에는 저장과 결제를 실행하지 않습니다.</p>
          <p className="mt-1 text-sm font-semibold leading-6 opacity-80">
            이 화면은 새 테이블을 조회하거나 쓰지 않으며 Toss 결제도 호출하지 않습니다. 서버 환경의 WO8_BILLING_V2_ENABLED가 true일 때만 입력 형식 검토가 열립니다.
          </p>
        </div>
      </div>

      <fieldset className="space-y-5 p-4 pt-0 disabled:cursor-not-allowed disabled:opacity-60" disabled={!enabled}>
        <label className="block max-w-sm">
          <span className="mb-2 block text-sm font-black text-slate-800">추천 산정 기간</span>
          <span className="flex h-11 items-center rounded-md border border-slate-200 bg-white px-3 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100">
            <input className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none" min="1" onChange={(event) => { setUsageWindowMonths(event.target.value); setMessage(""); }} placeholder="대표 승인 후 입력" type="number" value={usageWindowMonths} />
            <span className="text-sm font-bold text-slate-500">개월</span>
          </span>
        </label>

        <div className="space-y-3">
          {plans.map((plan, index) => (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4" key={plan.id}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="font-black text-slate-900">요금제 {index + 1}</p>
                <button aria-label={`요금제 ${index + 1} 삭제`} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40" disabled={plans.length === 1} onClick={() => setPlans((current) => current.filter((_, planIndex) => planIndex !== index))} type="button"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <PlanInput label="요금제 코드" onChange={(value) => updatePlan(index, "code", value)} placeholder="예: 대표 승인 코드" value={plan.code} />
                <PlanInput label="요금제 이름" onChange={(value) => updatePlan(index, "name", value)} placeholder="대표 승인 후 입력" value={plan.name} />
                <PlanInput label="월 금액 (원)" min="0" onChange={(value) => updatePlan(index, "monthlyAmountWon", value)} placeholder="대표 승인 후 입력" type="number" value={plan.monthlyAmountWon} />
                <PlanInput label="월 신규 리드 상한" min="0" onChange={(value) => updatePlan(index, "monthlyLeadLimit", value)} placeholder="대표 승인 후 입력" type="number" value={plan.monthlyLeadLimit} />
                <PlanInput label="직원 상한" min="0" onChange={(value) => updatePlan(index, "staffLimit", value)} placeholder="대표 승인 후 입력" type="number" value={plan.staffLimit} />
                <PlanInput label="체험 기간 (일)" min="0" onChange={(value) => updatePlan(index, "trialDays", value)} placeholder="대표 승인 후 입력" type="number" value={plan.trialDays} />
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <button className="maju-button-secondary inline-flex items-center justify-center gap-2" onClick={() => { setPlans((current) => [...current, emptyPlan(`plan-${nextPlanId.current++}`)]); setMessage(""); }} type="button"><Plus className="h-4 w-4" />요금제 추가</button>
          <button className="maju-button-primary" onClick={reviewDraft} type="button">입력 형식 검토</button>
        </div>
      </fieldset>

      {message ? (
        <div aria-live="polite" className={`mx-4 mb-4 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm font-bold ${validation ? "border-rose-200 bg-rose-50 text-rose-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
          {validation ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}{message}
        </div>
      ) : null}
    </section>
  );
}

function PlanInput({ label, min, onChange, placeholder, type = "text", value }: { readonly label: string; readonly min?: string; readonly onChange: (value: string) => void; readonly placeholder: string; readonly type?: "number" | "text"; readonly value: string }) {
  return <label><span className="mb-2 block text-xs font-black text-slate-600">{label}</span><input className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" min={min} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type={type} value={value} /></label>;
}

function validateDraft(usageWindowMonths: string, plans: PlanDraft[]) {
  if (!isPositiveInteger(usageWindowMonths)) return "추천 산정 기간은 1개월 이상의 정수로 입력해주세요.";
  if (!plans.length) return "요금제를 한 개 이상 입력해주세요.";
  for (const [index, plan] of plans.entries()) {
    const label = `요금제 ${index + 1}`;
    if (!plan.code.trim() || !plan.name.trim()) return `${label}의 코드와 이름을 입력해주세요.`;
    if (![plan.monthlyAmountWon, plan.monthlyLeadLimit, plan.staffLimit, plan.trialDays].every(isNonNegativeInteger)) return `${label}의 금액·리드·직원·체험 기준은 0 이상의 정수로 입력해주세요.`;
  }
  const codes = plans.map((plan) => plan.code.trim());
  if (new Set(codes).size !== codes.length) return "요금제 코드는 서로 달라야 합니다.";
  return "";
}

function isPositiveInteger(value: string) {
  return /^\d+$/.test(value) && Number(value) > 0;
}

function isNonNegativeInteger(value: string) {
  return /^\d+$/.test(value) && Number(value) >= 0;
}

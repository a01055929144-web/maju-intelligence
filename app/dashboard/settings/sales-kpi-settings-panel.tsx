"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Target } from "lucide-react";
import { Button } from "@/components/ui/button";

type Kpi = { actualContacts: number; actualConversions: number; actualQuotes: number; periodMonth: string; targetContacts: number; targetConversions: number; targetQuotes: number };
const emptyKpi: Kpi = { actualContacts: 0, actualConversions: 0, actualQuotes: 0, periodMonth: "", targetContacts: 0, targetConversions: 0, targetQuotes: 0 };

export function SalesKpiSettingsPanel({ canManage }: { canManage: boolean }) {
  const [kpi, setKpi] = useState(emptyKpi);
  const [form, setForm] = useState({ targetContacts: 0, targetConversions: 0, targetQuotes: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch("/api/sales-kpi", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.kpi) throw new Error(payload?.message || "영업 목표를 불러오지 못했습니다.");
      setKpi(payload.kpi);
      setForm({ targetContacts: payload.kpi.targetContacts, targetConversions: payload.kpi.targetConversions, targetQuotes: payload.kpi.targetQuotes });
    }).catch((error) => setMessage(error instanceof Error ? error.message : "영업 목표를 불러오지 못했습니다.")).finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true); setMessage("");
    const response = await fetch("/api/sales-kpi", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const payload = await response.json().catch(() => null);
    setSaving(false);
    setMessage(response.ok ? "이번 달 회사 공통 영업 목표를 저장했습니다." : payload?.message || "영업 목표를 저장하지 못했습니다.");
    if (response.ok) setKpi((current) => ({ ...current, ...form }));
  }

  return <section className="maju-section-card">
    <div className="maju-card-header"><div className="flex items-center gap-2"><Target className="h-5 w-5 text-teal-700" /><h2 className="text-xl font-black text-slate-950">이번 달 영업 KPI</h2></div><p className="mt-2 text-sm font-semibold text-slate-500">회사 공통 목표를 정하면 모바일 영업 화면에서 담당자 실적과 함께 표시합니다.</p></div>
    <div className="grid gap-3 p-4 md:grid-cols-3">
      {loading ? <div className="col-span-full flex min-h-24 items-center justify-center gap-2 text-sm font-bold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />불러오는 중</div> : <>
        <KpiField actual={kpi.actualContacts} disabled={!canManage} label="컨택 목표" onChange={(value) => setForm((current) => ({ ...current, targetContacts: value }))} value={form.targetContacts} />
        <KpiField actual={kpi.actualQuotes} disabled={!canManage} label="견적 목표" onChange={(value) => setForm((current) => ({ ...current, targetQuotes: value }))} value={form.targetQuotes} />
        <KpiField actual={kpi.actualConversions} disabled={!canManage} label="거래처 전환 목표" onChange={(value) => setForm((current) => ({ ...current, targetConversions: value }))} value={form.targetConversions} />
      </>}
    </div>
    <div className="flex flex-col gap-3 border-t border-teal-100 bg-teal-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><p aria-live="polite" className="text-xs font-bold text-slate-600">{message || `${kpi.periodMonth || "이번 달"} 기준 · 0은 목표 미설정`}</p>{canManage ? <Button className="h-11 font-black" disabled={loading || saving} onClick={() => void save()} type="button">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? "저장 중" : "KPI 목표 저장"}</Button> : null}</div>
  </section>;
}

function KpiField({ actual, disabled, label, onChange, value }: { actual: number; disabled: boolean; label: string; onChange: (value: number) => void; value: number }) {
  const rate = value > 0 ? Math.min(100, Math.round((actual / value) * 100)) : 0;
  return <label className="rounded-xl border border-slate-200 bg-white p-3"><span className="text-xs font-black text-slate-600">{label}</span><input className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-lg font-black outline-none focus:border-teal-400" disabled={disabled} min={0} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} type="number" value={value} /><span className="mt-2 block text-xs font-bold text-slate-500">현재 {actual.toLocaleString()}건 · 달성률 {rate}%</span><span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-teal-600" style={{ width: `${rate}%` }} /></span></label>;
}

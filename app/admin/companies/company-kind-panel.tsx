"use client";
import { useState } from "react";
import type { CompanyKind } from "@/lib/store";

export const KIND_LABEL: Record<CompanyKind, string> = { customer: "고객사", pilot: "파일럿", internal: "내부(본사)" };
const KIND_HELP: Record<CompanyKind, string> = { customer: "운영 지표·결제·알림에 모두 포함됩니다.", pilot: "지표에는 포함하고 결제는 면제로 따로 봅니다.", internal: "고객사 지표·결제·휴면/온보딩 알림에서 제외합니다." };

// CC-22b: 회사 구분 변경(확인 대화상자 + 감사 기록은 서버). MAJU 관리자 화면 전용.
export function CompanyKindPanel({ companyId, companyName, kind, onChanged }: { companyId: string; companyName: string; kind: CompanyKind; onChanged: (kind: CompanyKind) => void }) {
  const [next, setNext] = useState<CompanyKind>(kind);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    if (next === kind || !window.confirm(`"${companyName}"의 구분을 ${KIND_LABEL[kind]} → ${KIND_LABEL[next]}(으)로 바꿀까요?\n${KIND_HELP[next]}\n변경 기록이 감사 로그에 남습니다.`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/companies/kind", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, kind: next }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "구분을 바꾸지 못했습니다.");
      onChanged(next); setMessage("구분을 바꿨습니다.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "구분을 바꾸지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3" key={`${companyId}-${kind}`}>
    <label className="text-xs font-black text-slate-600">회사 구분
      <select className="mt-1 block h-11 rounded-md border border-slate-300 bg-white px-2 text-sm font-bold text-slate-900" onChange={(e) => setNext(e.target.value as CompanyKind)} value={next}>
        {(Object.keys(KIND_LABEL) as CompanyKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
      </select>
    </label>
    <button className="min-h-[44px] rounded-md border border-slate-300 bg-white px-4 text-sm font-black disabled:opacity-50" disabled={busy || next === kind} onClick={() => void save()} type="button">구분 변경</button>
    <p className="min-w-[200px] flex-1 text-xs text-slate-600">{KIND_HELP[next]}{message ? <span className="ml-2 font-black text-teal-800" role="status">{message}</span> : null}</p>
  </div>;
}

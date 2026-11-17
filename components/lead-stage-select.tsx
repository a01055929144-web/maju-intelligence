"use client";

// 리드 상태를 언제든 직접 바꾸는 선택 상자(2026-10-25). 바꾸면 연락 내역에 "상태 변경"으로 남습니다.
// 거절(고객이 거절한 영업 결과)·제외(우리가 영업 대상에서 뺀 것)는 사유를 고른 뒤 저장합니다. 제외는 기존 exclude 행동, 거절은 상태 변경 행동(CC-50).

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { isSelectableLeadStatus, LEAD_STAGE_OPTIONS, LEAD_STAGE_REASONS, leadStageLabel, toLeadStageValue } from "@/domains/lead/lead-status";
import type { PermitLeadItem } from "@/lib/store";
import type { PermitLeadActionKind, PermitLeadActionResult } from "@/components/sales-route-map-workspace";

export function LeadStageSelect({
  compact = false,
  lead,
  onAction
}: {
  readonly compact?: boolean;
  readonly lead: PermitLeadItem;
  readonly onAction: (lead: PermitLeadItem, actionType: PermitLeadActionKind, result?: string, memo?: string, followUpAt?: string) => Promise<PermitLeadActionResult>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const [reason, setReason] = useState("");
  const current = toLeadStageValue(lead.status);
  const isKnown = isSelectableLeadStatus(current);

  async function save(next: string, chosenReason = "") {
    setSaving(true);
    setError("");
    try {
      const memo = `상태 변경: ${leadStageLabel(lead.status)} → ${leadStageLabel(next)}${chosenReason ? ` · 사유: ${chosenReason}` : ""}`;
      const saved = next === "제외" ? await onAction(lead, "exclude", "제외", memo) : await onAction(lead, "status", next, memo);
      if (!saved.ok) setError(saved.message || "상태를 바꾸지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function change(next: string) {
    if (!next || next === current) return;
    // 거절·제외는 사유(선택)를 받은 뒤 저장한다. 나머지 단계는 바로 저장.
    if (LEAD_STAGE_REASONS[next]) {
      setPending(next);
      setReason("");
      return;
    }
    void save(next);
  }

  async function confirmPending() {
    const next = pending;
    setPending("");
    await save(next, reason);
  }

  return (
    <label className="flex items-center gap-2 text-[11px] font-black text-slate-600" onClick={(event) => event.stopPropagation()}>
      {compact ? <span className="sr-only">상태</span> : "상태"}
      <select
        aria-label="리드 상태 바꾸기"
        className={`${compact ? "min-h-11 max-w-[140px] rounded-lg bg-slate-100 px-3 text-xs" : "min-h-11 rounded-lg bg-white px-3 text-xs"} border border-slate-200 font-bold text-slate-900 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 disabled:opacity-60`}
        title="상태 바꾸기"
        disabled={saving}
        onChange={(event) => change(event.target.value)}
        value={pending || (isKnown ? current : "")}
      >
        {!isKnown ? <option value="">{lead.status || "선택"}</option> : null}
        {LEAD_STAGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {pending ? (
        <span className="flex flex-wrap items-center gap-1.5">
          <select aria-label={`${leadStageLabel(pending)} 사유`} className="min-h-11 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-900" onChange={(event) => setReason(event.target.value)} value={reason}>
            <option value="">사유 선택(선택)</option>
            {LEAD_STAGE_REASONS[pending].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button className="min-h-11 rounded-lg bg-teal-700 px-3 text-xs font-black text-white" disabled={saving} onClick={() => void confirmPending()} type="button">{leadStageLabel(pending)}로 저장</button>
          <button className="min-h-11 rounded-lg px-2 text-xs font-bold text-slate-500" onClick={() => setPending("")} type="button">취소</button>
        </span>
      ) : null}
      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : null}
      {error ? <span className={`font-bold text-red-700 ${compact ? "sr-only" : ""}`} role="alert">{error}</span> : null}
    </label>
  );
}

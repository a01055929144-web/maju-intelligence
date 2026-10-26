"use client";

// 리드 상태를 언제든 직접 바꾸는 선택 상자(2026-10-25). 바꾸면 연락 내역에 "상태 변경"으로 남습니다.
// "거절·제외"는 기존 제외 동작(목록에서 빠짐)을 그대로 씁니다.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { LEAD_STAGE_OPTIONS, leadStageLabel, toLeadStageValue } from "@/domains/lead/lead-status";
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
  const current = toLeadStageValue(lead.status);
  const isKnown = LEAD_STAGE_OPTIONS.some((option) => option.value === current);

  async function change(next: string) {
    if (!next || next === current) return;
    setSaving(true);
    setError("");
    try {
      const memo = `상태 변경: ${leadStageLabel(lead.status)} → ${leadStageLabel(next)}`;
      const saved = next === "제외" ? await onAction(lead, "exclude", "제외", memo) : await onAction(lead, "status", next, memo);
      if (!saved.ok) setError(saved.message || "상태를 바꾸지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="flex items-center gap-2 text-[11px] font-black text-slate-600" onClick={(event) => event.stopPropagation()}>
      {compact ? <span className="sr-only">상태</span> : "상태"}
      <select
        aria-label="리드 상태 바꾸기"
        className={`${compact ? "min-h-11 max-w-[140px] rounded-lg bg-slate-100 px-3 text-xs" : "min-h-11 rounded-lg bg-white px-3 text-xs"} border border-slate-200 font-bold text-slate-900 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 disabled:opacity-60`}
        title="상태 바꾸기"
        disabled={saving}
        onChange={(event) => void change(event.target.value)}
        value={isKnown ? current : ""}
      >
        {!isKnown ? <option value="">{lead.status || "선택"}</option> : null}
        {LEAD_STAGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : null}
      {error ? <span className={`font-bold text-red-700 ${compact ? "sr-only" : ""}`} role="alert">{error}</span> : null}
    </label>
  );
}

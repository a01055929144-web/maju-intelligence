"use client";

import { useState } from "react";

const statusLabels: Record<string, string> = {
  today: "오늘 추천",
  "this-week": "이번주 추천",
  reviewing: "검토중",
  "visit-planned": "방문 예정",
  "high-probability": "계약 가능",
  excluded: "제외"
};

export function LeadStatusSelect({ leadId, value, companyId }: { leadId: string; value: string; companyId?: string }) {
  const [status, setStatus] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function update(nextStatus: string) {
    const previousStatus = status;
    setStatus(nextStatus);
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/leads/${leadId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, companyId })
      });
      if (!response.ok) {
        setStatus(previousStatus);
        setError("저장 실패");
      }
    } catch {
      setStatus(previousStatus);
      setError("저장 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="block">
      <span className="sr-only">리드 상태</span>
      <select
        className="h-9 w-full rounded-md border border-input bg-white px-2 text-xs font-bold outline-none focus:ring-2 focus:ring-ring"
        value={status}
        onChange={(event) => update(event.target.value)}
      >
        {Object.entries(statusLabels).map(([key, label]) => (
          <option key={key} value={key}>
            {saving && key === status ? "저장 중..." : label}
          </option>
        ))}
      </select>
      {error ? <span className="mt-1 block text-[11px] font-bold text-rose-600">{error}</span> : null}
    </label>
  );
}

export function getLeadStatusLabel(status: string) {
  return statusLabels[status] || status;
}

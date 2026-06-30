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

export function LeadStatusSelect({ leadId, value }: { leadId: string; value: string }) {
  const [status, setStatus] = useState(value);
  const [saving, setSaving] = useState(false);

  async function update(nextStatus: string) {
    setStatus(nextStatus);
    setSaving(true);
    await fetch(`/api/leads/${leadId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus })
    }).catch(() => null);
    setSaving(false);
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
    </label>
  );
}

export function getLeadStatusLabel(status: string) {
  return statusLabels[status] || status;
}

"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const resultLabels = {
  visited: "방문 완료",
  interested: "관심 있음",
  "quote-requested": "견적 요청",
  pending: "보류",
  failed: "실패"
};

export function VisitResultForm({ expectedRevenue, leadId }: { expectedRevenue: number; leadId: string }) {
  const [result, setResult] = useState("visited");
  const [memo, setMemo] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setSaving(true);
    setSaved(false);
    setError("");

    try {
      const response = await fetch("/api/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevenue,
          leadId,
          memo,
          nextAction: result === "quote-requested" ? "견적서 발송" : result === "interested" ? "재방문 일정 조율" : "",
          result
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "방문 결과 저장에 실패했습니다.");
      setSaved(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "방문 결과 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-[130px_1fr_96px]">
        <select
          className="h-9 rounded-md border border-input bg-white px-2 text-xs font-bold outline-none focus:ring-2 focus:ring-ring"
          value={result}
          onChange={(event) => setResult(event.target.value)}
        >
          {Object.entries(resultLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <input
          className="h-9 rounded-md border border-input bg-white px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
          placeholder="방문 메모"
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
        />
        <Button size="sm" onClick={submit} disabled={saving}>
          <CheckCircle2 className="h-4 w-4" />
          {saved ? "저장됨" : "저장"}
        </Button>
      </div>
      {error ? (
        <p className="mt-1.5 flex items-center gap-1 text-xs font-bold text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}


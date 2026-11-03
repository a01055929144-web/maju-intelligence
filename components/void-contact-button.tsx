"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** 컨택 기록 취소(삭제 아님). 취소하면 목록에서 빠지고 리드의 최근 연락이 다시 계산됩니다. */
export function VoidContactButton({ actionId, companyId }: { actionId: string; companyId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run() {
    const reason = window.prompt("이 컨택 기록을 취소할까요? 취소 사유를 적어 주세요.", "잘못 기록");
    if (reason === null) return;
    setBusy(true);
    const response = await fetch("/api/leads/actions/void", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionId, companyId, reason })
    }).catch(() => null);
    const payload = response ? ((await response.json().catch(() => null)) as { message?: string } | null) : null;
    setBusy(false);
    if (!response?.ok) {
      window.alert(payload?.message || "기록을 취소하지 못했습니다.");
      return;
    }
    router.refresh();
  }
  return (
    <button className="h-8 rounded-md border border-rose-200 px-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50" disabled={busy} onClick={() => void run()} type="button">
      {busy ? "취소 중" : "기록 취소"}
    </button>
  );
}

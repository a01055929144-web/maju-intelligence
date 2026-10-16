"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SalesQuoteAcceptButton({
  mode = "accept",
  onCompleted,
  quoteId
}: {
  mode?: "accept" | "apply";
  onCompleted?: () => Promise<void> | void;
  quoteId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const accept = async () => {
    const confirmation = mode === "apply"
      ? "수락된 견적의 계약 단가를 다시 반영할까요?"
      : "이 견적을 수락 처리하고 연결된 표준 품목을 거래처 계약 단가로 반영할까요?";
    if (!window.confirm(confirmation)) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/sales-quotes/${encodeURIComponent(quoteId)}/accept`, { method: "POST" });
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message || "수락 처리에 실패했습니다.");
      setMessage(payload?.message || "수락 처리했습니다.");
      await onCompleted?.();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "수락 처리에 실패했습니다.");
    } finally {
      setPending(false);
    }
  };
  return <span className="inline-flex flex-col items-end gap-1"><button className="maju-button-primary min-h-9 justify-center" disabled={pending} onClick={accept} type="button">{pending ? "처리 중" : mode === "apply" ? "계약 단가 반영" : "수락 처리"}</button>{message ? <span aria-live="polite" className="max-w-52 text-right text-[11px] font-semibold text-slate-500">{message}</span> : null}</span>;
}

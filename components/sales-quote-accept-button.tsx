"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SalesQuoteAcceptButton({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const accept = async () => {
    if (!window.confirm("이 견적을 수락 처리하고 연결된 표준 품목을 거래처 계약 단가로 반영할까요?")) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/sales-quotes/${encodeURIComponent(quoteId)}/accept`, { method: "POST" });
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message || "수락 처리에 실패했습니다.");
      setMessage(payload?.message || "수락 처리했습니다.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "수락 처리에 실패했습니다.");
    } finally {
      setPending(false);
    }
  };
  return <span className="inline-flex flex-col items-end gap-1"><button className="maju-button-primary min-h-9 justify-center" disabled={pending} onClick={accept} type="button">{pending ? "처리 중" : "수락 처리"}</button>{message ? <span className="max-w-52 text-right text-[11px] font-semibold text-slate-500">{message}</span> : null}</span>;
}

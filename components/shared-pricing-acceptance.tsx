"use client";

import { useRef, useState } from "react";
import type { PricingAcceptanceResult } from "@/domains/pricing/acceptance-order-link";
import { Button } from "./ui/button";

export function SharedPricingAcceptance({ token, kind }: { token: string; kind: "sheet" | "quote" }) {
  const key = useRef<string | null>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<PricingAcceptanceResult | null>(null);
  const [message, setMessage] = useState("");
  async function accept() {
    if (!confirmed || pending.current || result) return;
    pending.current = true; setBusy(true); setMessage("");
    try {
      key.current ||= crypto.randomUUID();
      const response = await fetch("/api/pricing-document-acceptance", { method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shareToken: token, idempotencyKey: key.current }) });
      const data = await response.json() as PricingAcceptanceResult & { message?: string };
      if (!response.ok) throw new Error(data.message || "수락하지 못했습니다. 다시 시도하거나 담당자에게 문의해 주세요.");
      if (typeof data.needsReview !== "boolean" || typeof data.orderEnabled !== "boolean" || !data.documentVersionId)
        throw new Error("수락 결과를 확인하지 못했습니다. 같은 화면에서 다시 시도해 주세요.");
      setResult(data);
    } catch (error) { setMessage(error instanceof Error ? error.message : "수락하지 못했습니다. 다시 시도해 주세요."); }
    finally { pending.current = false; setBusy(false); }
  }
  const orderToken = result?.orderEnabled && !result.needsReview && !result.orderSetupRequired &&
    typeof result.storefrontToken === "string" && /^[A-Za-z0-9._~-]{1,300}$/.test(result.storefrontToken) ? result.storefrontToken : null;
  return <section className="space-y-3 rounded border p-4" aria-label="문서 수락">
    {result ? <>
      <p role="status">{result.needsReview ? "확인이 필요한 요청으로 접수됐습니다. 담당자에게 확인을 요청해 주세요."
        : result.orderSetupRequired ? "수락이 완료됐습니다. 주문 설정을 담당자에게 요청해 주세요."
        : orderToken ? "수락이 완료됐습니다. 주문 화면에서 품목을 확인해 주세요."
        : "수락이 완료됐습니다. 주문 가능 여부는 담당자에게 문의해 주세요."}</p>
      {orderToken && <a className="inline-flex min-h-[44px] items-center underline" href={`/store#${encodeURIComponent(orderToken)}`}>주문 화면 열기</a>}
    </> : <>
      <label className="flex min-h-[44px] items-center gap-2"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />{kind === "quote" ? "견적" : "단가표"} 내용을 확인했으며 수락을 요청합니다.</label>
      <p className="text-sm">수락은 주문 생성이 아닙니다. 확인이 필요한 경우 담당자 검토 후 안내합니다.</p>
      {message && <p role="status">{message}</p>}
      <Button className="min-h-[44px]" disabled={!confirmed || busy} onClick={() => void accept()}>{busy ? "수락 확인 중" : message ? "수락 다시 시도" : "문서 수락 요청"}</Button>
    </>}
  </section>;
}

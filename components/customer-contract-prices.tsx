"use client";

import { useCallback, useEffect, useState } from "react";
import { SalesQuoteAcceptButton } from "@/components/sales-quote-accept-button";
import type { CustomerContractPrice, PendingAcceptedQuote } from "@/lib/store";

export function CustomerContractPrices({ customerId }: { customerId: string }) {
  const [items, setItems] = useState<CustomerContractPrice[]>([]);
  const [pendingQuotes, setPendingQuotes] = useState<PendingAcceptedQuote[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch(`/api/customers/${encodeURIComponent(customerId)}/contract-prices`, {
        cache: "no-store"
      });
      const payload = await response.json() as {
        agreements?: CustomerContractPrice[];
        message?: string;
        pendingQuotes?: PendingAcceptedQuote[];
      };
      if (!response.ok) throw new Error(payload.message || "계약 단가 조회 실패");
      setItems(payload.agreements || []);
      setPendingQuotes(payload.pendingQuotes || []);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const close = async (id: string, mode: "cancel" | "end") => {
    const response = await fetch(`/api/customers/${encodeURIComponent(customerId)}/contract-prices`, {
      body: JSON.stringify({ agreementId: id, mode }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
    });
    if (response.ok) await load();
  };

  if (status === "loading") {
    return <p className="mt-3 text-sm font-medium text-slate-500">계약 단가를 불러오는 중입니다.</p>;
  }
  if (status === "error") {
    return <button className="maju-button-secondary mt-3" onClick={() => void load()} type="button">조회 재시도</button>;
  }

  return (
    <div className="mt-3 space-y-3">
      {pendingQuotes.length ? (
        <section aria-label="미반영 수락 견적" className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-950">수락됐지만 단가 미반영 견적 {pendingQuotes.length}건</p>
          <p className="mt-1 text-xs font-medium text-amber-800">견적별 반영 버튼을 누르면 계약 단가를 다시 적용합니다.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {pendingQuotes.map((quote) => (
              <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-amber-200" key={quote.id}>
                <span className="font-mono text-xs font-semibold text-slate-600">{quote.quoteNumber}</span>
                <SalesQuoteAcceptButton mode="apply" onCompleted={load} quoteId={quote.id} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!items.length ? (
        <p className="rounded-xl bg-slate-50 p-4 text-sm font-medium text-slate-500">수락된 견적에서 반영된 계약 단가가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="py-2">품목코드·품목</th><th>단위</th><th className="text-right">계약 단가</th><th>과세</th><th>적용 기간</th><th>근거</th><th />
              </tr>
            </thead>
            <tbody>{items.map((item) => (
              <tr className="border-b border-slate-100" key={item.id}>
                <td className="py-3 font-semibold">{item.productCode || "코드 미정"} · {item.productName}</td>
                <td>{item.salesUnit}</td>
                <td className="text-right font-bold">{item.unitPrice.toLocaleString()}원</td>
                <td>{item.taxType === "taxable" ? "과세" : "면세"}</td>
                <td>{item.effectiveFrom} ~ {item.effectiveUntil || "현재"}</td>
                <td>{item.sourceQuoteId ? "견적" : "수동"}</td>
                <td className="text-right">{item.status === "active" ? (
                  <span className="inline-flex gap-1">
                    <button className="text-xs font-bold text-slate-600" onClick={() => void close(item.id, "end")} type="button">종료</button>
                    <button className="text-xs font-bold text-rose-600" onClick={() => void close(item.id, "cancel")} type="button">취소</button>
                  </span>
                ) : <span className="text-xs text-slate-400">{item.status === "ended" ? "종료" : "취소"}</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

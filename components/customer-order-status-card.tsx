"use client";

import { useEffect, useState } from "react";

type Status = { orderable: boolean; headline: string; message: string };

/** CX-145 P1-3: 거래처 상세 — 이 매장이 왜 주문이 안 되는지(고객사가 고칠 수 있는 설정 안내). 확인할 수 없으면 아무것도 그리지 않는다. */
export function CustomerOrderStatusCard({ customerId }: { customerId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    let live = true;
    setStatus(null);
    fetch(`/api/customers/${encodeURIComponent(customerId)}/order-status`, { cache: "no-store" })
      .then(async response => response.ok ? await response.json() as Status : null).then(next => { if (live) setStatus(next); }).catch(() => undefined);
    return () => { live = false; };
  }, [customerId]);
  if (!status) return null;
  return <section aria-label="매장 주문 가능 여부" className={`mt-4 rounded-lg border p-3 text-sm ${status.orderable ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
    <p className="font-semibold" data-testid="order-status-headline">{status.orderable ? "매장 주문: 가능" : `매장 주문 불가 — ${status.headline}`}</p>
    {status.message ? <p className="mt-1">{status.message}</p> : null}
  </section>;
}

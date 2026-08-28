"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

type ChurnRiskCustomer = {
  customerId: string;
  customerName: string;
  address?: string;
  daysSinceLastOrder: number;
  lastOrderDate: string;
  monthlyRevenue: number;
  region?: string;
};

function getDismissalStorageKey(companyId?: string) {
  return `maju-churn-alert-dismissed:${companyId || "default"}`;
}

function readDismissedIds(companyId?: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getDismissalStorageKey(companyId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { date?: string; ids?: string[] };
    const today = new Date().toISOString().slice(0, 10);
    if (parsed.date !== today || !Array.isArray(parsed.ids)) return [];
    return parsed.ids;
  } catch {
    return [];
  }
}

function writeDismissedIds(companyId: string | undefined, ids: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getDismissalStorageKey(companyId), JSON.stringify({ date: new Date().toISOString().slice(0, 10), ids }));
  } catch {
    // localStorage unavailable — dismissal simply won't persist across navigation
  }
}

export function ChurnRiskAlert({
  companyId,
  initialCustomers,
  timelineHref
}: {
  companyId?: string;
  /** 2026-08-24 피드백: "전반적으로 속도가 더뎌, 빠른 속도가 중요할 것 같아" — 지도 홈 서버 컴포넌트가
   * 이미 같은 이탈 위험 거래처 목록을 계산해뒀는데, 이 컴포넌트가 마운트되자마자 똑같은 API를
   * 다시 호출해 왕복이 하나 더 생기고 있었습니다. 서버에서 미리 계산한 값을 받으면 그걸 그대로
   * 쓰고, 없을 때만(예: 별도 화면에서 이 컴포넌트만 단독으로 쓰는 경우) 기존처럼 직접 불러옵니다. */
  initialCustomers?: ChurnRiskCustomer[];
  timelineHref: string;
}) {
  const [customers, setCustomers] = useState<ChurnRiskCustomer[]>(initialCustomers || []);
  const [dismissed, setDismissed] = useState(false);
  const [loaded, setLoaded] = useState(Boolean(initialCustomers));

  useEffect(() => {
    function applyDismissedState(list: ChurnRiskCustomer[]) {
      const dismissedIds = new Set(readDismissedIds(companyId));
      const stillAllDismissed = list.length > 0 && list.every((customer) => dismissedIds.has(customer.customerId));
      setDismissed(stillAllDismissed);
    }

    if (initialCustomers) {
      applyDismissedState(initialCustomers);
      setLoaded(true);
      return;
    }

    let mounted = true;
    const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";

    fetch(`/api/customer/churn-risk${query}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!mounted || !Array.isArray(payload?.customers)) return;
        const fetchedCustomers = payload.customers as ChurnRiskCustomer[];
        setCustomers(fetchedCustomers);
        applyDismissedState(fetchedCustomers);
      })
      .catch(() => null)
      .finally(() => {
        if (mounted) setLoaded(true);
      });

    return () => {
      mounted = false;
    };
  }, [companyId, initialCustomers]);

  if (!loaded || dismissed || !customers.length) return null;

  const topCustomers = customers.slice(0, 3);

  function handleDismiss() {
    setDismissed(true);
    writeDismissedIds(
      companyId,
      customers.map((customer) => customer.customerId)
    );
  }

  return (
    <div className="w-full max-w-[360px]">
      <div className="overflow-hidden rounded-xl border border-rose-200 bg-white shadow-[0_12px_28px_rgba(190,18,60,0.16)]">
        <div className="flex items-start justify-between gap-2 bg-rose-50 px-3 py-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" />
            <div>
              <p className="text-xs font-black text-rose-900">이탈 위험 거래처 {customers.length}곳</p>
              <p className="mt-0.5 text-[11px] font-bold text-rose-700">21일 이상 매출 없음 · 방문 우선 추천</p>
            </div>
          </div>
          <button aria-label="알림 닫기" className="maju-hit-slop shrink-0 p-1 text-rose-400 transition hover:text-rose-700" onClick={handleDismiss} type="button">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-1.5 p-2.5">
          {topCustomers.map((customer) => (
            <div className="rounded-md border border-slate-100 bg-slate-50/70 px-2.5 py-2" key={customer.customerId}>
              <p className="truncate text-xs font-black text-slate-950">{customer.customerName}</p>
              <p className="mt-0.5 truncate text-[11px] font-bold text-slate-500">
                {customer.region || "지역 미확인"} · {customer.daysSinceLastOrder}일 경과
              </p>
            </div>
          ))}
        </div>
        <Link className="flex items-center justify-center gap-1 border-t border-slate-100 py-2 text-[11px] font-black text-rose-700 transition hover:bg-rose-50" href={timelineHref}>
          거래처 관리에서 전체 확인
        </Link>
      </div>
    </div>
  );
}

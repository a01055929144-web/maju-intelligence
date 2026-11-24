"use client";

import { useEffect, useState } from "react";

// CX-141 C: 매장의 "최근 활동"(마지막 접속 + 최근 20건). 기능을 켜지 않은 회사는 아무것도 보이지 않는다.
type Data = { lastSeenAt: string | null; events: Array<{ kind: string; occurredAt: string }> };
const LABEL: Record<string, string> = { home: "홈 열기", document: "문서 열람", catalog: "전체 상품 열기", search: "상품 검색", cart: "장바구니", order: "주문" };
const when = (value: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" }).format(new Date(value));

export function StoreActivityList({ companyId, storeAccountId }: { companyId: string; storeAccountId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<"loading" | "off" | "error" | "ready">("loading");
  useEffect(() => {
    let alive = true;
    fetch(`/api/store-activity?companyId=${encodeURIComponent(companyId)}&storeAccountId=${encodeURIComponent(storeAccountId)}`)
      .then(async response => {
        if (!alive) return;
        if (response.status === 404) return setState("off");
        if (!response.ok) return setState("error");
        setData(await response.json() as Data); setState("ready");
      }).catch(() => alive && setState("error"));
    return () => { alive = false; };
  }, [companyId, storeAccountId]);
  if (state === "off" || state === "loading") return null;
  if (state === "error") return <p role="alert" className="text-xs font-bold text-rose-700">최근 활동을 불러오지 못했습니다.</p>;
  return <section aria-label="최근 활동" className="rounded-lg bg-slate-50 p-3">
    <p className="text-xs font-black text-slate-700">최근 활동 · 마지막 접속 {data?.lastSeenAt ? when(data.lastSeenAt) : "아직 없음"}</p>
    {data?.events.length ? <ul className="mt-1 space-y-0.5 text-xs font-semibold text-slate-600">
      {data.events.map((event, index) => <li key={`${event.occurredAt}-${index}`}>{when(event.occurredAt)} · {LABEL[event.kind] ?? event.kind}</li>)}</ul>
      : <p className="mt-1 text-xs font-semibold text-slate-500">기록된 활동이 없습니다.</p>}
  </section>;
}

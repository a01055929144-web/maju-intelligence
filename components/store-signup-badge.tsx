"use client";

import { useEffect, useState } from "react";

// CX-142 2차: 리드 표·지도·대시보드가 함께 쓰는 "가입 · 첫 주문 전" 표시. 응답은 모듈 안에서 60초 공유한다(카드마다 호출하지 않음).
export type StoreSignupState = "signed_up" | "ordering";
type Status = { newCount: number; leads: Record<string, StoreSignupState> };
let cached: { at: number; value: Status | null } | null = null;
let inflight: Promise<Status | null> | null = null;

function load(companyId?: string): Promise<Status | null> {
  if (cached && Date.now() - cached.at < 60000) return Promise.resolve(cached.value);
  inflight ??= fetch(`/api/store-signups${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ""}`, { cache: "no-store" })
    .then(async response => response.ok ? await response.json() as Status : null)
    .catch(() => null)
    .then(value => { cached = { at: Date.now(), value }; inflight = null; return value; });
  return inflight;
}

/** 기능이 꺼진 회사는 null(아무것도 표시·필터하지 않음). */
export function useStoreSignupStatus(companyId?: string) {
  const [status, setStatus] = useState<Status | null>(cached?.value ?? null);
  useEffect(() => { let alive = true; void load(companyId).then(value => { if (alive) setStatus(value); }); return () => { alive = false; }; }, [companyId]);
  return status;
}

export const STORE_SIGNUP_LABEL: Record<StoreSignupState, string> = { signed_up: "가입 · 첫 주문 전", ordering: "주문 시작" };

export function StoreSignupBadge({ state }: { state?: StoreSignupState }) {
  if (!state) return null;
  return <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-black ring-1 ring-inset ${state === "signed_up" ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"}`}>{STORE_SIGNUP_LABEL[state]}</span>;
}

/** 대시보드 카드: 최근 7일에 가입했고 아직 주문이 없는 매장 수. 기능이 꺼져 있으면 보이지 않는다. */
export function NewSignupsCard({ companyId }: { companyId?: string }) {
  const status = useStoreSignupStatus(companyId);
  if (!status) return null;
  return <p className="mb-2 inline-flex min-h-11 items-center rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-black text-amber-950" role="status">
    새로 가입한 매장 {status.newCount}곳 <span className="ml-2 text-xs font-semibold text-amber-800">최근 7일 · 첫 주문 전</span></p>;
}

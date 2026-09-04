"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Banknote, CheckCircle2, CreditCard, Loader2, PauseCircle, PlayCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SortableTh } from "@/components/sortable-th";
import { useTableSort } from "@/lib/use-table-sort";

// 2026-09-01: "결제프로그램도 추가해서 넣고 싶어" — 고객사가 마주 인텔리전스 이용료를 매달 카드로
// 자동결제(빌링)하는 화면입니다. 토스페이먼츠 카드 등록 위젯은 클라이언트 SDK가 필요해 이 파일
// 전체가 클라이언트 컴포넌트입니다(app/revenue/billing/page.tsx가 서버 컴포넌트에서 이 컴포넌트만
// 렌더링합니다 — pipeline-candidates-table.tsx와 같은 안전한 구조).
//
// 사용자 확정: "매달 자동결제는 일시불로만" — 토스 자동결제(빌링) API에는 할부 파라미터가 없어
// (공식 문서 확인) 할부 옵션은 이 화면에 아예 없습니다.

type Subscription = {
  id: string;
  companyId: string;
  tossCustomerKey: string;
  billingKey: string | null;
  cardIssuerCode: string | null;
  cardNumberMasked: string | null;
  planAmountWon: number;
  status: "pending_card" | "active" | "paused" | "canceled";
  nextBillingDate: string | null;
  lastPaymentStatus: string | null;
  lastPaymentAt: string | null;
  lastPaymentMessage: string | null;
};

type SubscriptionPayment = {
  id: string;
  orderId: string;
  amount: number;
  status: "succeeded" | "failed";
  method: string | null;
  cardNumberMasked: string | null;
  receiptUrl: string | null;
  failureMessage: string | null;
  billedAt: string;
};

type BillingStatusResponse = {
  configured: boolean;
  clientKey: string;
  subscription: Subscription;
  payments: SubscriptionPayment[];
};

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => {
      payment: (input: { customerKey: string }) => {
        requestBillingAuth: (input: {
          method: "CARD";
          successUrl: string;
          failUrl: string;
          customerName?: string;
          customerEmail?: string;
        }) => Promise<void>;
      };
    };
  }
}

let tossScriptPromise: Promise<void> | null = null;

function loadTossSdk(): Promise<void> {
  if (window.TossPayments) return Promise.resolve();
  if (tossScriptPromise) return tossScriptPromise;

  tossScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById("toss-payments-sdk") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("토스페이먼츠 SDK 로드에 실패했습니다.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "toss-payments-sdk";
    script.src = "https://js.tosspayments.com/v2/standard";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("토스페이먼츠 SDK 로드에 실패했습니다."));
    document.head.appendChild(script);
  }).catch((error) => {
    tossScriptPromise = null;
    throw error;
  });

  return tossScriptPromise;
}

const statusLabels: Record<Subscription["status"], string> = {
  pending_card: "카드 미등록",
  active: "정상 청구중",
  paused: "일시중지",
  canceled: "해지됨"
};

const statusTone: Record<Subscription["status"], string> = {
  pending_card: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-100",
  active: "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-100",
  paused: "bg-slate-100 text-slate-700",
  canceled: "bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-100"
};

export function BillingWorkspace({ companyId, customerEmail, customerName }: { readonly companyId: string; readonly customerEmail?: string; readonly customerName?: string }) {
  const [data, setData] = useState<BillingStatusResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [banner, setBanner] = useState<{ tone: "success" | "fail"; message: string } | null>(null);
  const [registering, setRegistering] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoadError("");
    try {
      const response = await fetch(`/api/billing/status?companyId=${encodeURIComponent(companyId)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message || "결제 정보를 불러오지 못했습니다.");
      setData(body as BillingStatusResponse);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "결제 정보를 불러오지 못했습니다.");
    }
  }, [companyId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billingResult = params.get("billing");
    if (!billingResult) return;
    if (billingResult === "success") {
      setBanner({ tone: "success", message: "카드 등록이 완료되었습니다. 다음 청구일부터 자동결제가 시작됩니다." });
    } else {
      setBanner({ tone: "fail", message: params.get("message") || "카드 등록에 실패했습니다." });
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("billing");
    url.searchParams.delete("message");
    url.searchParams.delete("code");
    window.history.replaceState({}, "", url.toString());
  }, []);

  const handleRegisterCard = useCallback(async () => {
    if (!data) return;
    setActionError("");
    setRegistering(true);
    try {
      await loadTossSdk();
      if (!window.TossPayments) throw new Error("토스페이먼츠 SDK를 불러오지 못했습니다.");
      const origin = window.location.origin;
      const tossPayments = window.TossPayments(data.clientKey);
      const payment = tossPayments.payment({ customerKey: data.subscription.tossCustomerKey });
      await payment.requestBillingAuth({
        method: "CARD",
        successUrl: `${origin}/api/billing/callback`,
        failUrl: `${origin}/api/billing/callback`,
        customerName,
        customerEmail
      });
      // requestBillingAuth는 성공 시 브라우저를 successUrl로 이동시켜 이 지점 이후 코드는 보통
      // 실행되지 않습니다 — 사용자가 위젯 창을 직접 닫는 등 이동 없이 끝나는 경우에만 도달합니다.
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "카드 등록 창을 여는 중 오류가 발생했습니다.");
    } finally {
      setRegistering(false);
    }
  }, [customerEmail, customerName, data]);

  const handleStatusChange = useCallback(
    async (status: "active" | "paused" | "canceled") => {
      setActionError("");
      setStatusChanging(true);
      try {
        const response = await fetch("/api/billing/subscription", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, companyId })
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.message || "설정을 변경하지 못했습니다.");
        await loadStatus();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "설정을 변경하지 못했습니다.");
      } finally {
        setStatusChanging(false);
      }
    },
    [companyId, loadStatus]
  );

  if (loadError) {
    return (
      <div className="maju-filter-box border-amber-200 bg-amber-50 px-4 py-4 text-sm font-bold text-amber-900">{loadError}</div>
    );
  }

  if (!data) {
    return (
      <div className="maju-section-card flex items-center justify-center gap-2 p-10 text-sm font-bold text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        결제 정보를 불러오는 중입니다…
      </div>
    );
  }

  const { subscription, payments } = data;

  return (
    <div className="space-y-4">
      {banner ? (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold ${
            banner.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {banner.tone === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
          {banner.message}
        </div>
      ) : null}

      {!data.configured ? (
        <div className="maju-filter-box border-amber-200 bg-amber-50 px-4 py-4 text-sm font-bold text-amber-900">
          토스페이먼츠 연동 키(TOSS_SECRET_KEY / TOSS_CLIENT_KEY)가 아직 설정되지 않았습니다. Vercel 환경변수를 설정한 뒤 다시 시도해주세요.
        </div>
      ) : null}

      <div className="maju-section-card">
        <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="maju-section-title">자동결제 상태</p>
            <p className="mt-1 maju-muted-label">월 단위 카드 자동결제 · 항상 일시불</p>
          </div>
          <Badge className={statusTone[subscription.status]}>{statusLabels[subscription.status]}</Badge>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-3">
          <div>
            <p className="maju-muted-label">등록된 카드</p>
            <p className="mt-1 flex items-center gap-2 text-lg font-black text-slate-950">
              <CreditCard className="h-4 w-4 text-slate-400" />
              {subscription.cardNumberMasked || "미등록"}
            </p>
          </div>
          <div>
            <p className="maju-muted-label">월 이용료</p>
            <p className="mt-1 text-lg font-black text-slate-950">
              {subscription.planAmountWon > 0 ? `${subscription.planAmountWon.toLocaleString()}원` : "관리자 설정 대기"}
            </p>
          </div>
          <div>
            <p className="maju-muted-label">다음 청구일</p>
            <p className="mt-1 text-lg font-black text-slate-950">{subscription.nextBillingDate || "-"}</p>
          </div>
        </div>
        {subscription.lastPaymentStatus ? (
          <div className={`mx-4 mb-4 rounded-lg px-3 py-2 text-xs font-bold ${subscription.lastPaymentStatus === "succeeded" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
            최근 결제: {subscription.lastPaymentStatus === "succeeded" ? "성공" : `실패 (${subscription.lastPaymentMessage || "사유 미상"})`}
            {subscription.lastPaymentAt ? ` · ${new Date(subscription.lastPaymentAt).toLocaleString("ko-KR")}` : ""}
          </div>
        ) : null}

        {actionError ? <div className="mx-4 mb-4 rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">{actionError}</div> : null}

        <div className="flex flex-wrap gap-2 border-t border-slate-100 p-4">
          <button className="maju-button-primary" disabled={registering} onClick={handleRegisterCard} type="button">
            {registering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
            {subscription.billingKey ? "카드 변경" : "카드 등록"}
          </button>
          {subscription.billingKey && subscription.status !== "active" && subscription.status !== "canceled" ? (
            <button className="maju-button-secondary" disabled={statusChanging} onClick={() => handleStatusChange("active")} type="button">
              <PlayCircle className="h-3.5 w-3.5" />
              자동결제 재개
            </button>
          ) : null}
          {subscription.status === "active" ? (
            <button className="maju-button-secondary" disabled={statusChanging} onClick={() => handleStatusChange("paused")} type="button">
              <PauseCircle className="h-3.5 w-3.5" />
              일시중지
            </button>
          ) : null}
          {subscription.status !== "canceled" && subscription.billingKey ? (
            <button className="maju-button-secondary text-rose-700" disabled={statusChanging} onClick={() => handleStatusChange("canceled")} type="button">
              <XCircle className="h-3.5 w-3.5" />
              해지
            </button>
          ) : null}
        </div>
      </div>

      <PaymentHistoryTable payments={payments} />
    </div>
  );
}

type PaymentSortKey = "amount" | "billedAt" | "status";

function PaymentHistoryTable({ payments }: { readonly payments: SubscriptionPayment[] }) {
  const { sortDirection, sortKey, sortedRows, toggleSort } = useTableSort<SubscriptionPayment, PaymentSortKey>(payments, {
    amount: (a, b) => a.amount - b.amount,
    billedAt: (a, b) => new Date(a.billedAt).getTime() - new Date(b.billedAt).getTime(),
    status: (a, b) => a.status.localeCompare(b.status)
  });
  const totalSucceeded = useMemo(() => payments.filter((payment) => payment.status === "succeeded").reduce((sum, payment) => sum + payment.amount, 0), [payments]);

  return (
    <section className="maju-section-card">
      <div className="maju-card-header flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="maju-section-title">결제 이력</p>
          <p className="mt-1 maju-muted-label">청구 성공/실패 전체 기록</p>
        </div>
        <Badge className="bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">
          <Banknote className="mr-1 h-3 w-3" />
          누적 결제 {totalSucceeded.toLocaleString()}원
        </Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="text-left text-xs font-black text-slate-500">
              <SortableTh active={sortKey === "billedAt"} className="border-b border-slate-200 px-4 py-3" direction={sortDirection} label="청구일시" onClick={() => toggleSort("billedAt")} />
              <SortableTh active={sortKey === "status"} className="border-b border-slate-200 px-4 py-3" direction={sortDirection} label="결과" onClick={() => toggleSort("status")} />
              <SortableTh
                active={sortKey === "amount"}
                className="border-b border-slate-200 px-4 py-3 text-right"
                direction={sortDirection}
                label="금액"
                onClick={() => toggleSort("amount")}
              />
              <th className="border-b border-slate-200 px-4 py-3">카드</th>
              <th className="border-b border-slate-200 px-4 py-3">비고</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((payment) => (
              <tr key={payment.id} className="font-bold text-slate-800 odd:bg-white even:bg-slate-50/60">
                <td className="border-b border-slate-100 px-4 py-3 text-xs text-slate-600">{new Date(payment.billedAt).toLocaleString("ko-KR")}</td>
                <td className="border-b border-slate-100 px-4 py-3">
                  <Badge className={payment.status === "succeeded" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}>
                    {payment.status === "succeeded" ? "성공" : "실패"}
                  </Badge>
                </td>
                <td className="border-b border-slate-100 px-4 py-3 text-right text-slate-950">{payment.amount.toLocaleString()}원</td>
                <td className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">{payment.cardNumberMasked || "-"}</td>
                <td className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">
                  {payment.status === "failed" ? payment.failureMessage || "-" : payment.receiptUrl ? (
                    <a className="text-teal-700 underline" href={payment.receiptUrl} rel="noreferrer" target="_blank">
                      영수증
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
            {!payments.length ? (
              <tr>
                <td className="px-4 py-12 text-center text-sm font-bold text-slate-500" colSpan={5}>
                  아직 결제 이력이 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

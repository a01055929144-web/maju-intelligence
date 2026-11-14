"use client";
import { useEffect, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

// CC-47-6 저장 결과 알림: 화면 안에 붙는 문구형(Notice)과 잠깐 떴다 사라지는 토스트형(Toast) 2가지만.
// 성공 = 초록, 실패 = 빨강(+ onRetry가 있으면 "다시 시도"). 읽어 주는 곳은 한 곳: 성공 role="status", 실패 role="alert".
// 토스트는 화면 아래 가운데, 사라지는 시간은 모두 NOTICE_TOAST_MS.
export type NoticeKind = "success" | "error";
export const NOTICE_TOAST_MS = 6000;

const NOTICE_TONE: Record<NoticeKind, string> = {
  success: "border-teal-200 bg-teal-50 text-teal-900",
  error: "border-rose-200 bg-rose-50 text-rose-900"
};
const TOAST_TONE: Record<NoticeKind, string> = {
  success: "bg-emerald-600 shadow-[0_10px_30px_rgba(5,150,105,0.35)]",
  error: "bg-rose-600 shadow-[0_10px_30px_rgba(225,29,72,0.35)]"
};

function RetryButton({ className, label, onRetry }: { readonly className: string; readonly label: string; readonly onRetry: () => void }) {
  return (
    <button className={`inline-flex shrink-0 items-center gap-1 rounded-md font-black underline-offset-2 hover:underline max-sm:min-h-11 ${className}`} onClick={onRetry} type="button">
      <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

/** 화면 안에 붙는 문구형 알림. 실패에 onRetry를 주면 "다시 시도". */
export function Notice({ children, className = "", kind, onRetry, retryLabel = "다시 시도" }: { readonly kind: NoticeKind; readonly children: ReactNode; readonly onRetry?: () => void; readonly retryLabel?: string; readonly className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm font-bold ${NOTICE_TONE[kind]} ${className}`} role={kind === "error" ? "alert" : "status"}>
      <span className="min-w-0 flex-1">{children}</span>
      {kind === "error" && onRetry ? <RetryButton className="text-rose-800" label={retryLabel} onRetry={onRetry} /> : null}
    </div>
  );
}

/** 화면 아래 가운데에 잠깐 뜨는 토스트. onDismiss를 주면 NOTICE_TOAST_MS 뒤에 호출(부모가 이미 타이머를 쓰면 안 줘도 된다). */
export function Toast({ children, icon, kind = "success", onDismiss, onRetry, retryLabel = "다시 시도" }: { readonly children: ReactNode; readonly icon?: ReactNode; readonly kind?: NoticeKind; readonly onDismiss?: () => void; readonly onRetry?: () => void; readonly retryLabel?: string }) {
  useEffect(() => {
    if (!onDismiss) return;
    const timer = window.setTimeout(onDismiss, NOTICE_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div
        aria-atomic="true"
        aria-live={kind === "error" ? "assertive" : "polite"}
        className={`pointer-events-auto flex items-center gap-2.5 rounded-full px-5 py-3 text-sm font-semibold text-white ${TOAST_TONE[kind]}`}
        role={kind === "error" ? "alert" : "status"}
      >
        {icon}
        {children}
        {kind === "error" && onRetry ? <RetryButton className="text-white" label={retryLabel} onRetry={onRetry} /> : null}
      </div>
    </div>
  );
}

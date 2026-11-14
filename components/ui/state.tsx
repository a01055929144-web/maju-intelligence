import { Loader2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

// CC-47-5 화면 상태 3종: 불러오는 중 · 비어 있음(다음 행동 자리) · 오류(다시 시도). 문구는 쓰는 곳이 정한다.
// 기본은 점선 상자(.maju-empty-state). `bare`는 상자 없이 가운데 글자만 — 표 칸·이미 상자 안인 패널 안에서 쓴다.
// 예전 InlineLoading(components/inline-loading.tsx)은 LoadingState로 흡수했다.
type Common = { readonly className?: string; readonly bare?: boolean };
const box = (bare?: boolean) => (bare ? "text-center" : "maju-empty-state text-center");

/** 불러오는 중. description이 없으면 한 줄(스피너 + 문구), 있으면 가운데 정렬 두 줄. */
export function LoadingState({ bare, className = "", description, label = "불러오는 중입니다..." }: Common & { readonly label?: string; readonly description?: string }) {
  if (description) {
    return (
      <div aria-live="polite" className={`${box(bare)} ${className}`} role="status">
        <Loader2 aria-hidden="true" className="mx-auto h-5 w-5 animate-spin text-teal-700" />
        <p className="mt-3 text-sm font-black text-slate-700">{label}</p>
        <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{description}</p>
      </div>
    );
  }
  return (
    <p aria-live="polite" className={`${box(bare)} flex items-center justify-center gap-2 p-3 text-sm font-bold text-slate-500 ${className}`} role="status">
      <Loader2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 animate-spin" />
      {label}
    </p>
  );
}

/** 비어 있음. action 자리에 다음 행동 버튼·링크를 넣는다(예: 거래처 등록하기). */
export function EmptyState({ action, bare, className = "", description, message }: Common & { readonly message: ReactNode; readonly description?: ReactNode; readonly action?: ReactNode }) {
  return (
    <div className={`${box(bare)} ${bare ? "" : "p-6"} ${className}`}>
      <p className="text-sm font-black text-slate-700">{message}</p>
      {description ? <p className="mt-2 text-xs font-bold leading-5 text-slate-500">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/** 오류. onRetry를 주면 "다시 시도" 버튼이 생긴다. */
export function ErrorState({ bare, className = "", description, message, onRetry, retryLabel = "다시 시도" }: Common & { readonly message: ReactNode; readonly description?: ReactNode; readonly onRetry?: () => void; readonly retryLabel?: string }) {
  return (
    <div className={`${box(bare)} ${bare ? "" : "!border-rose-200 !bg-rose-50/60 p-6"} ${className}`} role="alert">
      <p className="text-sm font-black text-rose-700">{message}</p>
      {description ? <p className="mt-2 text-xs font-bold leading-5 text-slate-500">{description}</p> : null}
      {onRetry ? (
        <button className="maju-button-secondary mt-3 h-8 max-sm:min-h-11" onClick={onRetry} type="button">
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

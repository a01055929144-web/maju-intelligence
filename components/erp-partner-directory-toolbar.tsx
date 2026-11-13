import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

export function ErpPartnerDirectoryToolbar({
  action,
  children,
  countLabel,
  description,
  error,
  onRetry,
  title
}: {
  action?: ReactNode;
  children?: ReactNode;
  countLabel: string;
  description: string;
  error?: string;
  onRetry?: () => void;
  title: string;
}) {
  return (
    <>
      <div className="flex flex-col gap-3 border-b border-slate-200/80 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-950">{title}</h2>
          <p className="mt-1 text-xs font-medium leading-5 text-slate-500">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold tabular-nums text-slate-700">{countLabel}</span>
          {action}
        </div>
      </div>
      {children ? <div className="border-b border-slate-200/80 bg-slate-50/70 p-3 sm:p-4">{children}</div> : null}
      {error ? (
        <div className="flex flex-col gap-3 border-b border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-900 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <span className="flex min-w-0 items-start gap-2 font-semibold leading-5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </span>
          {onRetry ? (
            <button className="maju-button-secondary min-h-11 w-full justify-center border-rose-200 bg-white text-rose-800 sm:min-h-9 sm:w-auto" onClick={onRetry} type="button">
              다시 불러오기
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

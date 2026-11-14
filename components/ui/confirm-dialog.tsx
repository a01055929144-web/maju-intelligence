"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";

// CC-47-4 확인 창. 지도 파일의 지역 ConfirmDialog를 승격했다(문구·버튼·바깥 누르기 취소 그대로, Esc 취소 + 포커스 가둠 추가).
// 예전 window.confirm()은 브라우저가 "대화상자 더 표시 안 함"을 붙이면 조용히 false만 돌려줘 삭제 버튼이 반응 없는 것처럼 보였다(2026-08-24 배송담당자 삭제) → 화면 안에서 직접 그린다.
// tone: "danger"(되돌릴 수 없는 삭제·병합 — 빨간 확인 버튼) | "default"(단순 확인 — 브랜드색).
export type ConfirmTone = "danger" | "default";

export function ConfirmDialog({
  cancelLabel = "취소",
  confirmLabel = "확인",
  message,
  onCancel,
  onConfirm,
  title,
  tone = "danger"
}: {
  readonly cancelLabel?: string;
  readonly confirmLabel?: string;
  /** 무엇이 지워지는지 / 무슨 일이 일어나는지(줄바꿈 유지). */
  readonly message: ReactNode;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly title?: string;
  readonly tone?: ConfirmTone;
}) {
  return (
    <Dialog ariaLabel="확인" hideClose initialFocus="[data-confirm-cancel]" onClose={onCancel} size="sm" title={title}>
      <p className={`whitespace-pre-line text-sm font-bold leading-6 text-slate-700 ${title ? "mt-2" : ""}`}>{message}</p>
      <div className="mt-4 flex justify-end gap-2">
        <button className="maju-button-secondary h-9 px-4 text-xs" data-confirm-cancel="" onClick={onCancel} type="button">
          {cancelLabel}
        </button>
        <button className={`maju-button-primary h-9 px-4 text-xs ${tone === "danger" ? "bg-rose-600 hover:bg-rose-700" : ""}`} onClick={onConfirm} type="button">
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

export type ConfirmOptions = {
  readonly title?: string;
  /** 무엇이 지워지는지 적는다(예: `"1호차" 배송차를 삭제합니다. 거래처 3곳은 미배정이 됩니다.`). */
  readonly body: ReactNode;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly tone?: ConfirmTone;
};

/**
 * `const { confirm, confirmDialog } = useConfirm();` → 화면 어딘가에 `{confirmDialog}`를 그리고
 * `if (!(await confirm({ body: "…를 삭제합니다.", confirmLabel: "삭제" }))) return;`
 * 취소·Esc·바깥 누르기는 false. 이미 열려 있는데 또 부르면 앞의 것은 false로 닫힌다. 화면이 사라져도 false.
 */
export function useConfirm() {
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const settle = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setPending(null);
  }, []);
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    resolveRef.current?.(false);
    resolveRef.current = resolve;
    setPending(options);
  }), []);
  useEffect(() => () => resolveRef.current?.(false), []);
  const confirmDialog = pending ? (
    <ConfirmDialog cancelLabel={pending.cancelLabel} confirmLabel={pending.confirmLabel ?? (pending.tone === "default" ? "확인" : "삭제")} message={pending.body} onCancel={() => settle(false)} onConfirm={() => settle(true)} title={pending.title} tone={pending.tone} />
  ) : null;
  return { confirm, confirmDialog };
}

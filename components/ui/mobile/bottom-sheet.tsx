"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { trapTabTarget } from "@/components/ui/dialog";

export const SHEET_HEIGHTS = ["small", "medium", "large"] as const;
export type SheetHeight = (typeof SHEET_HEIGHTS)[number];
const HEIGHT_CLASS: Record<SheetHeight, string> = { small: "h-[22vh]", medium: "h-[50vh]", large: "h-[85vh]" };

/** 다음 높이 단계(작게 → 중간 → 크게 → 작게). */
export const nextSheetHeight = (height: SheetHeight): SheetHeight => SHEET_HEIGHTS[(SHEET_HEIGHTS.indexOf(height) + 1) % SHEET_HEIGHTS.length];

type Props = {
  readonly children: ReactNode;
  readonly title: ReactNode;
  readonly onClose?: () => void;
  /** modal = 뒤를 막는 아래 올라오는 창(공용 Dialog의 모바일 모양). docked = 지도 위에 붙은 시트(뒤 화면 계속 조작). */
  readonly mode?: "modal" | "docked";
  readonly height?: SheetHeight;
  /** 주면 손잡이가 단추가 되어 누를 때마다 다음 높이로 바뀐다. */
  readonly onHeightChange?: (height: SheetHeight) => void;
  /** 하단 메뉴와 함께 쓰는 지도 화면에서 시트가 메뉴를 가리지 않게 한다. */
  readonly aboveBottomNav?: boolean;
};

// shortcut: 손잡이는 누르면 단계가 바뀌는 단추만(끌어 올리기 없음). 끌기가 필요하면 포인터 이벤트로 단계 사이를 스냅.
export function BottomSheet({ aboveBottomNav = false, children, height = "medium", mode = "modal", onClose, onHeightChange, title }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (mode !== "modal") return;
    const panel = ref.current;
    if (!panel) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () => Array.from(panel.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'));
    (focusables()[0] ?? panel).focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current?.(); return; }
      if (event.key !== "Tab") return;
      const active = document.activeElement instanceof HTMLElement && panel.contains(document.activeElement) ? document.activeElement : null;
      const target = trapTabTarget(focusables(), active, event.shiftKey);
      if (target) { event.preventDefault(); target.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previous;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [mode]);

  const handle = onHeightChange
    ? <button aria-label="시트 높이 바꾸기" className="mx-auto flex h-6 w-full items-center justify-center" onClick={() => onHeightChange(nextSheetHeight(height))} type="button"><span className="h-1 w-10 rounded-full bg-slate-300" /></button>
    : <span aria-hidden="true" className="mx-auto mt-2 block h-1 w-10 rounded-full bg-slate-300" />;
  const sheet = (
    <div
      aria-label={typeof title === "string" ? title : undefined}
      aria-modal={mode === "modal" ? true : undefined}
      className={`fixed inset-x-0 z-[70] flex flex-col rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none ${aboveBottomNav ? "bottom-[calc(4.5rem+env(safe-area-inset-bottom))]" : "bottom-0"} ${mode === "docked" ? HEIGHT_CLASS[height] : "max-h-[85vh]"}`}
      ref={ref}
      role="dialog"
      tabIndex={-1}
    >
      {handle}
      <div className="flex items-center justify-between px-4 pb-2">
        <h2 className="text-[18px] font-bold">{title}</h2>
        {onClose ? <button aria-label="닫기" className="grid h-11 w-11 place-items-center text-slate-600" onClick={onClose} type="button">✕</button> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
    </div>
  );
  if (mode === "docked") return sheet;
  return <div className="fixed inset-0 z-[70] bg-slate-950/45" onClick={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>{sheet}</div>;
}

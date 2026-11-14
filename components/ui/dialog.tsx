"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

// CC-47-4 공통 팝업 틀: Esc · 바깥 누르기 · × 로 닫기, 포커스 가둠(Tab 순환) · 닫으면 연 버튼으로 복귀, 뒤 화면 스크롤 잠금, 휴대폰 전체 화면 옵션.
// 열려 있는 동안만 그린다(호출하는 쪽이 조건부로 렌더). 겹쳐 열리면 맨 위 팝업만 Esc를 받는다.
const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
const openStack: symbol[] = [];
let scrollLocks = 0;
let savedOverflow = "";

/** Tab 순환 규칙(순수): 바깥에 있거나 처음/끝을 넘으면 반대쪽 끝으로 돌린다. 옮길 필요가 없으면 null. */
export function trapTabTarget<T>(focusables: readonly T[], active: T | null, shift: boolean): T | null {
  if (!focusables.length) return null;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const index = active === null ? -1 : focusables.indexOf(active);
  if (index === -1) return shift ? last : first;
  if (shift && active === first) return last;
  if (!shift && active === last) return first;
  return null;
}

const SIZE_CLASS = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-3xl" } as const;

type Props = {
  readonly children: ReactNode;
  readonly onClose: () => void;
  /** 제목(머리글 + aria-labelledby). 없으면 ariaLabel을 준다. */
  readonly title?: ReactNode;
  readonly ariaLabel?: string;
  readonly size?: keyof typeof SIZE_CLASS;
  /** 640px 미만에서 화면 전체로. */
  readonly fullScreenOnMobile?: boolean;
  /** 오른쪽 위 × 를 숨긴다(확인 창처럼 취소 버튼이 이미 있을 때). */
  readonly hideClose?: boolean;
  /** 열릴 때 포커스를 줄 요소 선택자(패널 안). 없으면 첫 포커스 가능 요소. */
  readonly initialFocus?: string;
  readonly className?: string;
};

export function Dialog({ ariaLabel, children, className = "", fullScreenOnMobile = false, hideClose = false, initialFocus, onClose, size = "md", title }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useRef(`dialog-title-${Math.random().toString(36).slice(2, 9)}`).current;

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const token = Symbol("dialog");
    openStack.push(token);
    if (scrollLocks++ === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    const focusables = () => Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    (initialFocus ? panel.querySelector<HTMLElement>(initialFocus) : null)?.focus();
    if (!panel.contains(document.activeElement)) (focusables()[0] ?? panel).focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== token) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      } else if (event.key === "Tab") {
        const active = document.activeElement instanceof HTMLElement && panel.contains(document.activeElement) ? document.activeElement : null;
        const target = trapTabTarget(focusables(), active, event.shiftKey);
        if (target) {
          event.preventDefault();
          target.focus();
        } else if (!focusables().length) event.preventDefault();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      openStack.splice(openStack.indexOf(token), 1);
      if (--scrollLocks === 0) document.body.style.overflow = savedOverflow;
      if (opener && document.contains(opener)) opener.focus();
    };
    // 열릴 때 한 번만(initialFocus는 열 때만 쓴다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 ${fullScreenOnMobile ? "max-sm:p-0" : ""}`} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        aria-label={title ? undefined : ariaLabel}
        aria-labelledby={title ? titleId : undefined}
        aria-modal="true"
        className={`relative w-full ${SIZE_CLASS[size]} max-h-full overflow-y-auto rounded-xl bg-white p-5 shadow-2xl outline-none ${fullScreenOnMobile ? "max-sm:h-full max-sm:max-w-none max-sm:rounded-none" : ""} ${className}`}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        {title ? <h2 className={`text-sm font-black text-slate-950 ${hideClose ? "" : "pr-8"}`} id={titleId}>{title}</h2> : null}
        {hideClose ? null : (
          <button aria-label="닫기" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 max-sm:h-11 max-sm:w-11" onClick={onClose} type="button">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

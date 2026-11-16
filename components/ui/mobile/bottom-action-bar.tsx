import type { ReactNode } from "react";

/** 화면 아래 고정 주 버튼 1개(M 2절): 48px · 아이폰 안전 영역. 하단 메뉴와 같이 쓰지 않는다(둘 중 하나). */
export function BottomActionBar({ busy = false, children, disabled = false, onClick }: { readonly children: ReactNode; readonly onClick: () => void; readonly disabled?: boolean; readonly busy?: boolean }) {
  return (
    <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
      <button aria-busy={busy} className="h-12 w-full rounded-lg bg-teal-700 text-[16px] font-bold text-white disabled:opacity-50" disabled={disabled || busy} onClick={onClick} type="button">
        {busy ? "처리 중…" : children}
      </button>
    </div>
  );
}

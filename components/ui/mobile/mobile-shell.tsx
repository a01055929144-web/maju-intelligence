import type { ReactNode } from "react";

type Props = {
  readonly title: ReactNode;
  /** 뒤로 가기 링크. 없으면 뒤로 버튼을 그리지 않는다. */
  readonly backHref?: string;
  /** 위쪽 동작 1개까지(M 2절). */
  readonly action?: ReactNode;
  readonly children: ReactNode;
  /** 아래 영역: BottomNav 또는 BottomActionBar 중 하나. */
  readonly bottom?: ReactNode;
};

/** 화면 틀(M 2절): 위 = 뒤로 + 제목 + 동작 1개, 아래 = 하단 메뉴 또는 고정 주 버튼. */
export function MobileShell({ action, backHref, bottom, children, title }: Props) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-[15px] text-slate-950">
      <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-slate-200 bg-white px-2">
        {backHref ? <a aria-label="뒤로" className="grid h-11 w-11 place-items-center text-xl" href={backHref}>‹</a> : <span className="w-2" />}
        <h1 className="min-w-0 flex-1 truncate text-[18px] font-bold">{title}</h1>
        {action}
      </header>
      <div className="flex-1">{children}</div>
      {bottom}
    </div>
  );
}

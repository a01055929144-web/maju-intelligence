import type { ReactNode } from "react";

type Props = {
  readonly title: ReactNode;
  /** 오른쪽 위: 금액 또는 상태. */
  readonly trailing?: ReactNode;
  /** 아래 회색 보조 정보. */
  readonly subtitle?: ReactNode;
  readonly href?: string;
  readonly onClick?: () => void;
};

/** 목록 한 줄(M 2절): 2줄 · 행 높이 56~72px · 누르는 곳 44px 이상. */
export function MobileListRow({ href, onClick, subtitle, title, trailing }: Props) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="line-clamp-2 break-keep text-[15px] font-bold text-slate-950">{title}</span>
        {trailing ? <span className="shrink-0 text-right">{trailing}</span> : null}
      </span>
      {subtitle ? <span className="mt-0.5 block truncate text-[13px] text-slate-600">{subtitle}</span> : null}
    </>
  );
  const cls = "block min-h-14 w-full border-b border-slate-200 px-4 py-2.5 text-left";
  if (href) return <a className={cls} href={href}>{body}</a>;
  if (onClick) return <button className={cls} onClick={onClick} type="button">{body}</button>;
  return <div className={cls}>{body}</div>;
}

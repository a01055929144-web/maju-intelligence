import { formatWon } from "@/domains/shared/money";

/** 금액 한 줄 고정(M 2절): 16px 굵게 · 고정폭 숫자 · 줄바꿈 금지. */
export function MoneyText({ value, className = "" }: { readonly value: number; readonly className?: string }) {
  return <span className={`whitespace-nowrap text-[16px] font-bold tabular-nums ${className}`}>{formatWon(value)}</span>;
}

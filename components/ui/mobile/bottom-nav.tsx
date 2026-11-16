"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

export type BottomNavItem = { readonly href: string; readonly icon: ReactNode; readonly label: string; readonly active?: boolean };
export type BottomNavCenter = { readonly icon: ReactNode; readonly label: string; readonly href?: string; readonly onClick?: () => void };

type Props = {
  readonly items: readonly BottomNavItem[];
  /** 가운데 큰 둥근 버튼(기록·사진). 있으면 항목은 앞뒤 절반씩 나뉜다. */
  readonly center?: BottomNavCenter;
  readonly ariaLabel: string;
  /** 주소의 # 부분과 항목 href가 같으면 선택으로 보인다(한 화면 안 이동용). */
  readonly trackHash?: boolean;
};

/** 역할별 하단 메뉴 하나(기사·영업·매장 공용). 항목은 호출하는 쪽이 준다. */
export function BottomNav({ ariaLabel, center, items, trackHash = false }: Props) {
  const [hash, setHash] = useState("");
  useEffect(() => {
    if (!trackHash) return;
    const sync = () => setHash(window.location.hash);
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [trackHash]);

  const itemClass = (active: boolean) => `mobile-bottom-nav-item flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-semibold ${active ? "is-active" : ""}`;
  const render = (item: BottomNavItem) => {
    const active = item.active ?? (trackHash && hash === item.href);
    return <Link aria-current={active ? "page" : undefined} className={itemClass(Boolean(active))} href={item.href} key={`${item.href}-${item.label}`}>{item.icon}<span>{item.label}</span></Link>;
  };
  const half = Math.ceil(items.length / 2);
  const centerCls = "relative -mt-7 grid h-16 w-16 place-self-center place-items-center rounded-full bg-teal-700 text-white shadow-lg";
  return (
    <nav aria-label={ariaLabel} className={`mobile-bottom-nav sticky bottom-0 z-30 grid border-t px-2 pb-[calc(0.4rem+env(safe-area-inset-bottom))] pt-1.5 ${center ? "grid-cols-[1fr_1fr_76px_1fr_1fr]" : "grid-flow-col auto-cols-fr"}`}>
      {(center ? items.slice(0, half) : items).map(render)}
      {center ? (center.href ? <Link aria-label={center.label} className={centerCls} href={center.href}>{center.icon}</Link> : <button aria-label={center.label} className={centerCls} onClick={center.onClick} type="button">{center.icon}</button>) : null}
      {center ? items.slice(half).map(render) : null}
    </nav>
  );
}

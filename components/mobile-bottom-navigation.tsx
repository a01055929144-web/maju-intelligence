"use client";

import Link from "next/link";
import { Camera, House, Map, Route, Target } from "lucide-react";
import { useEffect, useState } from "react";

const items = [
  { href: "#route-list", icon: House, label: "오늘" },
  { href: "/map", icon: Map, label: "지도" },
  { href: "/mobile/sales#lead-list", icon: Target, label: "리드" },
  { href: "#route-list", icon: Route, label: "코스" }
] as const;

export function MobileBottomNavigation() {
  const [activeHref, setActiveHref] = useState("#route-list");

  useEffect(() => {
    const syncHash = () => setActiveHref(window.location.hash || "#route-list");
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  return (
    <footer aria-label="모바일 현장 바로가기" className="mobile-bottom-nav sticky bottom-0 z-20 grid grid-cols-[1fr_1fr_76px_1fr_1fr] border-t px-2 pb-[calc(0.4rem+env(safe-area-inset-bottom))] pt-1.5">
      {items.slice(0, 2).map((item) => {
        const Icon = item.icon;
        const active = activeHref === item.href;
        return (
          <Link
            aria-current={active ? "location" : undefined}
            className={`mobile-bottom-nav-item flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-semibold ${active ? "is-active" : ""}`}
            href={item.href}
            key={item.href}
            onClick={() => setActiveHref(item.href)}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <Link aria-label="가장 가까운 매장 배송 기록" className="relative -mt-7 grid h-16 w-16 place-self-center place-items-center rounded-full bg-teal-700 text-white shadow-lg" href="#delivery-proof"><Camera className="h-7 w-7" /></Link>
      {items.slice(2).map((item) => { const Icon = item.icon; const active = activeHref === item.href; return <Link aria-current={active ? "location" : undefined} className={`mobile-bottom-nav-item flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-semibold ${active ? "is-active" : ""}`} href={item.href} key={`${item.href}-${item.label}`} onClick={() => setActiveHref(item.href)}><Icon className="h-4 w-4" /><span>{item.label}</span></Link>; })}
    </footer>
  );
}

"use client";

import Link from "next/link";
import { CheckCircle2, History, Route, Store } from "lucide-react";
import { useEffect, useState } from "react";

const items = [
  { href: "#route-list", icon: Route, label: "오늘 코스" },
  { href: "#selected-customer", icon: Store, label: "선택 매장" },
  { href: "#delivery-proof", icon: CheckCircle2, label: "배송 완료" },
  { href: "#delivery-history", icon: History, label: "배송 기록" }
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
    <footer aria-label="모바일 현장 바로가기" className="mobile-bottom-nav sticky bottom-0 z-20 grid grid-cols-4 border-t px-2 pb-[calc(0.4rem+env(safe-area-inset-bottom))] pt-1.5">
      {items.map((item) => {
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
    </footer>
  );
}

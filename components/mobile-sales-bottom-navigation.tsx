"use client";

import Link from "next/link";
import { Bell, Map, Route, Target } from "lucide-react";

const items = [
  { href: "/mobile/today", icon: Route, label: "배송 코스" },
  { href: "/mobile/sales#lead-map", icon: Map, label: "영업 지도" },
  { href: "/mobile/sales#lead-list", icon: Target, label: "리드" },
  { href: "/mobile/sales#reminders", icon: Bell, label: "리마인드" }
] as const;

export function MobileSalesBottomNavigation({ active = "sales" }: { active?: "delivery" | "sales" }) {
  return (
    <footer aria-label="모바일 배송·영업 바로가기" className="mobile-bottom-nav sticky bottom-0 z-30 grid grid-cols-4 border-t px-2 pb-[calc(0.4rem+env(safe-area-inset-bottom))] pt-1.5">
      {items.map((item, index) => {
        const Icon = item.icon;
        const selected = active === "delivery" ? index === 0 : index > 0;
        return (
          <Link className={`mobile-bottom-nav-item flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-semibold ${selected ? "is-active" : ""}`} href={item.href} key={item.href}>
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </footer>
  );
}

"use client";

import Link from "next/link";
import { Camera, House, Map, Route, Target } from "lucide-react";

const items = [
  { href: "/mobile/sales", icon: House, label: "오늘" },
  { href: "/mobile/sales#lead-map", icon: Map, label: "지도" },
  { href: "/mobile/sales#lead-list", icon: Target, label: "리드" },
  { href: "/mobile/today", icon: Route, label: "코스" }
] as const;

export function MobileSalesBottomNavigation({ active = "sales", onQuickRecord }: { active?: "delivery" | "sales"; onQuickRecord?: () => void }) {
  return (
    <footer aria-label="모바일 배송·영업 바로가기" className="mobile-bottom-nav sticky bottom-0 z-30 grid grid-cols-[1fr_1fr_76px_1fr_1fr] border-t px-2 pb-[calc(0.4rem+env(safe-area-inset-bottom))] pt-1.5">
      {items.slice(0, 2).map((item, index) => {
        const Icon = item.icon;
        const selected = active === "sales" && index === 0;
        return (
          <Link className={`mobile-bottom-nav-item flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-semibold ${selected ? "is-active" : ""}`} href={item.href} key={item.href}>
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
      <button aria-label="가장 가까운 매장 기록" className="relative -mt-7 grid h-16 w-16 place-self-center place-items-center rounded-full bg-teal-700 text-white shadow-lg" onClick={onQuickRecord} type="button"><Camera className="h-7 w-7" /><span className="sr-only">가장 가까운 매장 기록</span></button>
      {items.slice(2).map((item) => {
        const Icon = item.icon;
        return <Link className="mobile-bottom-nav-item flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-semibold" href={item.href} key={item.href}><Icon className="h-4 w-4" /><span>{item.label}</span></Link>;
      })}
    </footer>
  );
}

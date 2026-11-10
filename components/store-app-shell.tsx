"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { storeNavigationGroups, storeViewFrom } from "@/lib/store-navigation";

/** 매장 PC 화면 틀: 고객사 화면과 같은 사이드바·제목줄. 휴대폰(≤640px)은 틀 없이 본문(하단 탭)만. */
export function StoreAppShell({ children, title = "MAJU 매장" }: { children: ReactNode; title?: string }) {
  const active = storeViewFrom(useSearchParams().get("view"));
  return (
    <div className="maju-app-bg min-h-screen text-slate-950">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <div className="max-sm:hidden lg:contents">
          <AppSidebar active={active} brand="MAJU" context="매장" groups={storeNavigationGroups} homeHref="/store?view=home" storageScope="store" variant="customer" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur max-sm:hidden">
            <div className="flex items-center px-4 py-3 xl:h-[72px] xl:py-0"><h1 className="text-xl font-bold">{title}</h1></div>
          </header>
          <div className="w-full sm:px-4 sm:py-4 lg:px-6 lg:py-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

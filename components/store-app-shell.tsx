"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { storeNavigationGroups, storeViewFrom } from "@/lib/store-navigation";

/** 매장 PC 화면 틀: 고객사 화면과 같은 사이드바·제목줄. 휴대폰(≤640px)은 틀 없이 본문(하단 탭)만. */
export function StoreAppShell({ children, title = "MAJU 매장" }: { children: ReactNode; title?: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  // 화면 안 버튼(주문하기 등)이 탭을 바꾸면 store:tab 이벤트로 강조만 따라간다. 주소의 ?view=가 바뀌면 그쪽이 우선.
  const viewParam = params.get("view");
  const [picked, setPicked] = useState<{ view: string; from: string | null } | null>(null);
  const active = picked && picked.from === viewParam ? storeViewFrom(picked.view) : storeViewFrom(viewParam);
  useEffect(() => {
    const onTab = (event: Event) => setPicked({ view: String((event as CustomEvent).detail), from: viewParam });
    window.addEventListener("store:tab", onTab);
    return () => window.removeEventListener("store:tab", onTab);
  }, [viewParam]);
  // 매장 주소 토큰은 #뒤에 있고, 구성원 확인은 companyId·storeAccountId 쿼리에 있다. 메뉴 이동에서 둘 다 지키지 않으면 인증이 풀린다.
  const [hash, setHash] = useState("");
  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read(); window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const groups = useMemo(() => storeNavigationGroups.map((group) => ({
    ...group,
    items: group.items.map((item) => {
      const next = new URLSearchParams(params.toString());
      next.set("view", item.active);
      return { ...item, href: `/store?${next.toString()}${hash}` };
    }),
  })), [params, hash]);
  // activate·members 같은 하위 화면은 틀 없이 그대로.
  if (pathname !== "/store") return <>{children}</>;
  return (
    <div className="maju-app-bg min-h-screen text-slate-950">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <div className="max-sm:hidden lg:contents">
          <AppSidebar active={active} brand="MAJU" context="매장" groups={groups} homeHref={`/store?view=home${hash}`} storageScope="store" variant="customer" />
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

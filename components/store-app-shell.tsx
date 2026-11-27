"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Store } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { storeNavigationGroups, storeViewFrom } from "@/lib/store-navigation";
import { BottomNav } from "@/components/ui/mobile";

/** 매장 공통 틀: PC 사이드바와, 허용된 회사의 휴대폰 상단·하단 탭. */
export function StoreAppShell({ children, mobile, stores = [], selectedStore }: {
  children: ReactNode;
  stores?: Array<{ key: string; name: string; href: string }>;
  selectedStore?: string;
  mobile?: { storeName: string };
}) {
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
  useEffect(() => {
    if (!selectedStore || (hash && hash !== "#store-address-management")) return;
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `maju_store_choice=${encodeURIComponent(selectedStore)}; Path=/store; Max-Age=2592000; SameSite=Lax${secure}`;
  }, [hash, selectedStore]);
  const groups = useMemo(() => storeNavigationGroups.map((group) => ({
    ...group,
    items: group.items.map((item) => {
      const next = new URLSearchParams(params.toString());
      next.set("view", item.active);
      next.delete("document");
      return { ...item, href: `/store?${next.toString()}${hash}` };
    }),
  })), [params, hash]);
  const storeGroup = stores.length > 1 && (!hash || hash === "#store-address-management") ? [{
    label: "매장 고르기",
    items: stores.map(store => ({ active: store.key, href: store.href, icon: Store, label: store.name })),
  }] : [];
  // activate·members 같은 하위 화면은 틀 없이 그대로.
  if (pathname !== "/store") return <>{children}</>;
  const mobileItems = groups[0].items.filter(item => item.active !== "data").map(item => {
    const Icon = item.icon;
    return {
      href: item.href,
      icon: <Icon aria-hidden className="h-5 w-5" />,
      active: item.active === active || (item.active === "info" && active === "data"),
      label: item.active === "info" ? "내 매장" : item.label,
    };
  });
  const title = active === "data" ? "원가관리" : mobileItems.find(item => item.active)?.label ?? "홈";
  const homeHref = mobileItems[0].href;
  return (
    <div className="maju-app-bg min-h-screen text-slate-950">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <div className="max-sm:hidden lg:contents">
          <AppSidebar active={active} brand="MAJU" context="매장" groups={[...storeGroup, ...groups]} homeHref={groups[0].items[0].href} storageScope="store" variant="customer" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {mobile && <header className="sticky top-0 z-20 flex min-h-14 items-center gap-2 border-b border-slate-200 bg-white px-2 sm:hidden">
            {active !== "home" ? <Link aria-label="뒤로" className="grid h-11 w-11 place-items-center" href={homeHref}><ChevronLeft aria-hidden className="h-5 w-5" /></Link> : <span className="w-2" />}
            <div className="min-w-0"><h1 className="truncate text-lg font-bold">{title}</h1><p className="truncate text-xs text-slate-600">{mobile.storeName}</p></div>
          </header>}
          <header className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur max-sm:hidden">
            <div className="flex items-center px-4 py-3 xl:h-[72px] xl:py-0"><h1 className="text-xl font-bold">MAJU 매장</h1></div>
          </header>
          <div className={`w-full sm:px-4 sm:py-4 lg:px-6 lg:py-5 ${mobile ? "pb-20 sm:pb-4" : ""}`}>{children}</div>
          {mobile && <div className="fixed inset-x-0 bottom-0 z-30 sm:hidden"><BottomNav ariaLabel="매장 메뉴" items={mobileItems} /></div>}
        </div>
      </div>
    </div>
  );
}

import { ClipboardList, Database, Home, ShoppingCart, Store } from "lucide-react";
import type { AppSidebarGroup } from "@/components/app-sidebar";

// 매장(점주·직원) PC 메뉴. 고객사 메뉴(customer-navigation.ts)와 같은 형식, 매장 화면 탭과 1:1.
// 휴대폰(≤640px)은 같은 탭을 하단 탭으로 쓴다. 거래 유통사별 문서 목록은 CX-12에서 추가.
export const STORE_VIEWS = ["home", "order", "history", "data", "info"] as const;
export type StoreView = (typeof STORE_VIEWS)[number];

export function storeViewFrom(value: string | null | undefined): StoreView {
  return STORE_VIEWS.includes(value as StoreView) ? (value as StoreView) : "home";
}

export const storeNavigationGroups: AppSidebarGroup[] = [
  {
    label: "매장",
    items: [
      { active: "home", href: "/store?view=home", icon: Home, label: "홈" },
      { active: "order", href: "/store?view=order", icon: ShoppingCart, label: "주문" },
      { active: "history", href: "/store?view=history", icon: ClipboardList, label: "주문 내역" },
      { active: "data", href: "/store?view=data", icon: Database, label: "데이터" },
      { active: "info", href: "/store?view=info", icon: Store, label: "매장 정보" },
    ],
  },
];

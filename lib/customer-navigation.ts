import {
  BarChart3,
  Bot,
  Building2,
  Database,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  LucideIcon,
  MapPinned,
  MessageSquareText,
  PackageSearch,
  Route,
  Settings,
  Sparkles,
  Store,
  Truck
} from "lucide-react";

export type CustomerWorkspaceKey =
  | "dashboard"
  | "customers-summary"
  | "customers"
  | "routes"
  | "routes-today"
  | "delivery-history"
  | "territory"
  | "revenue"
  | "sales-contacts"
  | "suppliers"
  | "product-catalog"
  | "product-standards"
  | "sales-performance"
  | "revenue-ledger"
  | "billing"
  | "assistant"
  | "report"
  | "settings"
  | "data"
  | "data-management";

export type CustomerNavigationItem = {
  readonly active: CustomerWorkspaceKey;
  readonly badge?: string;
  readonly children?: readonly CustomerNavigationItem[];
  readonly description: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly label: string;
};

export type CustomerNavigationGroup = {
  readonly label: string;
  readonly items: CustomerNavigationItem[];
};

export const customerNavigationGroups: CustomerNavigationGroup[] = [
  {
    label: "영업",
    items: [
      { active: "dashboard", description: "최근 개업·인허가 기반 신규 매장", href: "/dashboard?view=leads&leadType=permit", icon: Building2, label: "신규 리드" },
      { active: "dashboard", description: "검색량·리뷰 기반 영업 후보", href: "/dashboard?view=leads&leadType=keyword", icon: Sparkles, label: "영업 리드" },
      { active: "assistant", description: "견적, 메모, 후속 액션", href: "/assistant", icon: Bot, label: "AI 영업" }
    ]
  },
  {
    label: "운영 관리",
    items: [
      {
        active: "revenue", description: "영업 현황, 견적, 후속 활동과 성과", href: "/revenue/pipeline", icon: BarChart3, label: "영업관리",
        children: [
          { active: "revenue", description: "영업 현황과 견적 원장", href: "/revenue/pipeline", icon: LayoutDashboard, label: "현황·견적 원장" },
          { active: "sales-contacts", description: "컨택 기록과 후속 연락 일정", href: "/revenue/contacts", icon: MessageSquareText, label: "컨택·리마인드" },
          { active: "sales-performance", description: "담당자별 목표와 영업 실적", href: "/sales/performance", icon: BarChart3, label: "영업 성과" }
        ]
      },
      { active: "suppliers", description: "매입처, 매입 상품, 원가와 업로드 이력", href: "/purchasing/suppliers", icon: Truck, label: "매입처" },
      {
        active: "customers", description: "거래처, 계약 단가와 거래내역", href: "/crm/timeline", icon: Store, label: "매출처",
        children: [
          { active: "customers", description: "거래처 정보와 계약 단가", href: "/crm/timeline", icon: Store, label: "매출처 원장" },
          { active: "revenue-ledger", description: "ERP 매출 거래내역", href: "/revenue/transactions", icon: History, label: "거래내역" }
        ]
      },
      { active: "product-catalog", description: "회사가 판매하는 마스터 상품", href: "/revenue/products", icon: PackageSearch, label: "상품관리" },
      { active: "product-standards", description: "내 상품과 BIV 표준 품목 연결", href: "/revenue/products?tab=mapping", icon: Database, label: "표준 품목 관리" }
    ]
  },
  {
    label: "TMS 물류효율화",
    items: [
      { active: "dashboard", description: "거래처와 배송 현황 통합 지도", href: "/dashboard", icon: MapPinned, label: "지도 홈" },
      { active: "routes-today", description: "오늘 배송 순서와 완료 상태", href: "/routes/today", icon: Route, label: "오늘 코스" },
      { active: "delivery-history", description: "날짜별 운행·배송 완료 기록", href: "/dashboard?view=history", icon: History, label: "배송 이력" },
      { active: "territory", description: "배송 권역과 호차·차량 관리", href: "/dashboard/settings?section=tms#territory-settings", icon: Truck, label: "권역·호차" }
    ]
  },
  {
    label: "설정·데이터",
    items: [
      { active: "customers-summary", description: "거래처 수, 등급, 데이터 보완 상태", href: "/crm/summary", icon: LayoutDashboard, label: "전체 현황" },
      { active: "data", description: "거래처·매출·매입 데이터 등록", href: "/", icon: FileSpreadsheet, label: "데이터 등록" },
      { active: "data-management", description: "업로드, 저장, 누락 확인", href: "/customers/data", icon: Database, label: "등록 이력" },
      { active: "settings", description: "회사, 직원, 권한과 운영 기준", href: "/dashboard/settings?section=company#company-settings", icon: Settings, label: "운영 설정" }
    ]
  }
  // 단체메시지는 카카오 연동 범위가 확정될 때까지 메뉴에도 "준비 중" 항목을 만들지 않습니다.
];

/** Expands each group's items into a flat leaf-item list — items with children contribute their children, not the parent. */
export function flattenCustomerNavigationItems(groups: CustomerNavigationGroup[] = customerNavigationGroups): CustomerNavigationItem[] {
  return groups.flatMap((group) => group.items.flatMap((item) => (item.children && item.children.length ? item.children : [item])));
}

export function getCustomerWorkspaceLabel(active: CustomerWorkspaceKey) {
  return flattenCustomerNavigationItems().find((item) => item.active === active)?.label || "지도 홈";
}

export function getCustomerQuickActions() {
  return [
    { active: "dashboard" as const, helper: "통합 지도", icon: MapPinned, label: "지도 홈" },
    { active: "customers" as const, helper: "원장", icon: Building2, label: "매출처" },
    { active: "revenue" as const, helper: "기회", icon: BarChart3, label: "영업" }
  ];
}

export const customerUtilityActions = {
  assistant: { icon: MessageSquareText, label: "AI" },
  settings: { icon: Settings, label: "설정" }
};

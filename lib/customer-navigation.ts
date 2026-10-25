import { BarChart3, Bot, Boxes, Building2, Database, FileSpreadsheet, History, LayoutDashboard, LucideIcon, MapPinned, MessageSquareText, PackageSearch, Route, Settings, Sparkles, Store, Truck, Users } from "lucide-react";

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
  | "erp-documents"
  | "inventory"
  | "sales-performance"
  | "revenue-ledger"
  | "billing"
  | "assistant"
  | "report"
  | "settings"
  | "settings-staff"
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
      { active: "dashboard", description: "최근 개업·인허가 기반 신규 매장", href: "/leads?type=permit", icon: Building2, label: "신규 리드" },
      { active: "dashboard", description: "검색량·리뷰 기반 영업 후보", href: "/leads?type=keyword", icon: Sparkles, label: "영업 리드" },
      { active: "sales-contacts", description: "컨택·방문 기록과 후속 연락 일정", href: "/revenue/contacts", icon: MessageSquareText, label: "연락 기록" }
    ]
  },
  {
    label: "동선",
    items: [
      { active: "dashboard", description: "영업 후보와 배송 현황 통합 지도", href: "/map", icon: MapPinned, label: "지도" },
      { active: "routes-today", description: "오늘 배송 순서와 완료 상태", href: "/routes/today", icon: Route, label: "오늘 코스" },
      { active: "delivery-history", description: "날짜별 운행·배송 완료 기록", href: "/map?view=history", icon: History, label: "배송 이력" },
      { active: "territory", description: "배송 권역과 호차·차량 관리", href: "/dashboard/settings/routes", icon: Truck, label: "권역·호차" }
    ]
  },
  {
    label: "설정",
    items: [
      { active: "settings", description: "회사, 출발지와 알림 기준", href: "/dashboard/settings/company", icon: Settings, label: "회사 정보" },
      { active: "settings-staff", description: "직원 이름, 권한과 담당 업무", href: "/dashboard/settings/staff", icon: Users, label: "직원 관리" },
      { active: "data", description: "거래처·매출·매입 데이터 등록", href: "/", icon: FileSpreadsheet, label: "엑셀 업로드" },
      { active: "data-management", description: "업로드, 저장, 누락 확인", href: "/customers/data", icon: Database, label: "업로드 이력" }
    ]
  }
  // 단체메시지는 카카오 연동 범위가 확정될 때까지 메뉴에도 "준비 중" 항목을 만들지 않습니다.
];

export const holdNavigationGroups: CustomerNavigationGroup[] = [
  {
    label: "보류 모듈",
    items: [
      { active: "revenue", description: "영업 현황과 견적 원장", href: "/revenue/pipeline", icon: FileSpreadsheet, label: "견적 관리" },
      { active: "sales-performance", description: "담당자별 목표와 영업 실적", href: "/sales/performance", icon: BarChart3, label: "영업 성과" },
      { active: "assistant", description: "견적, 메모, 후속 액션", href: "/assistant", icon: Bot, label: "AI 영업 비서" },
      { active: "customers-summary", description: "거래처 데이터 현황", href: "/crm/summary", icon: LayoutDashboard, label: "거래처 현황" },
      { active: "customers", description: "거래처 정보와 계약 단가", href: "/crm/timeline", icon: Store, label: "매출처" },
      { active: "suppliers", description: "매입처와 원가", href: "/purchasing/suppliers", icon: Truck, label: "매입처" },
      { active: "erp-documents", description: "매출·매입·반품 전표", href: "/operations/documents", icon: FileSpreadsheet, label: "전표" },
      { active: "revenue-ledger", description: "기존 거래 자료", href: "/revenue/transactions", icon: History, label: "이전 거래 자료" },
      { active: "product-catalog", description: "마스터 상품", href: "/revenue/products", icon: PackageSearch, label: "상품관리" },
      { active: "inventory", description: "현재고와 실사", href: "/operations/inventory", icon: Boxes, label: "재고관리" }
    ]
  }
];

export function getCustomerNavigationGroups(includeHoldModules = false) {
  return includeHoldModules ? [...customerNavigationGroups, ...holdNavigationGroups] : customerNavigationGroups;
}

/** Expands each group's items into a flat leaf-item list — items with children contribute their children, not the parent. */
export function flattenCustomerNavigationItems(groups: CustomerNavigationGroup[] = customerNavigationGroups): CustomerNavigationItem[] {
  return groups.flatMap((group) => group.items.flatMap((item) => (item.children && item.children.length ? item.children : [item])));
}

export function getCustomerWorkspaceLabel(active: CustomerWorkspaceKey) {
  return flattenCustomerNavigationItems(getCustomerNavigationGroups(true)).find((item) => item.active === active)?.label || "지도";
}

export function getCustomerQuickActions() {
  return [
    { active: "dashboard" as const, helper: "신규 후보", href: "/leads?type=permit", icon: Building2, label: "신규 리드" },
    { active: "dashboard" as const, helper: "영업 후보", href: "/leads?type=keyword", icon: Sparkles, label: "영업 리드" },
    { active: "dashboard" as const, helper: "통합 지도", href: "/map", icon: MapPinned, label: "지도" },
    { active: "routes-today" as const, helper: "배송 순서", href: "/routes/today", icon: Route, label: "오늘 코스" }
  ];
}

export const customerUtilityActions = {
  assistant: { icon: MessageSquareText, label: "AI" },
  settings: { icon: Settings, label: "설정" }
};

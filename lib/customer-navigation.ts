import { BarChart3, Boxes, Building2, CreditCard, Database, FileSpreadsheet, History, LayoutDashboard, LucideIcon, MapPinned, MessageSquareText, PackageSearch, Route, Settings, Sparkles, Store, Truck, Users } from "lucide-react";

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
  readonly workspaceRoles?: readonly string[];
};

export type CustomerNavigationGroup = {
  readonly label: string;
  readonly items: CustomerNavigationItem[];
};

export const customerNavigationGroups: CustomerNavigationGroup[] = [
  {
    label: "오늘",
    items: [
      { active: "dashboard", description: "오늘 확인할 영업·배송 업무", href: "/dashboard", icon: LayoutDashboard, label: "홈" }
    ]
  },
  {
    label: "영업",
    items: [
      { active: "dashboard", description: "최근 개업·인허가 기반 신규 매장", href: "/leads?type=permit", icon: Building2, label: "신규 리드" },
      { active: "dashboard", description: "검색량·리뷰 기반 영업 후보", href: "/leads?type=keyword", icon: Sparkles, label: "영업 리드" },
      { active: "sales-contacts", description: "컨택·방문 기록과 후속 연락 일정", href: "/revenue/contacts", icon: MessageSquareText, label: "영업 관리" }
    ]
  },
  {
    label: "동선",
    items: [
      { active: "dashboard", description: "영업 후보와 배송 현황 통합 지도", href: "/map", icon: MapPinned, label: "지도" },
      { active: "routes-today", description: "오늘 배송 순서와 완료 상태", href: "/routes/today", icon: Route, label: "오늘 코스" },
      { active: "delivery-history", description: "날짜별 운행·배송 완료 기록", href: "/map?view=history", icon: History, label: "배송 이력" }
    ]
  },
  {
    label: "설정",
    items: [
      { active: "settings", description: "회사 정보·주문·권역·문자 발송", href: "/dashboard/settings/company", icon: Settings, label: "회사 정보" },
      { active: "settings-staff", description: "직원 이름, 권한과 담당 업무", href: "/dashboard/settings/staff", icon: Users, label: "직원·권한" },
      {
        active: "data",
        children: [
          { active: "data", description: "상품·거래처·거래 자료 등록", href: "/", icon: FileSpreadsheet, label: "새로 가져오기" },
          { active: "data-management", description: "가져오기 이력과 오류 확인", href: "/customers/data", icon: Database, label: "업로드 이력" }
        ],
        description: "자료 가져오기와 처리 이력",
        href: "/",
        icon: FileSpreadsheet,
        label: "데이터 가져오기"
      },
      { active: "billing", description: "요금제, 등록 카드와 결제 내역", href: "/settings/billing", icon: CreditCard, label: "구독·결제" },
    ]
  }
  // 단체메시지는 카카오 연동 범위가 확정될 때까지 메뉴에도 "준비 중" 항목을 만들지 않습니다.
];

export const holdNavigationGroups: CustomerNavigationGroup[] = [
  {
    label: "ERP",
    items: [
      { active: "inventory", description: "현재고와 실사", href: "/operations/inventory", icon: Boxes, label: "재고", workspaceRoles: ["owner", "manager"] },
      { active: "erp-documents", description: "매출·매입·반품 전표", href: "/operations/documents", icon: FileSpreadsheet, label: "매입·매출관리", workspaceRoles: ["owner", "manager"] },
      { active: "revenue-ledger", description: "기존 매출 거래 자료", href: "/revenue/transactions", icon: History, label: "매출 자료", workspaceRoles: ["owner", "manager"] }
    ]
  }
];

const coreErpItems: CustomerNavigationItem[] = [
  { active: "product-catalog", description: "전체 상품과 가져오기 이력", href: "/revenue/products", icon: PackageSearch, label: "상품관리", workspaceRoles: ["owner", "manager", "sales"] },
  { active: "customers", description: "매출처 정보와 계약 단가", href: "/crm/timeline", icon: Store, label: "매출처", workspaceRoles: ["owner", "manager", "sales"] },
  { active: "suppliers", description: "매입처와 원가", href: "/purchasing/suppliers", icon: Truck, label: "매입처", workspaceRoles: ["owner", "manager"] }
];

const pricingNavigationGroup: CustomerNavigationGroup = {
  label: "단가",
  items: [
    { active: "revenue", description: "엑셀과 직접 입력으로 매입가 변경", href: "/revenue/pricing", icon: BarChart3, label: "매입가 반영", workspaceRoles: ["owner", "manager"] },
    { active: "revenue", description: "마진 규칙과 가격 재계산", href: "/revenue/pricing/margins", icon: BarChart3, label: "마진 설정", workspaceRoles: ["owner", "manager"] },
    { active: "revenue", description: "견적서와 단가표 문서", href: "/revenue/pricing/documents", icon: FileSpreadsheet, label: "견적서·단가표", workspaceRoles: ["owner", "manager", "sales"] }
  ]
};

const orderNavigationGroup: CustomerNavigationGroup = {
  label: "주문",
  items: [
    // 11/3: 주문 설정은 설정 > 회사 정보 '주문' 탭으로 옮겼습니다(정보를 한 곳에서 입력).
    { active: "revenue", description: "매장 주문 링크 관리", href: "/revenue/pricing/links", icon: Store, label: "링크 관리", workspaceRoles: ["owner", "manager"] }
  ]
};

export function getCustomerNavigationGroups(includeHoldModules = false, workspaceRole?: string, pricingEnabled = false, storeOrderingEnabled = false) {
  const [today, sales, routes, settings] = customerNavigationGroups;
  const groups = [today, sales];
  if (pricingEnabled && storeOrderingEnabled) groups.push(orderNavigationGroup);
  if (pricingEnabled) groups.push(pricingNavigationGroup);
  groups.push(routes);
  const erpItems = [
    ...coreErpItems,
    ...(includeHoldModules ? holdNavigationGroups[0].items : [])
  ];
  if (erpItems.length) groups.push({ label: "ERP", items: erpItems });
  groups.push(settings);
  if (!workspaceRole) return groups;
  return groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.workspaceRoles || item.workspaceRoles.includes(workspaceRole))
  })).filter((group) => group.items.length > 0);
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
    { active: "dashboard" as const, helper: "오늘 할 일", href: "/dashboard", icon: LayoutDashboard, label: "오늘 현황" },
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

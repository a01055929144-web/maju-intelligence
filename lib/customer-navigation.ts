import {
  BarChart3,
  Building2,
  Database,
  FileSpreadsheet,
  HeartPulse,
  LayoutDashboard,
  LucideIcon,
  MapPinned,
  MessageSquareText,
  Radar,
  ReceiptText,
  Settings,
  Sparkles
} from "lucide-react";

export type CustomerWorkspaceKey =
  | "dashboard"
  | "customers-summary"
  | "customers"
  | "routes"
  | "revenue"
  | "revenue-ledger"
  | "leads-permits"
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
    label: "지도 OS",
    items: [
      {
        active: "dashboard",
        badge: "실시간",
        description: "지도, 거래처 위치, 영업·배송 코스",
        href: "/dashboard",
        icon: MapPinned,
        label: "지도 홈"
      }
    ]
  },
  {
    label: "거래처",
    items: [
      {
        active: "customers",
        description: "등록부터 상세 관리까지",
        href: "/",
        icon: Building2,
        label: "거래처",
        children: [
          {
            active: "customers-summary",
            description: "전체 거래처, 등급, 보완 상태 요약",
            href: "/crm/summary",
            icon: LayoutDashboard,
            label: "거래처 전체 현황"
          },
          {
            active: "data",
            description: "거래처 기본정보와 매출 입력",
            href: "/",
            icon: FileSpreadsheet,
            label: "데이터 등록"
          },
          {
            active: "customers",
            description: "상세, 메모, 첨부자료 관리",
            href: "/crm/timeline",
            icon: Building2,
            label: "거래처 관리"
          },
          {
            active: "data-management",
            description: "업로드 이력, 저장 상태, 누락 상태 확인",
            href: "/customers/data",
            icon: Database,
            label: "저장 이력"
          }
        ]
      }
    ]
  },
  {
    label: "신규 영업",
    items: [
      {
        active: "leads-permits",
        description: "사업자 인허가 신규 데이터 기반 영업 후보",
        href: "/leads/permits",
        icon: Radar,
        label: "신규 리드"
      }
    ]
  },
  {
    label: "매출",
    items: [
      {
        active: "revenue",
        description: "기회, 이탈 징후, 업셀링 후보",
        href: "/revenue/pipeline",
        icon: BarChart3,
        label: "매출 기회"
      },
      {
        active: "revenue-ledger",
        description: "ERP 매출 원장 조회",
        href: "/revenue/transactions",
        icon: ReceiptText,
        label: "매출 거래내역"
      },
      {
        active: "assistant",
        description: "견적, 메모, 후속 액션",
        href: "/assistant",
        icon: Sparkles,
        label: "영업 도우미"
      },
      {
        active: "report",
        description: "회사 건강도와 운영 리포트",
        href: "/reports/latest",
        icon: HeartPulse,
        label: "운영 리포트"
      }
    ]
  },
  {
    label: "관리",
    items: [
      {
        active: "settings",
        description: "회사 정보와 물류 출발지 관리",
        href: "/dashboard/settings",
        icon: Settings,
        label: "회사 설정"
      }
    ]
  }
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
    { active: "dashboard" as const, helper: "지도·코스", icon: MapPinned, label: "지도 홈" },
    { active: "customers" as const, helper: "원장", icon: Building2, label: "거래처" },
    { active: "revenue" as const, helper: "성장", icon: BarChart3, label: "매출" }
  ];
}

export const customerUtilityActions = {
  assistant: { icon: MessageSquareText, label: "AI 도우미" },
  settings: { icon: Settings, label: "설정" }
};

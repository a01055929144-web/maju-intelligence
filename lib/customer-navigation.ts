import {
  BarChart3,
  Building2,
  CreditCard,
  Database,
  FileSpreadsheet,
  HeartPulse,
  LayoutDashboard,
  LucideIcon,
  MapPinned,
  MessageSquareText,
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
    label: "지도 OS",
    items: [
      {
        active: "dashboard",
        description: "거래처, 코스, 신규 리드를 지도에서 관리",
        href: "/dashboard",
        icon: MapPinned,
        label: "지도 홈"
      }
    ]
  },
  {
    label: "운영",
    items: [
      {
        active: "customers-summary",
        description: "거래처 수, 등급, 보완 상태",
        href: "/crm/summary",
        icon: LayoutDashboard,
        label: "전체 현황"
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
        description: "상세, 메모, 첨부 관리",
        href: "/crm/timeline",
        icon: Building2,
        label: "거래처 관리"
      },
      {
        active: "data-management",
        description: "업로드, 저장, 누락 확인",
        href: "/customers/data",
        icon: Database,
        label: "등록 이력 조회"
      }
    ]
  },
  {
    label: "성장",
    items: [
      {
        active: "revenue",
        description: "기회, 이탈, 업셀링 후보",
        href: "/revenue/pipeline",
        icon: BarChart3,
        label: "기회 관리"
      },
      {
        active: "revenue-ledger",
        description: "ERP 매출 원장 조회",
        href: "/revenue/transactions",
        icon: ReceiptText,
        label: "거래내역"
      },
      {
        active: "billing",
        description: "카드 자동결제, 이용료 청구 이력",
        href: "/revenue/billing",
        icon: CreditCard,
        label: "결제 관리"
      },
      {
        active: "assistant",
        description: "견적, 메모, 후속 액션",
        href: "/assistant",
        icon: Sparkles,
        label: "AI 영업"
      },
      {
        active: "report",
        description: "회사 건강도와 실행 제안",
        href: "/reports/latest",
        icon: HeartPulse,
        label: "AI 리포트"
      }
    ]
  }
  // "관리 > 회사 설정" 그룹은 2026-08-24 피드백("설정 이모티콘으로 갈음하면 될 것 같아")에 따라
  // 제거했습니다. 동일한 /dashboard/settings 링크가 CustomerAppShell 하단 바의 설정(Settings)
  // 아이콘으로 이미 노출되고 있어 중복이었습니다.
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
    { active: "customers" as const, helper: "원장", icon: Building2, label: "거래처" },
    { active: "revenue" as const, helper: "기회", icon: BarChart3, label: "매출" }
  ];
}

export const customerUtilityActions = {
  assistant: { icon: MessageSquareText, label: "AI" },
  settings: { icon: Settings, label: "설정" }
};

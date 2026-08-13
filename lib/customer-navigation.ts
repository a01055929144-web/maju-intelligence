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
  ReceiptText,
  Settings,
  Sparkles
} from "lucide-react";

export type CustomerWorkspaceKey =
  | "dashboard"
  | "customers"
  | "routes"
  | "revenue"
  | "revenue-ledger"
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
        badge: "메인",
        description: "지도에서 거래처, 배송차, 경유 코스 관리",
        href: "/dashboard",
        icon: MapPinned,
        label: "지도 홈"
      }
    ]
  },
  {
    label: "현장 운영",
    items: [
      {
        active: "customers",
        description: "거래처 등록, 원장, 저장 이력을 같은 기준으로 관리",
        href: "/",
        icon: Building2,
        label: "거래처 데이터",
        children: [
          {
            active: "customers",
            description: "전체 거래처, 등급, 보완 상태를 요약해서 봅니다.",
            href: "/crm/timeline#customer-ledger-summary",
            icon: LayoutDashboard,
            label: "거래처 전체 현황"
          },
          {
            active: "data",
            description: "거래처 기본정보와 매출 거래내역 입력",
            href: "/",
            icon: FileSpreadsheet,
            label: "데이터 등록"
          },
          {
            active: "customers",
            description: "거래처 상세, 메모, 첨부자료 관리",
            href: "/crm/timeline",
            icon: Building2,
            label: "거래처 관리"
          },
          {
            active: "data-management",
            description: "업로드 이력, DB 반영, 누락 상태 확인",
            href: "/customers/data",
            icon: Database,
            label: "저장 이력"
          }
        ]
      }
    ]
  },
  {
    label: "성장",
    items: [
      {
        active: "revenue",
        description: "성장 기회, 이탈 징후, 업셀링 후보 확인",
        href: "/revenue/pipeline",
        icon: BarChart3,
        label: "매출 인사이트"
      },
      {
        active: "revenue-ledger",
        description: "ERP 업로드 매출 원본 데이터 조회",
        href: "/revenue/transactions",
        icon: ReceiptText,
        label: "매출 내역"
      },
      {
        active: "assistant",
        description: "견적, 방문 메모, 후속 액션 초안",
        href: "/assistant",
        icon: Sparkles,
        label: "AI 영업 도우미"
      },
      {
        active: "report",
        description: "회사 건강도와 AI 진단 리포트",
        href: "/reports/latest",
        icon: HeartPulse,
        label: "AI 리포트"
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
    { active: "dashboard" as const, helper: "홈", icon: MapPinned, label: "지도" },
    { active: "customers" as const, helper: "관리", icon: Building2, label: "거래처" },
    { active: "revenue" as const, helper: "성장", icon: BarChart3, label: "매출" }
  ];
}

export const customerUtilityActions = {
  assistant: { icon: MessageSquareText, label: "AI 도우미" },
  settings: { icon: Settings, label: "설정" }
};

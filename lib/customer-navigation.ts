import {
  BarChart3,
  Building2,
  Database,
  FileSpreadsheet,
  HeartPulse,
  LucideIcon,
  MapPinned,
  MessageSquareText,
  ReceiptText,
  Route,
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
    label: "메인",
    items: [
      {
        active: "dashboard",
        badge: "메인",
        description: "거래처 위치, 현황, 다음 업무를 지도에서 확인",
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
        active: "routes",
        description: "배송차, 경유 순서, 출발지 기준 거리",
        href: "/routes/today",
        icon: Route,
        label: "영업·배송 코스"
      },
      {
        active: "customers",
        description: "거래처와 매출 데이터를 등록하고, 기존 거래처 정보를 조회·수정하며 데이터 상태를 관리",
        href: "/",
        icon: Building2,
        label: "거래처 관리",
        children: [
          {
            active: "data",
            description: "아직 없는 거래처 또는 매출 데이터를 새로 등록",
            href: "/",
            icon: FileSpreadsheet,
            label: "등록"
          },
          {
            active: "customers",
            description: "등록된 거래처를 검색·조회하고 상세 정보와 운영 상태를 수정",
            href: "/crm/timeline",
            icon: Building2,
            label: "거래처 원장"
          },
          {
            active: "data-management",
            description: "데이터 등록 이력과 누락·미매칭·정합성 문제를 확인하고 관리",
            href: "/customers/data",
            icon: Database,
            label: "데이터 관리"
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
        description: "거래처별 매출 변화를 분석해 성장 기회, 이탈 징후, 업셀링 후보와 다음 액션을 찾음",
        href: "/revenue/pipeline",
        icon: BarChart3,
        label: "매출 인사이트"
      },
      {
        active: "revenue-ledger",
        description: "ERP 또는 업로드로 수집된 거래처별 실제 매출 원본 데이터를 조회",
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
        description: "회사 정보, 출발지, 운영 기준값",
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
    { active: "dashboard" as const, helper: "현황", icon: MapPinned, label: "지도 홈" },
    { active: "routes" as const, helper: "코스", icon: Route, label: "영업·배송" },
    { active: "customers" as const, helper: "원장", icon: Building2, label: "거래처" },
    { active: "revenue" as const, helper: "성장", icon: BarChart3, label: "매출" }
  ];
}

export const customerUtilityActions = {
  assistant: { icon: MessageSquareText, label: "AI 도우미" },
  settings: { icon: Settings, label: "설정" }
};

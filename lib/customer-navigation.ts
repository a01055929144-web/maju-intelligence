import {
  BarChart3,
  Building2,
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
  | "data";

export type CustomerNavigationItem = {
  readonly active: CustomerWorkspaceKey;
  readonly badge?: string;
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
    label: "지도 홈",
    items: [
      {
        active: "dashboard",
        badge: "메인",
        description: "거래처 위치와 회사 현황을 지도에서 먼저 확인",
        href: "/dashboard",
        icon: MapPinned,
        label: "지도 홈"
      }
    ]
  },
  {
    label: "지도 기반 업무",
    items: [
      {
        active: "routes",
        description: "배송차별 매장, 경유 순서, 출발지 기준 거리 확인",
        href: "/routes/today",
        icon: Route,
        label: "영업·배송 코스"
      },
      {
        active: "customers",
        description: "거래처 기본정보, 첨부자료, 메모 히스토리 관리",
        href: "/crm/timeline",
        icon: Building2,
        label: "거래처 원장"
      }
    ]
  },
  {
    label: "성장 분석",
    items: [
      {
        active: "revenue",
        description: "매출 기회, 이탈 징후, 업셀링 후보 확인",
        href: "/revenue/pipeline",
        icon: BarChart3,
        label: "매출 성장"
      },
      {
        active: "revenue-ledger",
        description: "ERP 거래원장 업로드와 거래처별 매출 내역 확인",
        href: "/revenue/transactions",
        icon: ReceiptText,
        label: "매출 거래내역"
      },
      {
        active: "assistant",
        description: "견적, 방문 메모, 후속 액션 초안 작성",
        href: "/assistant",
        icon: Sparkles,
        label: "AI 영업 도우미"
      },
      {
        active: "report",
        description: "Company Health Score와 회사 진단 리포트 확인",
        href: "/reports/latest",
        icon: HeartPulse,
        label: "AI 리포트"
      }
    ]
  },
  {
    label: "데이터 / 설정",
    items: [
      {
        active: "data",
        description: "거래처 마스터와 매출 거래내역 등록",
        href: "/",
        icon: FileSpreadsheet,
        label: "데이터 등록"
      },
      {
        active: "settings",
        description: "회사 정보, 출발지, 운영 기준값 관리",
        href: "/dashboard/settings",
        icon: Settings,
        label: "회사 설정"
      }
    ]
  }
];

export function getCustomerWorkspaceLabel(active: CustomerWorkspaceKey) {
  return customerNavigationGroups.flatMap((group) => group.items).find((item) => item.active === active)?.label || "지도 홈";
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

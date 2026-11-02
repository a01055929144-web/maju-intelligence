import { CalendarClock, FileText, History } from "lucide-react";
import { WorkspaceSectionNav, type WorkspaceSectionNavItem } from "@/components/workspace-section-nav";

// 0033 지시서 2절: 영업 관리는 탭 3개만 둔다. 보류 모듈 경로(/revenue/pipeline, /sales/performance)로는 링크하지 않는다.
// 기존 섹션 값(summary · basis · status · candidates · performance · products)은 아직 그 화면들이 이 부품을 쓰므로 타입에만 남긴다.
type SalesWorkspaceSection = "basis" | "candidates" | "contacts" | "documents" | "followup" | "performance" | "products" | "quotes" | "status" | "summary";

type SalesWorkspaceNavProps = {
  readonly active: SalesWorkspaceSection;
  readonly companyId?: string;
  readonly contactCount?: number;
  readonly followUpCount?: number;
  readonly pipelineCount?: number;
  readonly quoteCount?: number;
  readonly showProducts?: boolean;
};

function scopedHref(path: string, companyId?: string) {
  if (!companyId) return path;
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("companyId", companyId);
  return `${pathname}?${params.toString()}`;
}

export function salesWorkspaceNavItems({ active, companyId, contactCount, followUpCount, quoteCount }: SalesWorkspaceNavProps): WorkspaceSectionNavItem[] {
  return [
    { active: active === "contacts", badge: contactCount === undefined ? undefined : `${contactCount}건`, description: "전화·문자·방문 기록", href: scopedHref("/revenue/contacts", companyId), icon: History, label: "컨택 기록" },
    { active: active === "documents" || active === "quotes", badge: quoteCount === undefined ? undefined : `${quoteCount}건`, description: "보낸 단가표·견적, 열람·수락", href: scopedHref("/revenue/pricing/documents", companyId), icon: FileText, label: "보낸 문서·견적" },
    { active: active === "followup" || active === "candidates" || active === "status", badge: followUpCount === undefined ? undefined : `${followUpCount}건`, description: "오늘·기한 지난 재연락", href: scopedHref("/revenue/contacts?due=action", companyId), icon: CalendarClock, label: "후속 대상" }
  ];
}

export function SalesWorkspaceNav(props: SalesWorkspaceNavProps) {
  return <WorkspaceSectionNav eyebrow="영업 관리" items={salesWorkspaceNavItems(props)} />;
}

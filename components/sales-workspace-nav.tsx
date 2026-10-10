import { BarChart3, CalendarClock, FileText, History, PackageSearch, Percent, ReceiptText, TrendingUp } from "lucide-react";
import { WorkspaceSectionNav, type WorkspaceSectionNavItem } from "@/components/workspace-section-nav";

type SalesWorkspaceSection = "basis" | "candidates" | "contacts" | "performance" | "products" | "quotes" | "status" | "summary";

type SalesWorkspaceNavProps = {
  readonly active: SalesWorkspaceSection;
  readonly companyId?: string;
  readonly contactCount?: number;
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

export function SalesWorkspaceNav({
  active,
  companyId,
  contactCount,
  pipelineCount,
  quoteCount,
  showProducts = true
}: SalesWorkspaceNavProps) {
  const items: WorkspaceSectionNavItem[] = [
    { active: active === "summary", badge: pipelineCount === undefined ? undefined : `${pipelineCount}건`, description: "예상매출과 전환율", href: scopedHref("/revenue/pipeline", companyId), icon: TrendingUp, label: "현황" },
    { active: active === "basis", description: "방문·원장 연결 기준", href: scopedHref("/revenue/pipeline?section=basis", companyId), icon: FileText, label: "기준" },
    { active: active === "status", description: "견적·관심·보류 상태", href: scopedHref("/revenue/pipeline?section=status", companyId), icon: Percent, label: "상태" },
    { active: active === "candidates", description: "후속 영업 대상", href: scopedHref("/revenue/pipeline?section=candidates", companyId), icon: ReceiptText, label: "후보" },
    { active: active === "quotes", badge: quoteCount === undefined ? undefined : `${quoteCount}건`, description: "발행·유효기간·공유", href: scopedHref("/revenue/pipeline?section=quotes", companyId), icon: CalendarClock, label: "견적" },
    { active: active === "contacts", badge: contactCount === undefined ? undefined : `${contactCount}건`, description: "컨택·후속 일정", href: scopedHref("/revenue/contacts", companyId), icon: History, label: "컨택" }
  ];

  if (showProducts) {
    items.push({ active: active === "products", description: "매입·판매 품목 연결", href: scopedHref("/revenue/products", companyId), icon: PackageSearch, label: "상품" });
  }

  items.push({ active: active === "performance", description: "담당자별 목표와 실적", href: scopedHref("/sales/performance", companyId), icon: BarChart3, label: "성과" });

  return <WorkspaceSectionNav eyebrow="영업 관리" items={items} />;
}

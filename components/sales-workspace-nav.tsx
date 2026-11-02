import { WorkspaceSectionNav } from "@/components/workspace-section-nav";
import { salesWorkspaceNavItems, type SalesWorkspaceNavProps } from "@/components/sales-workspace-nav-items";

export { salesWorkspaceNavItems };

export function SalesWorkspaceNav(props: SalesWorkspaceNavProps) {
  return <WorkspaceSectionNav eyebrow="영업 관리" items={salesWorkspaceNavItems(props)} />;
}

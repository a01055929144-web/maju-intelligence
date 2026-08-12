"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Building2, Database, FileSpreadsheet, LucideIcon } from "lucide-react";

type WorkspaceTab = {
  readonly description: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly label: string;
};

const WORKSPACE_TABS: readonly WorkspaceTab[] = [
  { description: "새 거래처·매출 데이터 등록", href: "/", icon: FileSpreadsheet, label: "등록" },
  { description: "거래처 검색·조회·수정", href: "/crm/timeline", icon: Building2, label: "거래처 원장" },
  { description: "등록 이력과 데이터 품질 관리", href: "/customers/data", icon: Database, label: "데이터 관리" }
];

/**
 * Shared tab strip for the 거래처 관리 workspace (등록 / 거래처 원장 / 데이터 관리), which today
 * is still three separate routes rather than one physically merged page — this makes the three
 * routes read as a single tabbed workspace without requiring a risky deep merge of their
 * (very large) implementations. Preserves the companyId query param across tab switches so admin
 * preview mode keeps working.
 */
export function CustomerWorkspaceTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const companyId = searchParams?.get("companyId");

  function hrefWithCompany(href: string) {
    if (!companyId) return href;
    return `${href}${href.includes("?") ? "&" : "?"}companyId=${encodeURIComponent(companyId)}`;
  }

  return (
    <div className="mb-4 flex flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-white p-1.5">
      {WORKSPACE_TABS.map((tab) => {
        const selected = pathname === tab.href;
        return (
          <Link
            className={`flex flex-1 min-w-[120px] items-center gap-2 rounded-md px-3 py-2 text-sm font-black transition ${
              selected ? "bg-teal-700 text-white shadow-[0_4px_10px_rgba(15,118,110,0.18)]" : "text-slate-600 hover:bg-slate-50"
            }`}
            href={hrefWithCompany(tab.href)}
            key={tab.href}
          >
            <tab.icon className={`h-4 w-4 shrink-0 ${selected ? "text-white" : "text-slate-400"}`} />
            <span className="min-w-0">
              <span className="block truncate">{tab.label}</span>
              <span className={`block truncate text-[11px] font-bold ${selected ? "text-teal-100" : "text-slate-400"}`}>{tab.description}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

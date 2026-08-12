"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, Database, FileSpreadsheet, LucideIcon } from "lucide-react";

type WorkspaceTab = {
  readonly href: string;
  readonly icon: LucideIcon;
  readonly label: string;
};

const WORKSPACE_TABS: readonly WorkspaceTab[] = [
  { href: "/", icon: FileSpreadsheet, label: "기본정보 등록" },
  { href: "/crm/timeline", icon: Building2, label: "원장 조회" },
  { href: "/customers/data", icon: Database, label: "저장 이력" }
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
  const [companyId, setCompanyId] = useState("");

  useEffect(() => {
    setCompanyId(new URLSearchParams(window.location.search).get("companyId") || "");
  }, []);

  function hrefWithCompany(href: string) {
    if (!companyId) return href;
    return `${href}${href.includes("?") ? "&" : "?"}companyId=${encodeURIComponent(companyId)}`;
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1">
      {WORKSPACE_TABS.map((tab) => {
        const selected = pathname === tab.href;
        return (
          <Link
            className={`inline-flex h-9 min-w-[112px] flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-black transition sm:flex-none ${
              selected ? "bg-white text-teal-800 shadow-sm ring-1 ring-inset ring-teal-100" : "text-slate-500 hover:bg-white hover:text-slate-900"
            }`}
            href={hrefWithCompany(tab.href)}
            key={tab.href}
          >
            <tab.icon className={`h-4 w-4 shrink-0 ${selected ? "text-teal-700" : "text-slate-400"}`} />
            <span className="truncate">{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

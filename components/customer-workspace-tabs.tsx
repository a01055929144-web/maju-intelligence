"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, Database, FileSpreadsheet, LucideIcon } from "lucide-react";

type WorkspaceTab = {
  readonly href: string;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly helper: string;
};

const WORKSPACE_TABS: readonly WorkspaceTab[] = [
  { href: "/", icon: FileSpreadsheet, label: "데이터 등록", helper: "거래처·매출 입력" },
  { href: "/crm/timeline", icon: Building2, label: "거래처 관리", helper: "상세·메모·첨부" },
  { href: "/customers/data", icon: Database, label: "등록 이력 조회", helper: "업로드·저장 상태" }
];

/**
 * Shared tab strip for the 거래처 관리 workspace (등록 / 거래처 관리 / 데이터 관리), which today
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
    <nav
      aria-label="거래처 작업 이동"
      className="mb-3 flex items-center gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="hidden min-w-fit items-center gap-2 border-r border-slate-200 px-2.5 lg:flex">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-lime-100 text-slate-800 ring-1 ring-inset ring-lime-200">
          <Building2 className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-xs font-extrabold text-slate-900">거래처 작업</span>
          <span className="block text-[10px] font-semibold text-slate-400">등록부터 이력까지</span>
        </span>
      </div>
      <div className="flex min-w-max flex-1 gap-1.5 lg:grid lg:min-w-0 lg:grid-cols-3">
        {WORKSPACE_TABS.map((tab, index) => {
          const selected = pathname === tab.href;
          return (
            <Link
              aria-current={selected ? "page" : undefined}
              className={`flex h-10 min-w-[148px] items-center gap-2 rounded-lg border px-2.5 text-sm font-bold transition lg:min-w-0 ${
                selected
                  ? "border-teal-700 bg-teal-700 text-white shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
              href={hrefWithCompany(tab.href)}
              key={tab.href}
            >
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px] font-bold ${selected ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>
                {index + 1}
              </span>
              <tab.icon className={`h-3.5 w-3.5 shrink-0 ${selected ? "text-white" : "text-slate-400"}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{tab.label}</span>
                <span className={`hidden truncate text-[10px] font-semibold xl:block ${selected ? "text-white/70" : "text-slate-400"}`}>{tab.helper}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

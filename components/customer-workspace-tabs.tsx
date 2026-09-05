"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Building2, Database, FileSpreadsheet, LucideIcon } from "lucide-react";

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

  const currentIndex = Math.max(0, WORKSPACE_TABS.findIndex((tab) => pathname === tab.href));
  const nextTab = WORKSPACE_TABS[currentIndex + 1];

  return (
    <div className="mb-3 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-3">
        {WORKSPACE_TABS.map((tab, index) => {
          const selected = pathname === tab.href;
          return (
            <Link
              className={`flex min-h-10 items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm font-black transition ${
                selected
                  ? "border-teal-700 bg-teal-700 text-white shadow-[0_8px_18px_rgba(15,118,110,0.14)]"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
              href={hrefWithCompany(tab.href)}
              key={tab.href}
            >
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-black ${selected ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>
                {index + 1}
              </span>
              <tab.icon className={`h-4 w-4 shrink-0 ${selected ? "text-white" : "text-slate-400"}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{tab.label}</span>
                <span className={`hidden truncate text-[11px] font-bold lg:block ${selected ? "text-white/70" : "text-slate-400"}`}>{tab.helper}</span>
              </span>
            </Link>
          );
        })}
        </div>
        {nextTab ? (
          <Link className="maju-button-secondary h-10 shrink-0 px-3 text-xs" href={hrefWithCompany(nextTab.href)}>
            다음: {nextTab.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <Link className="maju-button-primary h-10 shrink-0 px-3 text-xs" href={hrefWithCompany("/dashboard")}>
            지도에서 확인
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

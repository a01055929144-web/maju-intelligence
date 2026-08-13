"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, Database, FileSpreadsheet, LucideIcon } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

type WorkspaceTab = {
  readonly href: string;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly helper: string;
};

const WORKSPACE_TABS: readonly WorkspaceTab[] = [
  { href: "/", icon: FileSpreadsheet, label: "데이터 등록", helper: "거래처·매출 입력" },
  { href: "/crm/timeline", icon: Building2, label: "거래처 관리", helper: "상세·메모·첨부" },
  { href: "/customers/data", icon: Database, label: "저장 이력", helper: "업로드·DB 상태" }
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
    <div className="mb-3 rounded-lg border border-slate-200 bg-white shadow-sm">
      <SectionHeader
        badge={
          <span className="w-fit shrink-0 rounded-md bg-teal-50 px-2.5 py-1 text-[11px] font-black text-teal-800 ring-1 ring-inset ring-teal-100">
            DB 기준 작업공간
          </span>
        }
        description="등록, 거래처 관리, 저장 이력을 같은 거래처 기준으로 확인합니다."
        title="거래처 데이터 관리"
      />
      <div className="grid gap-2 bg-slate-50/70 p-2 sm:grid-cols-3">
        {WORKSPACE_TABS.map((tab, index) => {
          const selected = pathname === tab.href;
          return (
            <Link
              className={`flex min-h-12 items-center gap-3 rounded-md border px-3 py-2 text-sm font-black transition ${
                selected
                  ? "border-teal-200 bg-white text-teal-800 shadow-sm ring-1 ring-inset ring-teal-100"
                  : "border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"
              }`}
              href={hrefWithCompany(tab.href)}
              key={tab.href}
            >
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md text-[11px] font-black ${selected ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-500"}`}>
                {index + 1}
              </span>
              <tab.icon className={`h-4 w-4 shrink-0 ${selected ? "text-teal-700" : "text-slate-400"}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{tab.label}</span>
                <span className={`mt-0.5 block truncate text-[11px] font-bold ${selected ? "text-teal-700" : "text-slate-400"}`}>{tab.helper}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

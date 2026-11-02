"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Building2, CreditCard, FileSpreadsheet, Home, MapPinned, ServerCog, ShieldCheck } from "lucide-react";
import { AppSidebar, type AppSidebarGroup } from "@/components/app-sidebar";
import type { AdminSession } from "@/lib/auth";
import { AdminLogoutButton } from "@/app/admin/logout-button";

const adminNavigation: AppSidebarGroup[] = [
  {
    label: "관리",
    items: [
      { active: "overview", href: "/admin", icon: Home, label: "관리자 홈" },
      { active: "companies", href: "/admin/companies", icon: Building2, label: "고객사 관리" },
      { active: "map", href: "/admin/map", icon: MapPinned, label: "지도·현황" },
      { active: "billing", href: "/admin/billing", icon: CreditCard, label: "결제 관리" },
      { active: "uploads", href: "/admin/uploads", icon: FileSpreadsheet, label: "가져오기 이력" },
      { active: "accounts", href: "/admin/accounts", icon: ShieldCheck, label: "계정 관리" },
      { active: "system", href: "/admin/system", icon: ServerCog, label: "시스템 점검" }
    ]
  }
];

export function AdminAppShell({ adminMapEnabled, children, session }: { readonly adminMapEnabled: boolean; readonly children: ReactNode; readonly session: AdminSession }) {
  const pathname = usePathname();
  if (pathname === "/admin/login") return children;
  const navigation = adminMapEnabled ? adminNavigation : adminNavigation.map((group) => ({ ...group, items: group.items.filter((item) => item.active !== "map") }));

  return (
    <div className="maju-app-bg flex min-h-screen flex-col lg:flex-row">
      <AppSidebar brand="MAJU 관리자" context={session.name} groups={navigation} homeHref="/admin" storageScope={session.userId || session.email} renderFooter={(collapsed) => <div className={collapsed ? "flex justify-center" : "flex items-center justify-between gap-2"}>{!collapsed ? <div className="min-w-0"><p className="truncate text-sm font-bold text-white">{session.name}</p><p className="truncate text-[11px] font-semibold text-white/60">{session.role}</p></div> : null}<AdminLogoutButton compact={collapsed} sidebar /></div>} variant="admin" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

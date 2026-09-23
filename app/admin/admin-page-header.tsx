import Link from "next/link";
import { Building2, CreditCard, Database, FileSpreadsheet, Home, ServerCog, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AdminSession } from "@/lib/auth";
import { AdminLogoutButton } from "./logout-button";

type AdminNavKey = "accounts" | "billing" | "companies" | "overview" | "system" | "uploads";

type AdminPageHeaderProps = {
  readonly active: AdminNavKey;
  readonly badge: string;
  readonly session: AdminSession;
  readonly subtitle: string;
  readonly title: string;
};

const navItems = [
  { active: "overview", href: "/admin", icon: Home, label: "운영 현황" },
  { active: "companies", href: "/admin/companies", icon: Building2, label: "고객사 관리" },
  { active: "billing", href: "/admin/billing", icon: CreditCard, label: "결제 관리" },
  { active: "uploads", href: "/admin/uploads", icon: FileSpreadsheet, label: "업로드·분석" },
  { active: "accounts", href: "/admin/accounts", icon: ShieldCheck, label: "전역 계정" },
  { active: "system", href: "/admin/system", icon: ServerCog, label: "시스템 점검" }
] satisfies Array<{ active: AdminNavKey; href: string; icon: typeof Database; label: string }>;

export function AdminPageHeader({ active, badge, session, subtitle, title }: AdminPageHeaderProps) {
  return (
    <header className="border-b border-slate-800 bg-[#101827] text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <Badge className="mb-2 bg-lime-200 text-slate-950 ring-1 ring-inset ring-lime-300">{badge}</Badge>
          <h1 className="truncate text-[26px] font-bold tracking-[-0.035em] text-white">{title}</h1>
          <p className="mt-1 text-sm font-medium text-slate-400">
            {subtitle} · {session.name} · {session.role}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {navItems.map((item) => {
            const selected = item.active === active;
            return (
              <Link
                key={item.href}
                className={`maju-nav-item justify-center border ${
                  selected ? "border-lime-300 bg-lime-200 text-slate-950" : "border-white/10 bg-white/[0.04] text-slate-300 shadow-none hover:border-white/20 hover:bg-white/10 hover:text-white"
                }`}
                href={item.href}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          <AdminLogoutButton />
        </div>
      </div>
    </header>
  );
}

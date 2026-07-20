import Link from "next/link";
import { Building2, Database, FileSpreadsheet, Home, ServerCog, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AdminSession } from "@/lib/auth";
import { AdminLogoutButton } from "./logout-button";

type AdminNavKey = "accounts" | "companies" | "overview" | "system" | "uploads";

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
  { active: "uploads", href: "/admin/uploads", icon: FileSpreadsheet, label: "업로드·분석" },
  { active: "accounts", href: "/admin/accounts", icon: ShieldCheck, label: "전역 계정" },
  { active: "system", href: "/admin/system", icon: ServerCog, label: "시스템 점검" }
] satisfies Array<{ active: AdminNavKey; href: string; icon: typeof Database; label: string }>;

export function AdminPageHeader({ active, badge, session, subtitle, title }: AdminPageHeaderProps) {
  return (
    <header className="border-b border-slate-200/80 bg-white/[0.78] backdrop-blur-2xl">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <Badge className="mb-2 bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-200">{badge}</Badge>
          <h1 className="truncate text-[26px] font-black tracking-normal text-slate-900">{title}</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            {subtitle} · {session.name} · {session.role}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {navItems.map((item) => {
            const selected = item.active === active;
            return (
              <Link
                key={item.href}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-black transition ${
                  selected ? "border-teal-500 bg-gradient-to-r from-teal-600 to-blue-600 text-white shadow-[0_12px_24px_rgba(13,148,136,0.18)]" : "border-slate-200 bg-white/92 text-slate-700 shadow-[0_1px_0_rgba(15,23,42,0.03)] hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"
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

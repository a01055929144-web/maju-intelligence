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
  { active: "overview", href: "/admin", icon: Home, label: "운영 홈" },
  { active: "companies", href: "/admin/companies", icon: Building2, label: "고객사 선택·관리" },
  { active: "uploads", href: "/admin/uploads", icon: FileSpreadsheet, label: "업로드 이력" },
  { active: "accounts", href: "/admin/accounts", icon: ShieldCheck, label: "계정 관리" },
  { active: "system", href: "/admin/system", icon: ServerCog, label: "시스템 점검" }
] satisfies Array<{ active: AdminNavKey; href: string; icon: typeof Database; label: string }>;

export function AdminPageHeader({ active, badge, session, subtitle, title }: AdminPageHeaderProps) {
  return (
    <header className="border-b border-border bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <Badge className="mb-2 bg-primary/10 text-primary">{badge}</Badge>
          <h1 className="truncate text-2xl font-black">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {subtitle} · {session.name} · {session.role}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {navItems.map((item) => {
            const selected = item.active === active;
            return (
              <Link
                key={item.href}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${
                  selected ? "border-slate-950 bg-slate-950 text-white" : "border-border bg-white text-slate-700 hover:bg-muted"
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

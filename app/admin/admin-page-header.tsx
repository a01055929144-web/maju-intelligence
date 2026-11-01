import { Badge } from "@/components/ui/badge";
import type { AdminSession } from "@/lib/auth";

type AdminNavKey = "accounts" | "billing" | "companies" | "overview" | "system" | "uploads";

type AdminPageHeaderProps = {
  readonly active: AdminNavKey;
  readonly badge: string;
  readonly session: AdminSession;
  readonly subtitle: string;
  readonly title: string;
};

export function AdminPageHeader({ badge, session, subtitle, title }: AdminPageHeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2"><Badge className="bg-violet-100 text-violet-900">{badge}</Badge><span className="text-xs font-semibold text-slate-500">{session.name} · {session.role}</span></div>
          <h1 className="truncate text-[24px] font-bold tracking-[-0.03em] text-slate-950">{title}</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">{subtitle}</p>
        </div>
      </div>
    </header>
  );
}

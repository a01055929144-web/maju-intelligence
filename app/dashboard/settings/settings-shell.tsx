import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CustomerAppShell } from "@/components/customer-app-shell";
import type { CustomerSession } from "@/lib/auth";

const SETTINGS_TABS = [
  ["/dashboard/settings/company", "회사 정보"],
  ["/dashboard/settings/staff", "직원 관리"],
  ["/dashboard/settings/routes", "권역·호차"],
  ["/dashboard/settings/advanced", "고급 설정"]
] as const;

export function SettingsShell({ activePath, children, session, showHoldModules, subtitle, title }: {
  activePath: string;
  children: ReactNode;
  session: CustomerSession;
  showHoldModules: boolean;
  subtitle: string;
  title: string;
}) {
  const workspaceActive = activePath === "/dashboard/settings/staff" ? "settings-staff" : activePath === "/dashboard/settings/routes" ? "territory" : "settings";
  return (
    <CustomerAppShell active={workspaceActive} companyName={session.companyName} rightAction={<Link className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50" href="/dashboard"><ArrowLeft className="h-4 w-4" />지도</Link>} showHoldModules={showHoldModules} subtitle={subtitle} title={title} userName={session.operationalDisplayName || session.invitedEmployeeName || session.name} workspaceRole={session.workspaceRole}>
      <section className="mx-auto max-w-[1560px] px-3 py-3 sm:px-4 sm:py-4">
        <nav aria-label="회사 설정 페이지" className="maju-toolbar-scroll mb-4 flex items-center gap-1 overflow-x-auto border-b border-slate-200">
          {SETTINGS_TABS.filter(([href]) => href !== "/dashboard/settings/advanced" || session.workspaceRole === "owner").map(([href, label]) => <Link className={`flex h-11 shrink-0 items-center border-b-2 px-3 text-sm font-semibold transition ${activePath === href ? "border-teal-700 text-teal-800" : "border-transparent text-slate-500 hover:bg-slate-100/70 hover:text-slate-950"}`} href={href} key={href}>{label}</Link>)}
        </nav>
        <div className="space-y-5">{children}</div>
      </section>
    </CustomerAppShell>
  );
}

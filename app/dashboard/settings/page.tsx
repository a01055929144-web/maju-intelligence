import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { AccountConnectionsPanel } from "@/components/account-connections-panel";
import { customerHasCapability, getCustomerSession } from "@/lib/auth";
import { getBusinessNumberExceptions, getCompanySettings, getCompanyStaffInvitations, getCustomerAuthConnections } from "@/lib/store";
import { BusinessNumberExceptionsPanel } from "./business-number-exceptions-panel";
import { CompanySettingsForm } from "./settings-form";
import { StaffManagementPanel } from "./staff-management-panel";
import { StaffRouteCostSummaryPanel } from "./staff-route-cost-summary-panel";

export default async function CompanySettingsPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/dashboard/login");

  const [company, staff, businessNumberExceptions, authConnections] = await Promise.all([
    getCompanySettings(session.companyId, session.companyName),
    getCompanyStaffInvitations(session.companyId).catch(() => ({ invitations: [], persisted: false })),
    getBusinessNumberExceptions(session.companyId).catch(() => ({ exceptions: [], persisted: false })),
    getCustomerAuthConnections({ email: session.email, userId: session.userId }).catch(() => [])
  ]);

  return (
    <CustomerAppShell
      active="settings"
      companyName={session.companyName}
      rightAction={
          <Link
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800"
            href="/dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
            대시보드
          </Link>
      }
      subtitle="회사 정보와 물류 출발지"
      title="회사 설정"
      userName={session.name}
      workspaceRole={session.workspaceRole}
    >
      <section className="mx-auto max-w-[1560px] px-4 py-4 sm:px-4">
        <div className="space-y-5">
          <AccountConnectionsPanel connections={authConnections} />
          <CompanySettingsForm initial={company} />
          <StaffManagementPanel canManageMembers={customerHasCapability(session, "manage_members")} initialInvitations={staff.invitations} />
          <StaffRouteCostSummaryPanel />
          <BusinessNumberExceptionsPanel initialExceptions={businessNumberExceptions.exceptions} />
        </div>
      </section>
    </CustomerAppShell>
  );
}

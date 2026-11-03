import { redirect } from "next/navigation";
import { customerHasCapability, getCustomerSession } from "@/lib/auth";
import { areHoldModulesEnabled } from "@/lib/feature-modules";
import { getCompanyJobTitles, getCompanySettings, getCompanyStaffInvitations, getCustomerAssignmentOptionValues } from "@/lib/store";
import { SettingsShell } from "../settings-shell";
import { StaffManagementPanel } from "../staff-management-panel";
import { RoleSettingsPanel } from "../role-settings-panel";

export default async function StaffSettingsPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/dashboard/login");
  const [staff, jobTitles, assignmentOptions, company] = await Promise.all([
    getCompanyStaffInvitations(session.companyId, { includeMatchedCustomerCounts: false }).catch(() => ({ invitations: [], persisted: false })),
    getCompanyJobTitles(session.companyId).catch(() => ({ jobTitles: [], persisted: false })),
    getCustomerAssignmentOptionValues(session.companyId).catch(() => ({ managers: [], vehicles: [] })),
    getCompanySettings(session.companyId, session.companyName).catch(() => null)
  ]);
  return (
    <SettingsShell activePath="/dashboard/settings/staff" session={session} showHoldModules={areHoldModulesEnabled(session.companyId)} subtitle="직원 이름, 권한과 담당 업무를 관리합니다." title="직원 관리">
      {process.env.ROLE_PERMISSIONS_ENABLED === "true" ? <RoleSettingsPanel /> : null}
      <StaffManagementPanel
        canManageMembers={customerHasCapability(session, "manage_members")}
        companyDisplayName={company?.name || session.companyName}
        initialInvitations={staff.invitations}
        initialJobTitles={jobTitles.jobTitles}
        managerOptions={assignmentOptions.managers}
        staffAccessV2Enabled={process.env.STAFF_ACCESS_V2_ENABLED === "true"}
        vehicleOptions={assignmentOptions.vehicles}
      />
    </SettingsShell>
  );
}

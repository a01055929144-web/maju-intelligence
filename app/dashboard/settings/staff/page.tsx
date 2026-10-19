import { redirect } from "next/navigation";
import { customerHasCapability, getCustomerSession } from "@/lib/auth";
import { areHoldModulesEnabled } from "@/lib/feature-modules";
import { getCompanyJobTitles, getCompanyStaffInvitations, getCustomerAssignmentOptionValues } from "@/lib/store";
import { SettingsShell } from "../settings-shell";
import { StaffManagementPanel } from "../staff-management-panel";

export default async function StaffSettingsPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/dashboard/login");
  const [staff, jobTitles, assignmentOptions] = await Promise.all([
    getCompanyStaffInvitations(session.companyId, { includeMatchedCustomerCounts: false }).catch(() => ({ invitations: [], persisted: false })),
    getCompanyJobTitles(session.companyId).catch(() => ({ jobTitles: [], persisted: false })),
    getCustomerAssignmentOptionValues(session.companyId).catch(() => ({ managers: [], vehicles: [] }))
  ]);
  return (
    <SettingsShell activePath="/dashboard/settings/staff" session={session} showHoldModules={areHoldModulesEnabled(session.companyId)} subtitle="직원 이름, 권한과 담당 업무를 관리합니다." title="직원 관리">
      <StaffManagementPanel canManageMembers={customerHasCapability(session, "manage_members")} initialInvitations={staff.invitations} initialJobTitles={jobTitles.jobTitles} managerOptions={assignmentOptions.managers} vehicleOptions={assignmentOptions.vehicles} />
    </SettingsShell>
  );
}

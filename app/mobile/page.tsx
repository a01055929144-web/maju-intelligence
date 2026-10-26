import { redirect } from "next/navigation";
import { getCustomerOperationalName, getCustomerSession } from "@/lib/auth";
import { normalizeWorkspaceRole } from "@/lib/workspace";
import { isLegacyDeliveryOwner, resolveMobileStaffLanding } from "@/domains/organization/staff-access";
import { getStaffMobileAccess } from "@/lib/store/07-staff-access";

export default async function MobileEntryPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/dashboard/login?returnTo=/mobile");
  if (session.userId && process.env.STAFF_ACCESS_V2_ENABLED === "true") {
    const access = await getStaffMobileAccess({
      companyId: session.companyId,
      driverName: getCustomerOperationalName(session),
      userId: session.userId
    });
    if (session.duties?.length) access.duties = session.duties;
    if (access.duties.length) redirect(resolveMobileStaffLanding(access));
  }
  const role = normalizeWorkspaceRole(session.workspaceRole);
  const deliveryOwner = isLegacyDeliveryOwner({
    assignedVehicle: session.assignedVehicle,
    staffAccessV2Enabled: process.env.STAFF_ACCESS_V2_ENABLED === "true",
    workspaceRole: role
  });
  redirect(role === "driver" || deliveryOwner ? "/mobile/today" : "/mobile/sales");
}


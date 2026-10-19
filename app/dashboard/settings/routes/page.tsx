import { redirect } from "next/navigation";
import { listVehicleMaster } from "@/application/delivery/manage-vehicle-master";
import { customerHasCapability, getCustomerSession } from "@/lib/auth";
import { areHoldModulesEnabled } from "@/lib/feature-modules";
import { getCompanyStaffMemberOptions, getDeliveryTerritories, listDeliveryRouteUnits, vehicleMasterRepository } from "@/lib/store";
import { RouteUnitManagementPanel } from "../route-unit-management-panel";
import { SettingsShell } from "../settings-shell";
import { TerritoryManagementPanel } from "../territory-management-panel";

export default async function RouteSettingsPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/dashboard/login");
  const [territories, staff, routeUnits, vehicleMaster] = await Promise.all([
    getDeliveryTerritories(session.companyId).catch(() => []),
    getCompanyStaffMemberOptions(session.companyId).catch(() => []),
    listDeliveryRouteUnits(session.companyId).catch(() => []),
    listVehicleMaster(vehicleMasterRepository, session.companyId).catch(() => ({ available: false, vehicles: [] }))
  ]);
  const canManage = customerHasCapability(session, "manage_company");
  return (
    <SettingsShell activePath="/dashboard/settings/routes" session={session} showHoldModules={areHoldModulesEnabled(session.companyId)} subtitle="배송 권역과 호차·차량 연결을 관리합니다." title="권역·호차">
      <TerritoryManagementPanel canManage={canManage} initialStaff={staff} initialTerritories={territories} />
      <RouteUnitManagementPanel canManage={canManage} initialRouteUnits={routeUnits} initialStaff={staff} initialTerritories={territories} initialVehicles={vehicleMaster.vehicles} />
    </SettingsShell>
  );
}

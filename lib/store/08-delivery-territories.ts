import { resolveCompanyStaffDisplayName } from "../../domains/organization/staff-display-name";
import { normalizeAdministrativeArea } from "../../domains/organization/sales-area";
import type { CompanyStaffMemberOption, CustomerTerritoryRecommendation, DeliveryTerritoryItem } from "../store";
import { isProductionStoreConfigured, supabaseRequest } from "./00-core";

export type TerritoryResolutionContext = {
  territories: DeliveryTerritoryItem[];
  staff: CompanyStaffMemberOption[];
};

export async function loadTerritoryResolutionContext(companyId: string): Promise<TerritoryResolutionContext> {
  const [territories, staff] = await Promise.all([
    getDeliveryTerritories(companyId),
    getCompanyStaffMemberOptions(companyId)
  ]);
  return { territories, staff };
}

export function assignCustomerByTerritoryFromContext(address: string, context: TerritoryResolutionContext): CustomerTerritoryRecommendation {
  const administrativeArea = normalizeAdministrativeArea(address);
  const territory = context.territories.find(
    (item) => item.isActive && item.areas.some((area) => normalizeAdministrativeArea(area) === administrativeArea)
  );
  if (!territory) return { administrativeArea: administrativeArea || undefined, status: "unassigned" };
  const firstStaff = territory.defaultStaff.slice().sort((a, b) => a.priority - b.priority)[0];
  return {
    administrativeArea: administrativeArea || undefined,
    territoryId: territory.id,
    territoryName: territory.name,
    assignedStaffMemberId: firstStaff?.staffMemberId,
    assignedStaffName: firstStaff?.staffName,
    status: "matched"
  };
}

/** 신규 거래처 등록 시에만 호출하는 공통 권역 추천 함수입니다. 이 함수 자체는 DB를 수정하지 않습니다. */
export async function assignCustomerByTerritory(companyId: string, address: string): Promise<CustomerTerritoryRecommendation> {
  return assignCustomerByTerritoryFromContext(address, await loadTerritoryResolutionContext(companyId));
}

export async function getCompanyStaffMemberOptions(companyId: string): Promise<CompanyStaffMemberOption[]> {
  if (!isProductionStoreConfigured()) return [];
  const rows = await supabaseRequest<Array<{ id: string; role: string; user_id: string; app_users: { name: string | null } | null }>>(
    `company_members?select=id,user_id,role,app_users(name)&company_id=eq.${encodeURIComponent(companyId)}&status=eq.active&order=created_at.asc`
  );
  const userIds = rows.map((row) => row.user_id).filter(Boolean);
  const invitationNames = await getAcceptedStaffInvitationNames(companyId, userIds);
  return rows.map((row) => ({
    id: row.id,
    name: resolveCompanyStaffDisplayName({ appUserName: row.app_users?.name, invitationEmployeeName: invitationNames.get(row.user_id) }),
    role: row.role
  }));
}

/** 직원 설정 선택지에 필요한 문자열만 읽어 거래처 원장 전체 로드를 피합니다. */
export async function getCustomerAssignmentOptionValues(companyId: string) {
  if (!isProductionStoreConfigured()) return { managers: [] as string[], vehicles: [] as string[] };
  const rows = await supabaseRequest<Array<{ delivery_manager: string | null; delivery_vehicle: string | null }>>(
    `normalized_customers?select=delivery_manager,delivery_vehicle&company_id=eq.${encodeURIComponent(companyId)}&order=customer_name.asc&limit=5000`
  );
  const unique = (values: Array<string | null>) =>
    Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "ko"));
  return {
    managers: unique(rows.map((row) => row.delivery_manager)),
    vehicles: unique(rows.map((row) => row.delivery_vehicle))
  };
}

export async function getAcceptedStaffInvitationNames(companyId: string, userIds: string[]) {
  if (!userIds.length) return new Map<string, string>();
  const filter = userIds.map((id) => encodeURIComponent(id)).join(",");
  const rows = await supabaseRequest<Array<{ accepted_by: string | null; employee_name: string | null }>>(
    `staff_invitations?select=accepted_by,employee_name&company_id=eq.${encodeURIComponent(companyId)}&status=eq.accepted&accepted_by=in.(${filter})&order=accepted_at.desc`
  ).catch(() => []);
  const names = new Map<string, string>();
  rows.forEach((row) => {
    if (row.accepted_by && row.employee_name && !names.has(row.accepted_by)) names.set(row.accepted_by, row.employee_name);
  });
  return names;
}

export async function getDeliveryTerritories(companyId: string): Promise<DeliveryTerritoryItem[]> {
  if (!isProductionStoreConfigured()) return [];
  const [territories, areas, assignments, staff] = await Promise.all([
    supabaseRequest<Array<{ id: string; name: string; is_active: boolean }>>(
      `delivery_territories?select=id,name,is_active&company_id=eq.${encodeURIComponent(companyId)}&order=created_at.asc`
    ),
    supabaseRequest<Array<{ territory_id: string; administrative_area: string }>>(
      `delivery_territory_areas?select=territory_id,administrative_area&company_id=eq.${encodeURIComponent(companyId)}&order=administrative_area.asc`
    ),
    supabaseRequest<Array<{ territory_id: string; staff_member_id: string; priority: number; is_active: boolean }>>(
      `territory_staff_assignments?select=territory_id,staff_member_id,priority,is_active&company_id=eq.${encodeURIComponent(companyId)}&assignment_role=eq.customer_default&order=priority.asc`
    ),
    getCompanyStaffMemberOptions(companyId)
  ]);
  const staffById = new Map(staff.map((item) => [item.id, item]));
  return territories.map((territory) => ({
    id: territory.id,
    name: territory.name,
    isActive: territory.is_active,
    areas: areas.filter((area) => area.territory_id === territory.id).map((area) => area.administrative_area),
    defaultStaff: assignments
      .filter((assignment) => assignment.territory_id === territory.id && assignment.is_active)
      .map((assignment) => ({
        staffMemberId: assignment.staff_member_id,
        staffName: staffById.get(assignment.staff_member_id)?.name || "퇴사·미확인 직원",
        priority: assignment.priority
      }))
  }));
}

export async function saveDeliveryTerritory(companyId: string, input: {
  id?: string; name: string; isActive?: boolean; areas: string[]; staffMemberIds: string[];
}): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error("권역명을 입력해주세요.");
  const areas = Array.from(new Set(input.areas.map(normalizeAdministrativeArea).filter(Boolean)));
  const staffMemberIds = Array.from(new Set(input.staffMemberIds.filter(Boolean)));
  const [occupiedAreas, activeStaff] = await Promise.all([
    areas.length
      ? supabaseRequest<Array<{ administrative_area: string; territory_id: string; delivery_territories: { name: string | null } | null }>>(
          `delivery_territory_areas?select=administrative_area,territory_id,delivery_territories(name)&company_id=eq.${encodeURIComponent(companyId)}&administrative_area=in.(${areas.map((area) => encodeURIComponent(area)).join(",")})`
        )
      : Promise.resolve([]),
    getCompanyStaffMemberOptions(companyId)
  ]);
  const conflict = occupiedAreas.find((area) => area.territory_id !== input.id);
  if (conflict) throw new Error(`${conflict.administrative_area}는 ${conflict.delivery_territories?.name || "다른"} 권역에 이미 포함되어 있습니다.`);
  const activeStaffIds = new Set(activeStaff.map((staff) => staff.id));
  const inactiveStaffId = staffMemberIds.find((id) => !activeStaffIds.has(id));
  if (inactiveStaffId) throw new Error("비활성 또는 다른 회사 직원은 권역 담당자로 지정할 수 없습니다.");
  let territoryId = input.id;
  let createdNewTerritory = false;
  const previousTerritory = territoryId
    ? (await supabaseRequest<Array<{ name: string; is_active: boolean }>>(
        `delivery_territories?select=name,is_active&company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(territoryId)}&limit=1`
      ))[0]
    : undefined;
  if (territoryId) {
    if (!previousTerritory) throw new Error("수정할 권역을 찾을 수 없습니다.");
    await supabaseRequest(`delivery_territories?company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(territoryId)}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ name, is_active: input.isActive !== false, updated_at: new Date().toISOString() })
    });
  } else {
    const created = await supabaseRequest<Array<{ id: string }>>("delivery_territories?select=id", {
      method: "POST", body: JSON.stringify({ company_id: companyId, name, is_active: input.isActive !== false })
    });
    territoryId = created[0]?.id;
    createdNewTerritory = true;
  }
  if (!territoryId) throw new Error("권역 저장 결과를 확인하지 못했습니다.");
  const [previousAreas, previousAssignments] = await Promise.all([
    supabaseRequest<Array<{ administrative_area: string }>>(`delivery_territory_areas?select=administrative_area&company_id=eq.${encodeURIComponent(companyId)}&territory_id=eq.${encodeURIComponent(territoryId)}`),
    supabaseRequest<Array<{ staff_member_id: string; priority: number; is_active: boolean }>>(`territory_staff_assignments?select=staff_member_id,priority,is_active&company_id=eq.${encodeURIComponent(companyId)}&territory_id=eq.${encodeURIComponent(territoryId)}&assignment_role=eq.customer_default`)
  ]);
  try {
    await supabaseRequest(`delivery_territory_areas?company_id=eq.${encodeURIComponent(companyId)}&territory_id=eq.${encodeURIComponent(territoryId)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    await supabaseRequest(`territory_staff_assignments?company_id=eq.${encodeURIComponent(companyId)}&territory_id=eq.${encodeURIComponent(territoryId)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    if (input.isActive !== false && areas.length) {
      await supabaseRequest("delivery_territory_areas", { method: "POST", body: JSON.stringify(areas.map((area) => ({ company_id: companyId, territory_id: territoryId, administrative_area: area }))) });
    }
    if (input.isActive !== false && staffMemberIds.length) {
      await supabaseRequest("territory_staff_assignments", {
        method: "POST",
        body: JSON.stringify(staffMemberIds.map((staffMemberId, index) => ({ company_id: companyId, territory_id: territoryId, staff_member_id: staffMemberId, assignment_role: "customer_default", priority: index + 1, is_active: true })))
      });
    }
  } catch (error) {
    // RPC 도입 전 방어선: 교체 중 실패하면 직전 지역·담당자 구성을 최선 노력으로 복원합니다.
    await supabaseRequest(`delivery_territory_areas?company_id=eq.${encodeURIComponent(companyId)}&territory_id=eq.${encodeURIComponent(territoryId)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => null);
    await supabaseRequest(`territory_staff_assignments?company_id=eq.${encodeURIComponent(companyId)}&territory_id=eq.${encodeURIComponent(territoryId)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => null);
    if (previousAreas.length) await supabaseRequest("delivery_territory_areas", { method: "POST", body: JSON.stringify(previousAreas.map((area) => ({ company_id: companyId, territory_id: territoryId, administrative_area: area.administrative_area }))) }).catch(() => null);
    if (previousAssignments.length) await supabaseRequest("territory_staff_assignments", { method: "POST", body: JSON.stringify(previousAssignments.map((assignment) => ({ company_id: companyId, territory_id: territoryId, staff_member_id: assignment.staff_member_id, assignment_role: "customer_default", priority: assignment.priority, is_active: assignment.is_active }))) }).catch(() => null);
    if (createdNewTerritory) {
      await supabaseRequest(`delivery_territories?company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(territoryId)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => null);
    } else if (previousTerritory) {
      await supabaseRequest(`delivery_territories?company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(territoryId)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ name: previousTerritory.name, is_active: previousTerritory.is_active, updated_at: new Date().toISOString() })
      }).catch(() => null);
    }
    throw error;
  }
  return territoryId;
}

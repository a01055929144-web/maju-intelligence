export type StaffAssignmentInput = {
  assignedStaffMemberId?: string | null;
  deliveryManager?: string | null;
};

export type StaffAssignmentOption = {
  id: string;
  name: string;
};

export type TerritoryStaffRecommendation = {
  assignedStaffMemberId?: string;
  assignedStaffName?: string;
};

function normalizeStaffName(name: string) {
  return name.toLocaleLowerCase("ko-KR").replace(/\s+/g, " ");
}

export function resolveNewCustomerStaffAssignment(
  input: StaffAssignmentInput,
  recommendation: TerritoryStaffRecommendation,
  activeStaff: StaffAssignmentOption[]
) {
  if (input.assignedStaffMemberId) {
    const selected = activeStaff.find((staff) => staff.id === input.assignedStaffMemberId);
    return { assignedStaffMemberId: selected?.id, assignedStaffName: input.deliveryManager?.trim() || selected?.name };
  }
  const requestedName = input.deliveryManager?.trim();
  if (requestedName) {
    const normalized = normalizeStaffName(requestedName);
    const matches = activeStaff.filter((staff) => normalizeStaffName(staff.name) === normalized);
    return { assignedStaffMemberId: matches.length === 1 ? matches[0].id : undefined, assignedStaffName: requestedName };
  }
  return {
    assignedStaffMemberId: recommendation.assignedStaffMemberId,
    assignedStaffName: recommendation.assignedStaffName
  };
}

export function resolveExistingCustomerStaffAssignment(
  input: StaffAssignmentInput,
  existing: StaffAssignmentInput,
  activeStaff: StaffAssignmentOption[]
) {
  const requestedName = input.deliveryManager?.trim() || "";
  const currentName = existing.deliveryManager?.trim() || "";
  const managerChanged = requestedName !== currentName;

  if (input.assignedStaffMemberId) {
    const selected = activeStaff.find((staff) => staff.id === input.assignedStaffMemberId);
    if (!selected) throw new Error("선택한 담당자는 현재 활성 직원이 아닙니다.");
    if (requestedName && requestedName !== selected.name.trim()) {
      throw new Error(`담당자명과 연결 직원이 다릅니다. 선택한 직원명은 "${selected.name}"입니다.`);
    }
    return { assignedStaffMemberId: selected.id, assignedStaffName: selected.name.trim() };
  }
  if (!managerChanged) {
    return { assignedStaffMemberId: existing.assignedStaffMemberId || undefined, assignedStaffName: requestedName || undefined };
  }
  const normalized = normalizeStaffName(requestedName);
  const matches = requestedName ? activeStaff.filter((staff) => normalizeStaffName(staff.name) === normalized) : [];
  return {
    assignedStaffMemberId: matches.length === 1 ? matches[0].id : undefined,
    assignedStaffName: requestedName || undefined
  };
}

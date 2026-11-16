import { describe, expect, it } from "vitest";
import {
  resolveExistingCustomerStaffAssignment,
  resolveNewCustomerStaffAssignment
} from "../domains/organization/staff-assignment";

describe("territory customer assignment", () => {
  const staff = [
    { id: "staff-requested", name: "정두영" },
    { id: "staff-territory", name: "강민호" }
  ];
  const recommendation = {
    assignedStaffMemberId: "staff-territory",
    assignedStaffName: "강민호"
  };

  it("uses an explicitly named active staff member instead of the territory default", () => {
    expect(resolveNewCustomerStaffAssignment({ deliveryManager: "정두영" }, recommendation, staff)).toEqual({
      assignedStaffMemberId: "staff-requested",
      assignedStaffName: "정두영"
    });
  });

  it("keeps an unmatched text assignee without attaching a mismatched id", () => {
    expect(resolveNewCustomerStaffAssignment({ deliveryManager: "외부 기사" }, recommendation, staff)).toEqual({
      assignedStaffMemberId: undefined,
      assignedStaffName: "외부 기사"
    });
  });
});

describe("existing customer staff assignment", () => {
  const staff = [
    { id: "staff-gang", name: "강민호" },
    { id: "staff-jeong", name: "정두영" }
  ];

  it("moves both the name snapshot and stable id when the manager changes", () => {
    expect(resolveExistingCustomerStaffAssignment(
      { deliveryManager: "정두영" },
      { deliveryManager: "강민호", assignedStaffMemberId: "staff-gang" },
      staff
    )).toEqual({ assignedStaffMemberId: "staff-jeong", assignedStaffName: "정두영" });
  });

  it("clears an old id for unmatched free text and rejects mismatched id/name", () => {
    expect(resolveExistingCustomerStaffAssignment(
      { deliveryManager: "외부 기사" },
      { deliveryManager: "강민호", assignedStaffMemberId: "staff-gang" },
      staff
    )).toEqual({ assignedStaffMemberId: undefined, assignedStaffName: "외부 기사" });
    expect(() => resolveExistingCustomerStaffAssignment(
      { deliveryManager: "정두영", assignedStaffMemberId: "staff-gang" },
      { deliveryManager: "강민호", assignedStaffMemberId: "staff-gang" },
      staff
    )).toThrow("담당자명과 연결 직원이 다릅니다");
  });
});

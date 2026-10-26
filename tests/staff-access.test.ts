import { describe, expect, it } from "vitest";
import {
  canChangeStaffPermission,
  canGrantStaffPermission,
  getDefaultTemporaryExpiry,
  isLegacyDeliveryOwner,
  legacyRoleToStaffAccess,
  resolveMobileStaffLanding,
  validateStaffAccess
} from "../domains/organization/staff-access";

describe("staff access", () => {
  it("converts legacy roles without guessing custom roles", () => {
    expect(legacyRoleToStaffAccess("driver")).toEqual({ duties: ["delivery"], permissionRole: "staff" });
    expect(legacyRoleToStaffAccess("sales")).toEqual({ duties: ["sales"], permissionRole: "staff" });
    expect(legacyRoleToStaffAccess("owner")).toEqual({ duties: ["sales", "delivery"], permissionRole: "owner" });
    expect(legacyRoleToStaffAccess("냉동창고 관리")).toEqual({ duties: [], permissionRole: "staff" });
  });

  it("allows delivery without a vehicle and requires expiry for temporary workers", () => {
    expect(validateStaffAccess({ duties: ["delivery"], permissionRole: "staff" })).toBeNull();
    expect(validateStaffAccess({ duties: ["sales"], permissionRole: "temporary" })).toContain("만료일");
    expect(validateStaffAccess({ duties: ["sales", "delivery"], permissionRole: "temporary", expiresOn: "2026-11-25" })).toBeNull();
  });

  it("defaults temporary access to 30 days", () => {
    expect(getDefaultTemporaryExpiry(new Date("2026-10-26T00:00:00.000Z"))).toBe("2026-11-25");
  });

  it("routes dual-duty workers to delivery only when a route exists", () => {
    expect(resolveMobileStaffLanding({ duties: ["sales"], hasTodayRoute: true })).toBe("/mobile/sales");
    expect(resolveMobileStaffLanding({ duties: ["delivery"], hasTodayRoute: false })).toBe("/mobile/today");
    expect(resolveMobileStaffLanding({ duties: ["sales", "delivery"], hasTodayRoute: true })).toBe("/mobile/today");
    expect(resolveMobileStaffLanding({ duties: ["sales", "delivery"], hasTodayRoute: false })).toBe("/mobile/sales");
  });

  it("keeps a legacy delivery assignee on the delivery entry after promotion to owner", () => {
    expect(isLegacyDeliveryOwner({ workspaceRole: "owner", assignedVehicle: "의정부", staffAccessV2Enabled: false })).toBe(true);
    expect(isLegacyDeliveryOwner({ workspaceRole: "owner", assignedVehicle: "", staffAccessV2Enabled: false })).toBe(false);
    expect(isLegacyDeliveryOwner({ workspaceRole: "manager", assignedVehicle: "의정부", staffAccessV2Enabled: false })).toBe(false);
    expect(isLegacyDeliveryOwner({ workspaceRole: "owner", assignedVehicle: "의정부", staffAccessV2Enabled: true })).toBe(false);
  });

  it("allows owner grants only from an owner or MAJU admin", () => {
    expect(canGrantStaffPermission("manager", "owner")).toBe(false);
    expect(canGrantStaffPermission("owner", "owner")).toBe(true);
    expect(canGrantStaffPermission("maju_admin", "owner")).toBe(true);
    expect(canChangeStaffPermission("manager", "owner", "manager")).toBe(false);
    expect(canChangeStaffPermission("manager", "owner", "owner")).toBe(false);
    expect(canChangeStaffPermission("manager", "staff", "manager")).toBe(true);
    expect(canChangeStaffPermission("owner", "owner", "manager")).toBe(true);
  });
});

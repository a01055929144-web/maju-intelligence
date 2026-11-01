import { describe, expect, it } from "vitest";
import {
  ROLE_GROUPS,
  normalizeRolePermissionOverrides,
  resolveRolePermissions,
  rolePermissionsAllowCapability
} from "../domains/organization/role-settings";

describe("WO-21 role settings", () => {
  it("keeps field sales mobile-only and accounting out of sales screens", () => {
    expect(ROLE_GROUPS.field_sales.mobileOnly).toBe(true);
    expect(resolveRolePermissions("field_sales")).not.toContain("pc_access");
    expect(ROLE_GROUPS.accounting.label).toBe("경리 (돈 관리)");
    expect(resolveRolePermissions("accounting")).toContain("vouchers_money");
    expect(resolveRolePermissions("accounting")).not.toContain("sales_leads_map");
  });

  it("applies only known boolean overrides", () => {
    const overrides = normalizeRolePermissionOverrides({ export_data: true, pc_access: false, unknown: true, delivery_app: "yes" });
    expect(overrides).toEqual({ export_data: true, pc_access: false });
    expect(resolveRolePermissions("sales", overrides)).not.toContain("pc_access");
  });

  it("maps server capabilities through the selected role permissions", () => {
    const accounting = resolveRolePermissions("accounting");
    expect(rolePermissionsAllowCapability(accounting, "manage_billing")).toBe(true);
    expect(rolePermissionsAllowCapability(accounting, "manage_sales")).toBe(false);
  });
});

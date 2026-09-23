import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getCustomerAssignmentKeys, shouldScopeCustomerData, type CustomerSession } from "../lib/auth";
import { canUseWorkspaceFeature } from "../lib/workspace";

const companyOperationsRoutes = [
  "app/api/briefing/route.ts",
  "app/api/customer/churn-risk/route.ts",
  "app/api/customer/history-status/route.ts",
  "app/api/report/route.ts",
  "app/api/revenue/pipeline/route.ts",
  "app/api/revenue/transactions/route.ts",
  "app/api/routes/history/route.ts",
  "app/api/visits/timeline/route.ts"
];

describe("organization data exposure policy", () => {
  it("allows company-wide operations only for owners and managers", () => {
    expect(canUseWorkspaceFeature("owner", "view_company_operations")).toBe(true);
    expect(canUseWorkspaceFeature("manager", "view_company_operations")).toBe(true);
    expect(canUseWorkspaceFeature("sales", "view_company_operations")).toBe(false);
    expect(canUseWorkspaceFeature("driver", "view_company_operations")).toBe(false);
    expect(canUseWorkspaceFeature("member", "view_company_operations")).toBe(false);
  });

  it("keeps every company-wide API behind the centralized capability gate", () => {
    for (const route of companyOperationsRoutes) {
      const source = readFileSync(resolve(process.cwd(), route), "utf8");
      const hasCompanyOperationsGate =
        source.includes('scopeHasCapability(scope, "view_company_operations")') ||
        source.includes("shouldScopeCustomerData(scope.customerSession)");
      expect(hasCompanyOperationsGate, route).toBe(true);
      expect(source, route).toContain("status: 403");
    }
  });

  it("scopes field staff to stable assignment identifiers", () => {
    const session = makeSession("driver", {
      assignedManagerName: " 김배송 ",
      assignedVehicle: " 1호차 ",
      invitedEmployeeName: "김 기사",
      name: "카카오닉네임",
      userId: "user-123"
    });

    expect(shouldScopeCustomerData(session)).toBe(true);
    expect(getCustomerAssignmentKeys(session)).toEqual([
      "user-123",
      "카카오닉네임",
      "driver@example.com",
      "김배송",
      "1호차",
      "김 기사"
    ]);
  });

  it("does not apply assignment filtering to owners or managers", () => {
    for (const role of ["owner", "manager"] as const) {
      const session = makeSession(role);
      expect(shouldScopeCustomerData(session)).toBe(false);
      expect(getCustomerAssignmentKeys(session)).toBeUndefined();
    }
  });

  it("keeps daily route confirmation tenant-scoped and manager-gated", () => {
    const source = readFileSync(resolve(process.cwd(), "app/api/routes/confirm-order/route.ts"), "utf8");
    expect(source).toContain("getRequestAuthScope(request, body?.companyId)");
    expect(source).toContain('scopeHasCapability(scope, "manage_sales")');
    expect(source).toContain("saveRouteOrderConfirmation(scope.companyId");
  });

  it("forces field staff GPS history to their own user and assignment", () => {
    const source = readFileSync(resolve(process.cwd(), "app/api/staff/location/route.ts"), "utf8");
    expect(source).toContain("const scopedUserId = isScopedStaffView ? scope.customerSession?.userId : undefined");
    expect(source).toContain("const eventUserId = isScopedStaffView ? scopedUserId : requestedUserId");
    expect(source).toContain("deliveryVehicle: isScopedStaffView");
    expect(source).toContain("driverName: isScopedStaffView");
  });

  it("blocks field staff from company-wide dated delivery history", () => {
    const source = readFileSync(resolve(process.cwd(), "app/api/routes/history/route.ts"), "utf8");
    expect(source).toContain("shouldScopeCustomerData(scope.customerSession)");
    expect(source).toContain("전체 배송 히스토리는 대표 또는 관리자만 조회할 수 있습니다.");
    expect(source).toContain("status: 403");
  });
});

function makeSession(
  workspaceRole: CustomerSession["workspaceRole"],
  overrides: Partial<CustomerSession> = {}
): CustomerSession {
  return {
    appRole: "customer_user",
    companyId: "company-1",
    companyName: "테스트 회사",
    email: "driver@example.com",
    name: "테스트 직원",
    role: workspaceRole === "owner" ? "owner" : "member",
    workspaceRole,
    workspaceType: "company",
    ...overrides
  };
}

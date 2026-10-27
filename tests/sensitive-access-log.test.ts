import { describe, expect, it } from "vitest";
import { authorizeSensitiveAccessLogRead, isOutsideSensitiveWorkSession, isOwnerMembershipRole, normalizeSensitiveAccessItem, normalizeSensitiveAccessWarning } from "../domains/organization/sensitive-access-log";

describe("sensitive access log authorization", () => {
  it("allows only an active company owner", () => {
    expect(authorizeSensitiveAccessLogRead({ hasActiveCustomerSession: true, isActiveCompanyOwner: true })).toBe("allowed");
    expect(authorizeSensitiveAccessLogRead({ hasActiveCustomerSession: true, isActiveCompanyOwner: false })).toBe("forbidden");
  });

  it("uses permission_role before the legacy role during C6 transition", () => {
    expect(isOwnerMembershipRole({ legacyRole: "owner", permissionRole: "manager" })).toBe(false);
    expect(isOwnerMembershipRole({ legacyRole: "manager", permissionRole: "owner" })).toBe(true);
    expect(isOwnerMembershipRole({ legacyRole: "owner", permissionRole: null })).toBe(true);
  });

  it("rejects an admin-only session and a deactivated member as unauthorized", () => {
    expect(authorizeSensitiveAccessLogRead({ hasActiveCustomerSession: false, isActiveCompanyOwner: false })).toBe("unauthorized");
  });

  it("keeps the API route on the customer-session boundary without the admin capability bypass", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("app/api/customer/security/sensitive-access-logs/route.ts", "utf8");
    expect(source).toContain("getCustomerSession");
    expect(source).toContain("isActiveCompanyOwner");
    expect(source).toContain('status: 401');
    expect(source).toContain('status: 403');
    expect(source).not.toContain("scopeHasCapability");
    expect(source).not.toContain("getAdminSession");
  });

  it("accepts only enumerated items and warnings so values cannot enter the payload", () => {
    expect(normalizeSensitiveAccessItem("access_password")).toBe("access_password");
    expect(normalizeSensitiveAccessItem("1234")).toBeUndefined();
    expect(normalizeSensitiveAccessWarning("daily_20_plus")).toBe("daily_20_plus");
    expect(normalizeSensitiveAccessWarning("masked-secret")).toBeUndefined();
  });

  it("keeps access-password reveal server-only, fail-closed, and non-cacheable", async () => {
    const { readFile } = await import("node:fs/promises");
    const route = await readFile("app/api/customers/[id]/sensitive/access-password/reveal/route.ts", "utf8");
    const store = await readFile("lib/store/07-sensitive-access-logs.ts", "utf8");
    expect(route.indexOf("if (!sensitiveAccessLogsEnabled())")).toBeLessThan(route.indexOf("getCustomerSession()"));
    expect(route).toContain('"Cache-Control": "no-store, private, max-age=0"');
    expect(route).not.toContain("getAdminSession");
    expect(store.indexOf("await recordSensitiveAccessLog({")).toBeLessThan(store.indexOf('return { status: "allowed", value: customer.access_password }'));
    expect(store).toContain('input.actorUserId ? "app_user" : "legacy_owner"');
    expect(store).toContain("actor_user_id: input.actorUserId || null");
  });

  it("records business-license and export access before returning a URL or file", async () => {
    const { readFile } = await import("node:fs/promises");
    const attachmentRoute = await readFile("app/api/customer-attachments/file/route.ts", "utf8");
    const exportRoute = await readFile("app/api/customer/security/sensitive-access-logs/export/route.ts", "utf8");
    const revealStore = await readFile("lib/store/07-sensitive-access-logs.ts", "utf8");
    expect(attachmentRoute.indexOf("await recordSensitiveAccessLog({")).toBeLessThan(attachmentRoute.indexOf("createCustomerAttachmentSignedUrl(path)"));
    expect(attachmentRoute).toContain('item: "business_registration"');
    expect(attachmentRoute).toContain("!scope.customerSession || (!scope.customerSession.userId && scope.customerSession.workspaceRole !== \"owner\")");
    expect(attachmentRoute).toContain("isActiveSensitiveAccessActor");
    expect(attachmentRoute).toContain("if (sensitiveAccessLogsEnabled())");
    expect(attachmentRoute.indexOf("if (sensitiveAccessLogsEnabled())")).toBeGreaterThan(attachmentRoute.indexOf('attachment.attachmentType === "business_license"'));
    expect(exportRoute.indexOf("await recordSensitiveAccessLog({")).toBeLessThan(exportRoute.indexOf("return new NextResponse(csv"));
    expect(exportRoute).toContain('warningCodes: ["export"]');
    expect(exportRoute).toContain('status: 403');
    expect(exportRoute).toContain("for (let offset = 0; ; offset += pageSize)");
    expect(revealStore).toContain("canAccessAssignedCustomer");
    expect(revealStore).toContain("isCustomerOnTodayRouteForDriver");
    expect(revealStore).toContain('warningCodes.push("unassigned")');
  });

  it("marks non-manager access outside the 06:00-22:00 KST operating window", () => {
    expect(isOutsideSensitiveWorkSession("staff", new Date("2026-10-26T20:59:00Z"))).toBe(true);
    expect(isOutsideSensitiveWorkSession("staff", new Date("2026-10-26T13:00:00Z"))).toBe(true);
    expect(isOutsideSensitiveWorkSession("staff", new Date("2026-10-26T00:00:00Z"))).toBe(false);
    expect(isOutsideSensitiveWorkSession("owner", new Date("2026-10-26T20:59:00Z"))).toBe(false);
  });

  it("does not serialize access-password plaintext into customer or route responses", async () => {
    const { readFile } = await import("node:fs/promises");
    const store = await readFile("lib/store.ts", "utf8");
    const workspace = await readFile("components/sales-route-map-workspace.tsx", "utf8");
    expect(store).toContain("hasAccessPassword: Boolean(row.access_password)");
    expect(store).not.toContain("accessPassword: row.access_password");
    expect(workspace).toContain("/sensitive/access-password/reveal");
    expect(workspace).not.toContain("showAccessPassword ? store.accessPassword");
  });
});

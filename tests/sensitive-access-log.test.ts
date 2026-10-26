import { describe, expect, it } from "vitest";
import { authorizeSensitiveAccessLogRead, normalizeSensitiveAccessItem, normalizeSensitiveAccessWarning } from "../domains/organization/sensitive-access-log";

describe("sensitive access log authorization", () => {
  it("allows only an active company owner", () => {
    expect(authorizeSensitiveAccessLogRead({ hasActiveCustomerSession: true, isActiveCompanyOwner: true })).toBe("allowed");
    expect(authorizeSensitiveAccessLogRead({ hasActiveCustomerSession: true, isActiveCompanyOwner: false })).toBe("forbidden");
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
});

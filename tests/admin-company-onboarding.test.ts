import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/admin/companies/new/page.tsx", "utf8");
const workspace = readFileSync("app/admin/companies/new/workspace.tsx", "utf8");

describe("WO-22 admin company onboarding", () => {
  it("keeps the new route behind the existing admin session", () => {
    expect(page).toContain("getAdminSession");
    expect(page).toContain('redirect("/admin/login")');
    expect(page).toContain("ADMIN_COMPANY_ONBOARDING_ACCOUNT_ENABLED");
  });

  it("reuses existing company, sales-area, and driver invitation flows", () => {
    expect(workspace).toContain('fetch("/api/admin/companies"');
    expect(workspace).toContain('fetch("/api/leads/permits/keyword-search-regions"');
    expect(workspace).toContain('fetch("/api/admin/staff-invitations"');
  });

  it("does not persist sensitive onboarding values in the browser draft", () => {
    const savedDraft = workspace.slice(workspace.indexOf("function saveDraft"), workspace.indexOf("function selectDocument"));
    expect(savedDraft).toContain("JSON.stringify(draft)");
    expect(savedDraft).not.toContain("password");
    expect(workspace).toContain("bankAccountLast4");
    expect(workspace).not.toContain("bankAccountNumber");
  });

  it("limits local document selection to approved types and ten megabytes", () => {
    expect(workspace).toContain("10 * 1024 * 1024");
    expect(workspace).toContain('"application/pdf", "image/jpeg", "image/png"');
  });
});

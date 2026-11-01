import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/admin/companies/page.tsx", "utf8");
const workspace = readFileSync("app/admin/companies/workspace.tsx", "utf8");
const store = readFileSync("lib/store.ts", "utf8");
const env = readFileSync(".env.example", "utf8");

describe("WO-25 admin company import history", () => {
  it("keeps the company detail behind the existing admin session", () => {
    expect(page).toContain("getAdminSession");
    expect(page).toContain('redirect("/admin/login")');
  });

  it("reuses the approved import audit model only behind the default-off flag", () => {
    expect(store).toContain('process.env.PRODUCT_IMPORT_AUDIT_V2_ENABLED === "true"');
    expect(store).toContain('"import_jobs?select=id,company_id,target_type,file_name,status,total_rows,valid_rows,error_rows,created_by_name,created_at&order=created_at.desc"');
    expect(env).toContain("PRODUCT_IMPORT_AUDIT_V2_ENABLED=false");
  });

  it("groups both upload sources by company and identifies who submitted them", () => {
    expect(store).toContain("recentUploadsByCompany.get(row.company_id)");
    expect(store).toContain('uploadSource: "customer"');
    expect(store).toContain('uploadSource: "admin"');
    expect(workspace).toContain("고객사가 직접 올린 파일과 MAJU 관리자가 대신 올린 파일");
    expect(workspace).toContain('aria-label="고객사 상세 탭"');
    expect(workspace).toContain('upload.uploadSource === "admin"');
  });
});

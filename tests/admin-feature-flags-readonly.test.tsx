import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminFeatureCompanyTable } from "../components/admin-readonly-tables";

const page = readFileSync("app/admin/system/page.tsx", "utf8");
const table = readFileSync("components/admin-readonly-tables.tsx", "utf8");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("CX-105 관리자 기능 상태 읽기", () => {
  it("requires an admin session and keeps the company read behind an explicit request", () => {
    expect(page).toContain('if (!session) redirect("/admin/login")');
    expect(page).toContain('singleParam(params.featureFlags) === "1"');
    expect(page).toMatch(/showFeatureFlags\s*\?\s*getManagedCompanyAccounts\(\)/);
  });

  it("distinguishes an empty company list from a read error", () => {
    expect(page).toContain("회사별 기능 상태를 불러오지 못했습니다. 다시 시도해 주세요.");
    expect(page).toContain("표시할 회사가 없습니다. 고객사 등록 상태를 확인해 주세요.");
  });

  it("renders only company identity and enabled feature names, never environment values", () => {
    const secret = "raw-company-allowlist-must-not-render";
    vi.stubEnv("FEATURE_PRICING_COMPANY_IDS", secret);
    const html = renderToStaticMarkup(
      <AdminFeatureCompanyTable
        rows={[{ id: "company-1", name: "가짜 회사", features: "PRICING" }]}
      />,
    );

    expect(html).toContain("가짜 회사");
    expect(html).toContain("PRICING");
    expect(html).not.toContain(secret);
    expect(table).not.toContain("process.env");
  });
});

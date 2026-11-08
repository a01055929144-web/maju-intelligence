import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getManagedCompanyAccounts: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAdminSession: vi.fn().mockResolvedValue({ name: "관리자" }) }));
vi.mock("@/lib/feature-modules", () => ({ getHoldModulesEnabledCompanyIds: () => new Set<string>() }));
vi.mock("@/lib/store", () => ({ getManagedCompanyAccounts: mocks.getManagedCompanyAccounts }));
vi.mock("../app/admin/admin-page-header", () => ({ AdminPageHeader: () => null }));
vi.mock("../app/admin/companies/workspace", () => ({ AdminCompaniesWorkspace: () => "회사 목록 정상" }));

import AdminCompaniesPage from "../app/admin/companies/page";

beforeEach(() => vi.clearAllMocks());

it("distinguishes a failed company read from an empty company list", async () => {
  mocks.getManagedCompanyAccounts.mockRejectedValueOnce(new Error("synthetic read failure"));
  const failed = renderToStaticMarkup(await AdminCompaniesPage({ searchParams: Promise.resolve({}) }));
  expect(failed).toContain("고객사 0건이 아니라 조회 실패 상태입니다.");

  mocks.getManagedCompanyAccounts.mockResolvedValueOnce({ companies: [], source: "supabase" });
  const empty = renderToStaticMarkup(await AdminCompaniesPage({ searchParams: Promise.resolve({}) }));
  expect(empty).toContain("회사 목록 정상");
});

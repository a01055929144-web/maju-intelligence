import { afterEach, expect, it, vi } from "vitest";
import { setupPublicOwnerTestEnv } from "./fixtures/public-owner-test-env";
import { isPublicOwnerTestNumber, publicOwnerTestAccessAllowed } from "../lib/store/public-owner-test-mode";
vi.mock("server-only", () => ({}));
import { getSupabaseConfig, supabaseRequest } from "../lib/store";
import { isStoreMemberCompanyAllowlisted } from "../lib/store/07-store-member-feature";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("permits only an exact synthetic number and company in an isolated preview", () => {
  const { company, number } = setupPublicOwnerTestEnv();
  expect(isPublicOwnerTestNumber(company, number)).toBe(true);
  expect(isPublicOwnerTestNumber(company, "7".repeat(10))).toBe(false);
  vi.stubEnv("FEATURE_STORE_MEMBER_SESSION_COMPANY_IDS", `${company},20000000-0000-4000-8000-000000000001`);
  expect(isStoreMemberCompanyAllowlisted(company)).toBe(true);
  expect(isStoreMemberCompanyAllowlisted("20000000-0000-4000-8000-000000000001")).toBe(false);
  expect(getSupabaseConfig()?.url).toBe(`https://${"a".repeat(20)}.supabase.co`);
});

it.each([
  ["VERCEL_ENV", "production"], ["VERCEL_ENV", "development"],
  ["STORE_PUBLIC_TEST_DATABASE_PROJECT_ID", "fcmdvveqmcgtioelzqun"],
  ["SUPABASE_URL", "https://fcmdvveqmcgtioelzqun.supabase.co"],
  ["NEXT_PUBLIC_SUPABASE_URL", "https://fcmdvveqmcgtioelzqun.supabase.co"],
  ["SUPABASE_URL", `https://${"a".repeat(20)}.supabase.co/other`],
  ["STORE_PUBLIC_TEST_COMPANY_ID", ""], ["STORE_PUBLIC_TEST_BUSINESS_NUMBER", ""],
  ["STORE_ORDER_DELIVERY_SNAPSHOT_ENABLED", "true"],
])("blocks database requests before fetch when %s is incompatible", async (key, value) => {
  setupPublicOwnerTestEnv(); vi.stubEnv(key, value);
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  expect(publicOwnerTestAccessAllowed()).toBe(false);
  expect(getSupabaseConfig()).toBeNull();
  await expect(supabaseRequest("companies")).rejects.toThrow("Supabase is not configured");
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps the default-off production path intact and never grants the synthetic bypass", () => {
  const { company, number } = setupPublicOwnerTestEnv();
  vi.stubEnv("STORE_PUBLIC_TEST_MODE_ENABLED", "false"); vi.stubEnv("VERCEL_ENV", "production");
  expect(publicOwnerTestAccessAllowed(company)).toBe(true);
  expect(isPublicOwnerTestNumber(company, number)).toBe(false);
});

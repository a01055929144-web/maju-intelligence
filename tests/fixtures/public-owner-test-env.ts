import { vi } from "vitest";

/** Synthetic CI values only; no deployed identifiers, business numbers or credentials. */
export function setupPublicOwnerTestEnv() {
  const project = "a".repeat(20), company = "10000000-0000-4000-8000-000000000001", number = "8".repeat(10);
  vi.stubEnv("STORE_PUBLIC_TEST_MODE_ENABLED", "true");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("STORE_PUBLIC_TEST_DATABASE_PROJECT_ID", project);
  vi.stubEnv("SUPABASE_URL", `https://${project}.supabase.co`);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-ci-key");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${project}.supabase.co`);
  vi.stubEnv("STORE_PUBLIC_TEST_COMPANY_ID", company);
  vi.stubEnv("STORE_PUBLIC_TEST_BUSINESS_NUMBER", number);
  vi.stubEnv("STORE_ORDER_DELIVERY_SNAPSHOT_ENABLED", "false");
  return { project, company, number };
}

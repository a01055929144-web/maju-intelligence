/** Server configuration only. A test bypass must never reach the operating database. */
export function publicOwnerTestModeRequested() {
  return process.env.STORE_PUBLIC_TEST_MODE_ENABLED === "true";
}

export function publicOwnerTestAccessAllowed(companyId?: string) {
  if (!publicOwnerTestModeRequested()) return true;
  const project = process.env.STORE_PUBLIC_TEST_DATABASE_PROJECT_ID || "";
  const company = process.env.STORE_PUBLIC_TEST_COMPANY_ID || "";
  const expectedUrl = `https://${project}.supabase.co`;
  return process.env.VERCEL_ENV === "preview" && /^[a-z]{20}$/.test(project) &&
    project !== "fcmdvveqmcgtioelzqun" &&
    process.env.SUPABASE_URL?.replace(/\/$/, "") === expectedUrl &&
    (!process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "") === expectedUrl) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(company) &&
    /^\d{10}$/.test(process.env.STORE_PUBLIC_TEST_BUSINESS_NUMBER || "") &&
    (!companyId || companyId === company) &&
    process.env.STORE_ORDER_DELIVERY_SNAPSHOT_ENABLED !== "true";
}

export function isPublicOwnerTestNumber(companyId: string, number: string) {
  return publicOwnerTestModeRequested() && publicOwnerTestAccessAllowed(companyId) &&
    number === process.env.STORE_PUBLIC_TEST_BUSINESS_NUMBER;
}

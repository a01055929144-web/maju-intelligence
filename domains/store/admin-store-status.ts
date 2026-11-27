const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdminStoreTargetStatus = "active" | "suspended";

export type AdminStoreStatusInput = {
  companyId: string;
  requestKey: string;
  status: AdminStoreTargetStatus;
  storeProfileId: string;
};

export function parseAdminStoreStatusInput(value: unknown): AdminStoreStatusInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.companyId !== "string" || !UUID.test(input.companyId)) return null;
  if (typeof input.storeProfileId !== "string" || !UUID.test(input.storeProfileId)) return null;
  if (input.status !== "active" && input.status !== "suspended") return null;
  if (typeof input.requestKey !== "string" || input.requestKey.length < 16 || input.requestKey.length > 200) return null;
  return {
    companyId: input.companyId,
    requestKey: input.requestKey,
    status: input.status,
    storeProfileId: input.storeProfileId,
  };
}

export function isAdminStoreManagementCompanyAllowed(companyId: string, raw = process.env.FEATURE_ADMIN_STORE_MANAGEMENT_COMPANY_IDS || "") {
  return raw.split(",").map((id) => id.trim()).filter(Boolean).includes(companyId);
}

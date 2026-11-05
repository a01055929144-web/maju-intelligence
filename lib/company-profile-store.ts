import { randomUUID } from "crypto";
import { COMPANY_DOCUMENT_BUCKET, COMPANY_PROFILE_FIELDS, COMPANY_PROFILE_FILE_KEYS, type CompanyProfileValues } from "@/domains/organization/company-profile";
import { addCompanyLeadSearchRegion, encodeStoragePath, getCompanyLeadSearchRegions, getSupabaseConfig, isProductionStoreConfigured, normalizeSelectableSalesArea, sanitizeStorageFilename, supabaseRequest, supabaseStorageRequest } from "@/lib/store";

/** Infrastructure for company_profiles (organization domain). 서비스 키로만 접근합니다. */
export type CompanyProfileRecord = {
  available: boolean;
  company: { name: string; businessRegistrationNumber: string; originAddress: string };
  values: CompanyProfileValues;
  fileUrls: Record<string, string>;
};

export async function getCompanyProfile(companyId: string, options: { includeLockedFiles?: boolean } = {}): Promise<CompanyProfileRecord> {
  const empty: CompanyProfileRecord = { available: false, company: { name: "", businessRegistrationNumber: "", originAddress: "" }, fileUrls: {}, values: {} };
  if (!isProductionStoreConfigured()) return empty;
  const [companies, profiles] = await Promise.all([
    supabaseRequest<Array<{ name: string | null; business_registration_number: string | null; origin_address: string | null; owner_name: string | null }>>(
      `companies?select=name,business_registration_number,origin_address,owner_name&id=eq.${encodeURIComponent(companyId)}&limit=1`
    ),
    supabaseRequest<CompanyProfileValues[]>(`company_profiles?select=*&company_id=eq.${encodeURIComponent(companyId)}&limit=1`).then(
      (rows) => ({ ok: true as const, rows }),
      () => ({ ok: false as const, rows: [] as CompanyProfileValues[] })
    )
  ]);
  const company = companies[0];
  const values = { ...(profiles.rows[0] || {}) };
  delete values.company_id;
  if (!values.owner_name && company?.owner_name) values.owner_name = company.owner_name;
  const fileUrls: Record<string, string> = {};
  await Promise.all(COMPANY_PROFILE_FILE_KEYS.map(async (key) => {
    const path = typeof values[key] === "string" ? (values[key] as string) : "";
    if (!path || !path.startsWith(`${companyId}/`)) return;
    const locked = COMPANY_PROFILE_FIELDS.find((field) => field.key === key)?.locked;
    if (locked && !options.includeLockedFiles) {
      values[key] = "submitted"; // 운영 계정에는 서류 경로·링크 대신 '제출 완료'만.
      return;
    }
    const url = await signCompanyDocument(path).catch(() => "");
    if (url) fileUrls[key] = url;
  }));
  return {
    available: profiles.ok,
    company: { name: company?.name || "", businessRegistrationNumber: company?.business_registration_number || "", originAddress: company?.origin_address || "" },
    fileUrls,
    values
  };
}

export async function saveCompanyProfile(companyId: string, patch: CompanyProfileValues, actorName: string) {
  await supabaseRequest("company_profiles?on_conflict=company_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ ...patch, company_id: companyId, updated_at: new Date().toISOString(), updated_by: actorName.slice(0, 80) })
  });
}

export async function uploadCompanyDocument(input: { companyId: string; fieldKey: string; filename: string; contentType: string; bytes: ArrayBuffer; actorName: string }) {
  if (!COMPANY_PROFILE_FILE_KEYS.includes(input.fieldKey)) throw new Error("올릴 수 없는 항목입니다.");
  const path = `${input.companyId}/profile/${input.fieldKey}/${randomUUID()}-${sanitizeStorageFilename(input.filename)}`;
  await supabaseStorageRequest(`object/${COMPANY_DOCUMENT_BUCKET}/${encodeStoragePath(path)}`, {
    method: "POST",
    headers: { "Content-Type": input.contentType, "x-upsert": "false" },
    body: input.bytes
  });
  await saveCompanyProfile(input.companyId, { [input.fieldKey]: path }, input.actorName);
  return { path, url: await signCompanyDocument(path).catch(() => "") };
}

async function signCompanyDocument(path: string) {
  const result = await supabaseStorageRequest<{ signedURL: string }>(`object/sign/${COMPANY_DOCUMENT_BUCKET}/${encodeStoragePath(path)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 60 })
  });
  const config = getSupabaseConfig();
  if (!config) return "";
  return result.signedURL.startsWith("http") ? result.signedURL : `${config.url}/storage/v1${result.signedURL}`;
}

/**
 * 배송 지역을 영업 지역(리드 수집, area_kind=assigned)에 자동으로 추가합니다. (11/3 대표 결정: 가장 중요한 연결)
 * 이미 있는 지역은 건너뛰고, 형식이 맞지 않는 지역은 결과로 돌려줍니다. 지우지는 않습니다.
 */
export async function syncDeliveryRegionsToSalesAreas(companyId: string, labels: string[]) {
  const existing = await getCompanyLeadSearchRegions(companyId, "assigned").catch(() => []);
  const known = new Set(existing.map((region) => normalizeSelectableSalesArea(region.label)).filter(Boolean));
  const added: string[] = [];
  const skipped: string[] = [];
  for (const label of labels) {
    const normalized = normalizeSelectableSalesArea(label);
    if (!normalized) { skipped.push(label); continue; }
    if (known.has(normalized)) continue;
    try {
      await addCompanyLeadSearchRegion(companyId, normalized, "assigned");
      known.add(normalized);
      added.push(normalized);
    } catch {
      skipped.push(label);
    }
  }
  return { added, skipped };
}

import { randomInt, randomUUID } from "crypto";
import { COMPANY_DOCUMENT_BUCKET } from "@/domains/organization/company-profile";
import {
  createShortCode,
  parseSalesKit,
  SALES_KIT_MAX_MATERIALS,
  SHORT_CODE_PATTERN,
  type SalesKitSettings,
  type SalesMaterialKind
} from "@/domains/lead/sales-kit";
import { encodeStoragePath, getSupabaseConfig, isProductionStoreConfigured, sanitizeStorageFilename, supabaseRequest, supabaseStorageRequest } from "@/lib/store";

/**
 * 영업 자료 키트 저장소 (11/4). 새 테이블 없이 company_message_templates 를 씁니다.
 * - lead_dm_kit            : 회사 설정(JSON)
 * - lead_dm_link_{코드}     : 짧은 링크 → 파일 경로 또는 주문 URL (공개 /m/{코드} 에서 조회)
 * 'lead_dm' 접두어라 배송 문구 저장(replaceCompanyMessageTemplates)에 지워지지 않습니다.
 */
const KIT_KEY = "lead_dm_kit";
const LINK_PREFIX = "lead_dm_link_";
type TemplateRow = { company_id: string; template_key: string; body: string };

const secureRandom = () => randomInt(0, 1_000_000) / 1_000_000;

export async function getSalesKit(companyId: string): Promise<SalesKitSettings> {
  if (!isProductionStoreConfigured()) return parseSalesKit(null);
  const rows = await supabaseRequest<TemplateRow[]>(
    `company_message_templates?select=company_id,template_key,body&company_id=eq.${encodeURIComponent(companyId)}&template_key=eq.${KIT_KEY}&limit=1`
  ).catch(() => [] as TemplateRow[]);
  return parseSalesKit(rows[0]?.body);
}

async function upsertTemplate(companyId: string, key: string, label: string, body: string) {
  await supabaseRequest("company_message_templates?on_conflict=company_id,template_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ company_id: companyId, template_key: key, label, body, sort_order: 9100, is_active: true, updated_at: new Date().toISOString() })
  });
}

async function deleteTemplate(companyId: string, key: string) {
  await supabaseRequest(`company_message_templates?company_id=eq.${encodeURIComponent(companyId)}&template_key=eq.${encodeURIComponent(key)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
}

export async function saveSalesKit(companyId: string, kit: SalesKitSettings) {
  // 주문 링크가 바뀌면 짧은 링크도 새로 맞춥니다.
  let next = { ...kit };
  if (next.orderUrl) {
    const code = next.orderCode || createShortCode(secureRandom);
    await upsertTemplate(companyId, `${LINK_PREFIX}${code}`, "주문 링크", JSON.stringify({ url: next.orderUrl }));
    next = { ...next, orderCode: code };
  } else if (next.orderCode) {
    await deleteTemplate(companyId, `${LINK_PREFIX}${next.orderCode}`);
    next = { ...next, orderCode: "" };
  }
  await upsertTemplate(companyId, KIT_KEY, "영업 자료 설정", JSON.stringify(next));
  return next;
}

export async function addSalesMaterial(input: { companyId: string; kind: SalesMaterialKind; filename: string; contentType: string; bytes: ArrayBuffer }) {
  const kit = await getSalesKit(input.companyId);
  if (kit.materials.length >= SALES_KIT_MAX_MATERIALS) throw new Error(`자료는 ${SALES_KIT_MAX_MATERIALS}개까지 올릴 수 있습니다.`);
  const path = `${input.companyId}/sales/${input.kind}/${randomUUID()}-${sanitizeStorageFilename(input.filename)}`;
  await supabaseStorageRequest(`object/${COMPANY_DOCUMENT_BUCKET}/${encodeStoragePath(path)}`, {
    method: "POST",
    headers: { "Content-Type": input.contentType, "x-upsert": "false" },
    body: input.bytes
  });
  const code = createShortCode(secureRandom);
  const name = input.filename.slice(0, 80);
  await upsertTemplate(input.companyId, `${LINK_PREFIX}${code}`, name || "영업 자료", JSON.stringify({ path }));
  const material = { code, kind: input.kind, name, uploadedAt: new Date().toISOString() };
  const defaults = kit.defaults[input.kind] ? kit.defaults : { ...kit.defaults, [input.kind]: code };
  return saveSalesKit(input.companyId, { ...kit, defaults, materials: [...kit.materials, material] });
}

export async function removeSalesMaterial(companyId: string, code: string) {
  if (!SHORT_CODE_PATTERN.test(code)) throw new Error("자료를 찾을 수 없습니다.");
  const kit = await getSalesKit(companyId);
  const rows = await supabaseRequest<TemplateRow[]>(
    `company_message_templates?select=company_id,template_key,body&company_id=eq.${encodeURIComponent(companyId)}&template_key=eq.${LINK_PREFIX}${code}&limit=1`
  ).catch(() => [] as TemplateRow[]);
  const path = readLinkTarget(rows[0]?.body).path;
  await deleteTemplate(companyId, `${LINK_PREFIX}${code}`);
  if (path && path.startsWith(`${companyId}/sales/`)) {
    await supabaseStorageRequest(`object/${COMPANY_DOCUMENT_BUCKET}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [path] })
    }).catch(() => null);
  }
  const defaults = { ...kit.defaults };
  for (const [kind, value] of Object.entries(defaults)) if (value === code) delete defaults[kind as SalesMaterialKind];
  return saveSalesKit(companyId, { ...kit, defaults, materials: kit.materials.filter((item) => item.code !== code) });
}

function readLinkTarget(body?: string): { path?: string; url?: string } {
  try {
    const value = JSON.parse(body || "{}") as { path?: unknown; url?: unknown };
    return { path: typeof value.path === "string" ? value.path : undefined, url: typeof value.url === "string" ? value.url : undefined };
  } catch {
    return {};
  }
}

/** 공개 짧은 링크(/m/코드)가 가리킬 주소. 파일은 10분짜리 서명 링크, 주문 링크는 https 만. */
export async function resolveSalesShortLink(code: string): Promise<string | null> {
  if (!SHORT_CODE_PATTERN.test(code) || !isProductionStoreConfigured()) return null;
  const rows = await supabaseRequest<TemplateRow[]>(
    `company_message_templates?select=company_id,template_key,body&template_key=eq.${LINK_PREFIX}${code}&is_active=eq.true&limit=1`
  ).catch(() => [] as TemplateRow[]);
  const row = rows[0];
  if (!row) return null;
  const target = readLinkTarget(row.body);
  if (target.url) {
    try {
      return new URL(target.url).protocol === "https:" ? target.url : null;
    } catch {
      return null;
    }
  }
  if (!target.path || !target.path.startsWith(`${row.company_id}/sales/`)) return null;
  const signed = await supabaseStorageRequest<{ signedURL: string }>(`object/sign/${COMPANY_DOCUMENT_BUCKET}/${encodeStoragePath(target.path)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 600 })
  }).catch(() => null);
  const config = getSupabaseConfig();
  if (!signed?.signedURL || !config) return null;
  return signed.signedURL.startsWith("http") ? signed.signedURL : `${config.url}/storage/v1${signed.signedURL}`;
}

export async function getSalesKitContactFallback(companyId: string) {
  const [profiles, companies] = await Promise.all([
    supabaseRequest<Array<{ main_phone: string | null }>>(`company_profiles?select=main_phone&company_id=eq.${encodeURIComponent(companyId)}&limit=1`).catch(() => []),
    supabaseRequest<Array<{ name: string | null }>>(`companies?select=name&id=eq.${encodeURIComponent(companyId)}&limit=1`).catch(() => [])
  ]);
  return { companyName: companies[0]?.name || "", phone: profiles[0]?.main_phone || "" };
}

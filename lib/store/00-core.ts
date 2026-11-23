import { publicOwnerTestAccessAllowed } from "./public-owner-test-mode";

export type SupabaseConfig = {
  url: string;
  serviceRoleKey: string;
};

/** CC-22: 회사 구분. customer=영업할 고객사, pilot=파일럿, internal=본사(지표·결제·알림에서 제외). */
export type CompanyKind = "customer" | "pilot" | "internal";
export const normalizeCompanyKind = (value: unknown): CompanyKind => (value === "pilot" || value === "internal" ? value : "customer");

export function getSupabaseConfig(): SupabaseConfig | null {
  if (!publicOwnerTestAccessAllowed()) return null;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!url || !serviceRoleKey) return null;
  return { url: url.replace(/\/$/, ""), serviceRoleKey };
}

export async function supabaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");

  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers || {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase request failed: ${response.status} ${message}`);
  }

  // Prefer: return=minimal은 PATCH/DELETE에서는 204(본문 없음)로 오지만, POST(insert)에서는
  // 201에 빈 본문으로 옵니다. 상태 코드 204만 특별 취급하면 이 201-빈 본문 케이스에서
  // response.json()이 "Unexpected end of JSON input"으로 죽습니다. 상태 코드 대신 본문이
  // 실제로 비어 있는지로 판단해 두 경우 모두 안전하게 처리합니다.
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export function isProductionStoreConfigured() {
  return Boolean(getSupabaseConfig());
}

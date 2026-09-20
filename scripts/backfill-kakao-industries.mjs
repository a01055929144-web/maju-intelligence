import fs from "node:fs";
import path from "node:path";
import { normalizeKakaoCategoryIndustry } from "../lib/leads.ts";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const backupConfirmed = args.has("--backup-confirmed");
const companyId = readArgValue("--company-id");

if (apply && !backupConfirmed) {
  throw new Error("실제 갱신에는 운영 DB 백업 확인 후 --apply --backup-confirmed를 함께 지정해야 합니다.");
}

const fileEnv = readEnvFile(path.join(process.cwd(), ".env.production.local"));
const supabaseUrl = (
  fileEnv.SUPABASE_URL ||
  fileEnv.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  ""
).replace(/\/$/, "");
const serviceRoleKey =
  fileEnv.SUPABASE_SERVICE_ROLE_KEY ||
  fileEnv.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  "";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");
}

const standardBuckets = new Set([
  "한식",
  "카페/디저트",
  "일식",
  "중식",
  "프랜차이즈/배달",
  "주점",
  "양식",
  "뷔페/단체급식"
]);

const companyFilter = companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "";
const [customers, leads] = await Promise.all([
  fetchAll("normalized_customers", "id,company_id,customer_name,industry,kakao_place_url,place_links_checked_at"),
  fetchAll("business_permit_leads", "id,company_id,business_name,source,industry_raw,industry_primary,industry_tags,kakao_place_url")
]);

const customerCandidates = customers.flatMap((row) => {
  const current = cleanText(row.industry);
  const normalized = normalizeCandidate(current);
  const hasKakaoEvidence = Boolean(cleanText(row.kakao_place_url) || row.place_links_checked_at);
  if (!hasKakaoEvidence || !normalized) return [];
  return [{ id: row.id, companyId: row.company_id, name: row.customer_name, before: current, after: normalized }];
});

const leadCandidates = leads.flatMap((row) => {
  const current = cleanText(row.industry_primary);
  const normalized = normalizeCandidate(current);
  const source = cleanText(row.source).toLowerCase();
  const hasKakaoEvidence = source.includes("kakao") || Boolean(cleanText(row.kakao_place_url));
  if (!hasKakaoEvidence || !normalized) return [];
  const tags = Array.isArray(row.industry_tags) ? row.industry_tags.map(cleanText).filter(Boolean) : [];
  const nextTags = [...new Set(tags.filter((tag) => tag !== current).concat(normalized))];
  return [{ id: row.id, companyId: row.company_id, name: row.business_name, before: current, after: normalized, tags: nextTags }];
});

const report = {
  mode: apply ? "apply" : "dry-run",
  companyId: companyId || "all",
  criteria: {
    customers: "비표준 업종 + 표준 버킷으로 값 변경 + 카카오 URL 또는 장소 확인 시각 존재",
    leads: "비표준 업종 + 표준 버킷으로 값 변경 + 카카오 소스 또는 카카오 URL 존재"
  },
  totals: {
    customersScanned: customers.length,
    customerCandidates: customerCandidates.length,
    leadsScanned: leads.length,
    leadCandidates: leadCandidates.length
  },
  samples: {
    customers: customerCandidates.slice(0, 20),
    leads: leadCandidates.slice(0, 20)
  }
};

if (apply) {
  for (const candidate of customerCandidates) {
    await patchRow("normalized_customers", candidate.id, candidate.companyId, { industry: candidate.after });
  }
  for (const candidate of leadCandidates) {
    await patchRow("business_permit_leads", candidate.id, candidate.companyId, {
      industry_primary: candidate.after,
      industry_tags: candidate.tags
    });
  }
}

console.log(JSON.stringify(report, null, 2));

function normalizeCandidate(current) {
  if (!current || standardBuckets.has(current)) return null;
  const normalized = normalizeKakaoCategoryIndustry(current);
  return normalized !== current && standardBuckets.has(normalized) ? normalized : null;
}

async function fetchAll(table, select) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabaseRequest(
      `${table}?select=${encodeURIComponent(select)}${companyFilter}&order=id.asc&limit=${pageSize}&offset=${offset}`
    );
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function patchRow(table, id, rowCompanyId, payload) {
  if (!id || !rowCompanyId) throw new Error(`${table} 갱신 대상의 id/company_id가 없습니다.`);
  await supabaseRequest(
    `${table}?id=eq.${encodeURIComponent(id)}&company_id=eq.${encodeURIComponent(rowCompanyId)}`,
    { body: JSON.stringify(payload), method: "PATCH" }
  );
}

async function supabaseRequest(relativePath, init = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${relativePath}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: init.method === "PATCH" ? "return=minimal" : "count=exact",
      ...(init.headers || {})
    }
  });
  if (!response.ok) {
    throw new Error(`${init.method || "GET"} ${relativePath.split("?")[0]} 실패: ${response.status} ${await response.text()}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function readArgValue(name) {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length).trim() || "";
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const [key, ...rest] = line.split("=");
        return [key, rest.join("=").replace(/^"|"$/g, "")];
      })
  );
}

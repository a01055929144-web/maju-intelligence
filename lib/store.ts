import { analyzeCompany, AnalysisResult } from "./analysis";
import { getAdminDashboard, getLeadPayload } from "./backend";
import { CustomerRow, sampleCustomers } from "./sample-data";
import { RouteDistanceResult } from "./tmap";

export type RawUploadRow = Record<string, string | number | boolean | null | undefined>;
export type ColumnMapping = Record<string, string>;
export type UploadHistoryItem = {
  id: string;
  company: string;
  filename: string;
  reportId: string;
  rows: number;
  status: "completed" | "running" | "failed";
  qualityScore: number;
  duplicateCount: number;
  healthScore: number;
  createdAt: string;
};
export type ExcelMappingPreset = {
  id?: string;
  companyId: string;
  erpName?: string;
  mapping: ColumnMapping;
  presetName: string;
  uploadType: "customer-master" | "sales-analysis";
  updatedAt?: string;
};
export type CompanySettings = {
  id: string;
  name: string;
  businessType: string;
  ownerName: string;
  originAddress: string;
  status: string;
  updatedAt: string;
};
export type CompanySettingsInput = {
  businessType?: string;
  name: string;
  originAddress?: string;
  ownerName?: string;
};
export type CustomerMasterItem = {
  id: string;
  address: string;
  bankAccountFileUrl?: string;
  birthDate?: string;
  businessLicenseFileUrl?: string;
  businessNumber: string;
  businessStatus: string;
  businessStatusCheckedAt?: string;
  customerName: string;
  deliveryKm: number;
  deliveryManager: string;
  deliveryMinutes?: number;
  deliveryZone?: string;
  email: string;
  grade: "A" | "B" | "C";
  industry: string;
  lastOrderDays: number;
  loadingPosition: string;
  memoCount: number;
  monthlyRevenue: number;
  openingDate?: string;
  phone: string;
  region: string;
  representativeName: string;
  visitCount: number;
};
export type CustomerMasterInput = {
  address?: string;
  bankAccountFileUrl?: string;
  birthDate?: string;
  businessLicenseFileUrl?: string;
  businessNumber?: string;
  businessStatus?: string;
  customerName: string;
  deliveryKm?: number;
  deliveryManager?: string;
  deliveryMinutes?: number;
  deliveryZone?: string;
  email?: string;
  industry?: string;
  lastOrderDays?: number;
  loadingPosition?: string;
  monthlyRevenue?: number;
  openingDate?: string;
  phone?: string;
  region?: string;
  representativeName?: string;
  visitCount?: number;
};
export type CustomerNoteItem = {
  id: string;
  createdAt: string;
  createdByName: string;
  memo: string;
  nextAction: string;
  noteType: string;
};
export type CustomerAttachmentItem = {
  id: string;
  attachmentType: "business_license" | "bank_account" | "loading_position" | "etc" | string;
  createdAt: string;
  fileUrl: string;
  mimeType: string;
  storagePath?: string;
  title: string;
};
export type LeadStatus = "today" | "reviewing" | "visit-planned" | "high-probability" | "excluded" | "this-week";
export type LeadItem = {
  id: string;
  name: string;
  region: string;
  score: number;
  reasons?: string[];
  status: LeadStatus | string;
  expectedRevenue: number;
};
export type RoutePlanStop = LeadItem & {
  address?: string;
  birthDate?: string;
  businessNumber?: string;
  businessStatus?: string;
  deliveryArea?: string;
  deliveryDriver?: string;
  distanceKm?: number;
  durationMinutes?: number;
  email?: string;
  industry?: string;
  loadingPosition?: string;
  openingDate?: string;
  order: number;
  phone?: string;
  representativeName?: string;
  routeCalculatedAt?: string;
  routeProvider?: "tmap" | "estimated" | "cached" | "sample";
};
export type RoutePlanGroup = {
  region: string;
  stops: RoutePlanStop[];
  expectedRevenue: number;
  totalDistanceKm: number;
  totalDurationMinutes: number;
};
export type RoutePlan = {
  groups: RoutePlanGroup[];
  totalDistanceKm: number;
  totalDurationMinutes: number;
  totalExpectedRevenue: number;
  totalStops: number;
};
export type VisitResult = "visited" | "interested" | "quote-requested" | "pending" | "failed";
export type VisitTimelineItem = {
  id: string;
  leadName: string;
  region: string;
  result: VisitResult | string;
  memo: string;
  nextAction: string;
  expectedRevenue: number;
  visitedAt: string;
};
export type RevenuePipeline = {
  quoteRequests: number;
  interested: number;
  pending: number;
  failed: number;
  expectedRevenue: number;
  weightedRevenue: number;
  conversionRate: number;
  items: Array<VisitTimelineItem & { probability: number; weightedRevenue: number }>;
};
export type SalesTransactionItem = {
  id: string;
  customerName: string;
  businessRegistrationNumber?: string;
  salesDate?: string;
  productName?: string;
  quantity: number;
  salesAmount: number;
  createdAt: string;
};
export type SalesTransactionSummary = {
  totalAmount: number;
  transactionCount: number;
  customerCount: number;
  latestSalesDate?: string;
  items: SalesTransactionItem[];
};
export type SalesAssistantDraft = {
  id: string;
  leadName: string;
  region: string;
  type: "follow-up" | "quote" | "summary";
  title: string;
  body: string;
  nextAction: string;
};
export type SystemStatus = {
  appUrlConfigured: boolean;
  adminConfigured: boolean;
  customerConfigured: boolean;
  mode: "production-db" | "local-fallback";
  requiredEnvironment: Array<{ key: string; present: boolean; scope: "server" | "client" }>;
  services: Array<{ name: string; status: "ready" | "fallback" | "missing"; description: string }>;
  databaseChecks: DatabaseCheck[];
  storageChecks: DatabaseCheck[];
};
export type AuthCredentials = {
  adminEmail: string;
  adminPassword: string;
  customerEmail: string;
  customerPassword: string;
  customerCompanyId: string;
  updatedAt?: string;
};
export type ManagedCompanyAccount = {
  id: string;
  name: string;
  businessType: string;
  ownerName: string;
  originAddress: string;
  status: string;
  customerEmail: string;
  customerPassword: string;
  customerCount: number;
  salesTransactionCount: number;
  uploadCount: number;
  lastUploadAt?: string;
  recentUploads: UploadHistoryItem[];
  updatedAt?: string;
};
export type ManagedCompanyAccountInput = {
  id?: string;
  name: string;
  businessType?: string;
  ownerName?: string;
  originAddress?: string;
  status?: string;
  customerEmail: string;
  customerPassword: string;
};
export type CustomerLoginCredentials = AuthCredentials & {
  companyName: string;
  ownerName?: string;
};
export type DatabaseCheck = {
  name: string;
  status: "ready" | "fallback" | "missing";
  count: number | null;
  description: string;
};

type SupabaseConfig = {
  url: string;
  serviceRoleKey: string;
};

type SupabaseRow = Record<string, unknown>;
const DEFAULT_COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const CUSTOMER_ATTACHMENT_BUCKET = "customer-attachments";
const AUTH_CREDENTIALS_ID = "maju-default";

function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!url || !serviceRoleKey) return null;
  return { url: url.replace(/\/$/, ""), serviceRoleKey };
}

async function supabaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
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

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function supabaseStorageRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");

  const response = await fetch(`${config.url}/storage/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      ...(init.headers || {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase storage request failed: ${response.status} ${message}`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function isProductionStoreConfigured() {
  return Boolean(getSupabaseConfig());
}

function getDefaultCompanyId() {
  return process.env.CUSTOMER_COMPANY_ID || DEFAULT_COMPANY_ID;
}

export async function getExcelMappingPreset(
  uploadType: "customer-master" | "sales-analysis",
  companyId?: string,
  presetName = "default"
): Promise<{ persisted: boolean; preset: ExcelMappingPreset | null }> {
  const id = companyId || getDefaultCompanyId();
  if (!isProductionStoreConfigured()) return { persisted: false, preset: null };

  const rows = await supabaseRequest<
    Array<{
      id: string;
      company_id: string;
      erp_name: string | null;
      mapping: ColumnMapping | null;
      preset_name: string;
      upload_type: "customer-master" | "sales-analysis";
      updated_at: string;
    }>
  >(
    `excel_mapping_presets?select=id,company_id,upload_type,preset_name,erp_name,mapping,updated_at&company_id=eq.${encodeURIComponent(
      id
    )}&upload_type=eq.${encodeURIComponent(uploadType)}&preset_name=eq.${encodeURIComponent(presetName)}&limit=1`
  );

  const row = rows[0];
  if (!row) return { persisted: true, preset: null };

  return {
    persisted: true,
    preset: {
      id: row.id,
      companyId: row.company_id,
      erpName: row.erp_name || undefined,
      mapping: row.mapping || {},
      presetName: row.preset_name,
      uploadType: row.upload_type,
      updatedAt: row.updated_at
    }
  };
}

export async function upsertExcelMappingPreset(input: {
  companyId?: string;
  erpName?: string;
  mapping: ColumnMapping;
  presetName?: string;
  uploadType: "customer-master" | "sales-analysis";
}): Promise<{ persisted: boolean; preset: ExcelMappingPreset }> {
  const companyId = input.companyId || getDefaultCompanyId();
  const presetName = input.presetName || "default";
  const preset: ExcelMappingPreset = {
    companyId,
    erpName: input.erpName,
    mapping: input.mapping,
    presetName,
    uploadType: input.uploadType
  };

  if (!isProductionStoreConfigured()) return { persisted: false, preset };

  await upsertCompany(companyId, "마주식자재");
  const rows = await supabaseRequest<
    Array<{
      id: string;
      company_id: string;
      erp_name: string | null;
      mapping: ColumnMapping | null;
      preset_name: string;
      upload_type: "customer-master" | "sales-analysis";
      updated_at: string;
    }>
  >("excel_mapping_presets?on_conflict=company_id,upload_type,preset_name", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([
      {
        company_id: companyId,
        erp_name: input.erpName || null,
        mapping: input.mapping,
        preset_name: presetName,
        upload_type: input.uploadType,
        updated_at: new Date().toISOString()
      }
    ])
  });
  const row = rows[0];

  return {
    persisted: true,
    preset: {
      id: row.id,
      companyId: row.company_id,
      erpName: row.erp_name || undefined,
      mapping: row.mapping || {},
      presetName: row.preset_name,
      uploadType: row.upload_type,
      updatedAt: row.updated_at
    }
  };
}

export async function deleteExcelMappingPreset(
  uploadType: "customer-master" | "sales-analysis",
  companyId?: string,
  presetName = "default"
): Promise<{ persisted: boolean }> {
  const id = companyId || getDefaultCompanyId();
  if (!isProductionStoreConfigured()) return { persisted: false };

  await supabaseRequest(
    `excel_mapping_presets?company_id=eq.${encodeURIComponent(id)}&upload_type=eq.${encodeURIComponent(uploadType)}&preset_name=eq.${encodeURIComponent(presetName)}`,
    {
      method: "DELETE",
      headers: {
        Prefer: "return=minimal"
      }
    }
  );

  return { persisted: true };
}

export function getFallbackAuthCredentials(): AuthCredentials {
  return {
    adminEmail: process.env.ADMIN_EMAIL || "admin@maju.local",
    adminPassword: process.env.ADMIN_PASSWORD || "maju-admin-2026",
    customerEmail: process.env.CUSTOMER_EMAIL || "owner@maju.local",
    customerPassword: process.env.CUSTOMER_PASSWORD || "maju-owner-2026",
    customerCompanyId: getDefaultCompanyId()
  };
}

export async function getAuthCredentials(): Promise<AuthCredentials> {
  const fallback = getFallbackAuthCredentials();
  if (!isProductionStoreConfigured()) return fallback;

  try {
    const rows = await supabaseRequest<
      Array<{
        admin_email: string | null;
        admin_password: string | null;
        customer_company_id: string | null;
        customer_email: string | null;
        customer_password: string | null;
        updated_at: string | null;
      }>
    >(`auth_credentials?select=admin_email,admin_password,customer_email,customer_password,customer_company_id,updated_at&id=eq.${AUTH_CREDENTIALS_ID}&limit=1`);

    const row = rows[0];
    if (!row) return fallback;

    return {
      adminEmail: row.admin_email || fallback.adminEmail,
      adminPassword: row.admin_password || fallback.adminPassword,
      customerEmail: row.customer_email || fallback.customerEmail,
      customerPassword: row.customer_password || fallback.customerPassword,
      customerCompanyId: row.customer_company_id || fallback.customerCompanyId,
      updatedAt: row.updated_at || undefined
    };
  } catch (error) {
    console.error("Auth credentials fallback:", error);
    return fallback;
  }
}

export async function upsertAuthCredentials(input: Partial<AuthCredentials>): Promise<{ credentials: AuthCredentials; persisted: boolean }> {
  const fallback = await getAuthCredentials();
  const credentials: AuthCredentials = {
    adminEmail: input.adminEmail?.trim() || fallback.adminEmail,
    adminPassword: input.adminPassword || fallback.adminPassword,
    customerEmail: input.customerEmail?.trim() || fallback.customerEmail,
    customerPassword: input.customerPassword || fallback.customerPassword,
    customerCompanyId: input.customerCompanyId || fallback.customerCompanyId
  };

  if (!isProductionStoreConfigured()) return { credentials, persisted: false };

  const rows = await supabaseRequest<
    Array<{
      admin_email: string;
      admin_password: string;
      customer_company_id: string;
      customer_email: string;
      customer_password: string;
      updated_at: string;
    }>
  >("auth_credentials?on_conflict=id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([
      {
        id: AUTH_CREDENTIALS_ID,
        admin_email: credentials.adminEmail,
        admin_password: credentials.adminPassword,
        customer_company_id: credentials.customerCompanyId,
        customer_email: credentials.customerEmail,
        customer_password: credentials.customerPassword,
        updated_at: new Date().toISOString()
      }
    ])
  });

  return {
    credentials: {
      adminEmail: rows[0]?.admin_email || credentials.adminEmail,
      adminPassword: rows[0]?.admin_password || credentials.adminPassword,
      customerEmail: rows[0]?.customer_email || credentials.customerEmail,
      customerPassword: rows[0]?.customer_password || credentials.customerPassword,
      customerCompanyId: rows[0]?.customer_company_id || credentials.customerCompanyId,
      updatedAt: rows[0]?.updated_at
    },
    persisted: true
  };
}

export async function getCustomerLoginCredentials(email: string): Promise<CustomerLoginCredentials | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  if (!isProductionStoreConfigured()) {
    const fallback = getFallbackAuthCredentials();
    if (fallback.customerEmail.toLowerCase() !== normalizedEmail) return null;
    return {
      ...fallback,
      companyName: "마주식자재",
      ownerName: "정두영"
    };
  }

  try {
    const rows = await supabaseRequest<
      Array<{
        admin_email: string | null;
        admin_password: string | null;
        customer_company_id: string | null;
        customer_email: string | null;
        customer_password: string | null;
        updated_at: string | null;
      }>
    >(`auth_credentials?select=admin_email,admin_password,customer_email,customer_password,customer_company_id,updated_at&customer_email=eq.${encodeURIComponent(normalizedEmail)}&limit=1`);

    const row = rows[0];
    if (!row?.customer_email || !row.customer_company_id) return null;

    const fallback = getFallbackAuthCredentials();
    const company = await getCompanySettings(row.customer_company_id, "고객사").catch(() => null);

    return {
      adminEmail: row.admin_email || fallback.adminEmail,
      adminPassword: row.admin_password || fallback.adminPassword,
      customerEmail: row.customer_email,
      customerPassword: row.customer_password || fallback.customerPassword,
      customerCompanyId: row.customer_company_id,
      updatedAt: row.updated_at || undefined,
      companyName: company?.name || "고객사",
      ownerName: company?.ownerName
    };
  } catch (error) {
    console.error("Customer credential lookup fallback:", error);
    const fallback = getFallbackAuthCredentials();
    if (fallback.customerEmail.toLowerCase() !== normalizedEmail) return null;
    return {
      ...fallback,
      companyName: "마주식자재",
      ownerName: "정두영"
    };
  }
}

export async function getManagedCompanyAccounts(): Promise<{ companies: ManagedCompanyAccount[]; source: "sample" | "supabase" }> {
  const fallbackCredentials = getFallbackAuthCredentials();

  if (!isProductionStoreConfigured()) {
    return {
      source: "sample",
      companies: [
        {
          id: fallbackCredentials.customerCompanyId,
          name: "마주식자재",
          businessType: "식자재 유통",
          ownerName: "정두영",
          originAddress: process.env.COMPANY_ORIGIN_ADDRESS || "경기도 하남시 초이로 133 1층",
          status: "active",
          customerEmail: fallbackCredentials.customerEmail,
          customerPassword: fallbackCredentials.customerPassword,
          customerCount: getSampleCustomerMaster().length,
          salesTransactionCount: 0,
          uploadCount: 0,
          recentUploads: getSampleUploadHistory(fallbackCredentials.customerCompanyId).slice(0, 5),
          updatedAt: "샘플 기준"
        }
      ]
    };
  }

  try {
    const [companies, credentialRows, customerRows, salesRows, importRows] = await Promise.all([
      supabaseRequest<
        Array<{
          id: string;
          name: string;
          business_type: string | null;
          owner_name: string | null;
          origin_address: string | null;
          status: string;
          updated_at: string;
        }>
      >("companies?select=id,name,business_type,owner_name,origin_address,status,updated_at&order=created_at.desc"),
      supabaseRequest<
        Array<{
          customer_company_id: string | null;
          customer_email: string | null;
          customer_password: string | null;
          updated_at: string | null;
        }>
      >("auth_credentials?select=customer_company_id,customer_email,customer_password,updated_at"),
      supabaseRequest<Array<{ company_id: string }>>("normalized_customers?select=company_id"),
      supabaseRequest<Array<{ company_id: string }>>("sales_transactions?select=company_id"),
      supabaseRequest<
        Array<{
          id: string;
          company_id: string;
          row_count: number;
          status: "completed" | "running" | "failed";
          quality_score: number;
          duplicate_count: number;
          created_at: string;
          uploaded_files: { original_filename: string } | null;
          ai_reports: Array<{ id: string; health_score: number }>;
        }>
      >("customer_imports?select=id,company_id,row_count,status,quality_score,duplicate_count,created_at,uploaded_files(original_filename),ai_reports(id,health_score)&order=created_at.desc")
    ]);

    const credentialsByCompany = new Map(
      credentialRows
        .filter((row) => row.customer_company_id)
        .map((row) => [row.customer_company_id as string, row])
    );
    const customerCountByCompany = customerRows.reduce<Map<string, number>>((map, row) => {
      map.set(row.company_id, (map.get(row.company_id) || 0) + 1);
      return map;
    }, new Map());
    const salesCountByCompany = salesRows.reduce<Map<string, number>>((map, row) => {
      map.set(row.company_id, (map.get(row.company_id) || 0) + 1);
      return map;
    }, new Map());
    const uploadStatsByCompany = importRows.reduce<Map<string, { count: number; latest?: string }>>((map, row) => {
      const current = map.get(row.company_id) || { count: 0 };
      map.set(row.company_id, {
        count: current.count + 1,
        latest: current.latest || row.created_at
      });
      return map;
    }, new Map());
    const recentUploadsByCompany = importRows.reduce<Map<string, UploadHistoryItem[]>>((map, row) => {
      const uploads = map.get(row.company_id) || [];
      if (uploads.length < 5) {
        uploads.push({
          id: row.id,
          company: "",
          filename: row.uploaded_files?.original_filename || "업로드 파일",
          reportId: row.ai_reports?.[0]?.id || "",
          rows: row.row_count,
          status: row.status,
          qualityScore: row.quality_score,
          duplicateCount: row.duplicate_count,
          healthScore: row.ai_reports?.[0]?.health_score || 0,
          createdAt: new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
        });
      }
      map.set(row.company_id, uploads);
      return map;
    }, new Map());

    return {
      source: "supabase",
      companies: companies.map((company) => {
        const credentials = credentialsByCompany.get(company.id);
        const uploadStats = uploadStatsByCompany.get(company.id);
        return {
          id: company.id,
          name: company.name,
          businessType: company.business_type || "",
          ownerName: company.owner_name || "",
          originAddress: company.origin_address || "",
          status: company.status,
          customerEmail: credentials?.customer_email || "",
          customerPassword: credentials?.customer_password || "",
          customerCount: customerCountByCompany.get(company.id) || 0,
          salesTransactionCount: salesCountByCompany.get(company.id) || 0,
          uploadCount: uploadStats?.count || 0,
          lastUploadAt: uploadStats?.latest ? new Date(uploadStats.latest).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : undefined,
          recentUploads: recentUploadsByCompany.get(company.id) || [],
          updatedAt: new Date(credentials?.updated_at || company.updated_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
        };
      })
    };
  } catch (error) {
    console.error("Managed company accounts fallback:", error);
    return {
      source: "sample",
      companies: [
        {
          id: fallbackCredentials.customerCompanyId,
          name: "마주식자재",
          businessType: "식자재 유통",
          ownerName: "정두영",
          originAddress: process.env.COMPANY_ORIGIN_ADDRESS || "경기도 하남시 초이로 133 1층",
          status: "fallback",
          customerEmail: fallbackCredentials.customerEmail,
          customerPassword: fallbackCredentials.customerPassword,
          customerCount: getSampleCustomerMaster().length,
          salesTransactionCount: 0,
          uploadCount: 0,
          recentUploads: getSampleUploadHistory(fallbackCredentials.customerCompanyId).slice(0, 5),
          updatedAt: "fallback"
        }
      ]
    };
  }
}

export async function upsertManagedCompanyAccount(input: ManagedCompanyAccountInput): Promise<{ company: ManagedCompanyAccount; persisted: boolean }> {
  const companyId = input.id || globalThis.crypto.randomUUID();
  const companyName = input.name.trim();
  const customerEmail = input.customerEmail.trim().toLowerCase();

  if (!companyName) throw new Error("고객사명은 필수입니다.");
  if (!customerEmail || !input.customerPassword) throw new Error("고객사 이메일과 비밀번호는 필수입니다.");

  if (!isProductionStoreConfigured()) {
    return {
      persisted: false,
      company: {
        id: companyId,
        name: companyName,
        businessType: input.businessType || "",
        ownerName: input.ownerName || "",
        originAddress: input.originAddress || "",
        status: input.status || "active",
        customerEmail,
        customerPassword: input.customerPassword,
        customerCount: 0,
        salesTransactionCount: 0,
        uploadCount: 0,
        recentUploads: [],
        updatedAt: "로컬 샘플"
      }
    };
  }

  const adminCredentials = await getAuthCredentials();
  const now = new Date().toISOString();

  const companyRows = await supabaseRequest<
    Array<{
      id: string;
      name: string;
      business_type: string | null;
      owner_name: string | null;
      origin_address: string | null;
      status: string;
      updated_at: string;
    }>
  >("companies?on_conflict=id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([
      {
        id: companyId,
        name: companyName,
        business_type: input.businessType?.trim() || null,
        owner_name: input.ownerName?.trim() || null,
        origin_address: input.originAddress?.trim() || null,
        status: input.status || "active",
        updated_at: now
      }
    ])
  });

  await supabaseRequest("auth_credentials?on_conflict=id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([
      {
        id: companyId,
        admin_email: adminCredentials.adminEmail,
        admin_password: adminCredentials.adminPassword,
        customer_company_id: companyId,
        customer_email: customerEmail,
        customer_password: input.customerPassword,
        updated_at: now
      }
    ])
  });

  const company = companyRows[0];
  return {
    persisted: true,
    company: {
      id: company.id,
      name: company.name,
      businessType: company.business_type || "",
      ownerName: company.owner_name || "",
      originAddress: company.origin_address || "",
      status: company.status,
      customerEmail,
      customerPassword: input.customerPassword,
      customerCount: 0,
      salesTransactionCount: 0,
      uploadCount: 0,
      recentUploads: [],
      updatedAt: new Date(company.updated_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    }
  };
}

export function getSystemStatus(): SystemStatus {
  const supabaseConfigured = isProductionStoreConfigured();
  const appUrlConfigured = Boolean(process.env.NEXT_PUBLIC_APP_URL);
  const adminConfigured = Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET);
  const customerConfigured = Boolean(process.env.CUSTOMER_EMAIL && process.env.CUSTOMER_PASSWORD);
  const routeConfigured = Boolean(process.env.COMPANY_ORIGIN_ADDRESS && process.env.TMAP_API_KEY);

  return {
    appUrlConfigured,
    adminConfigured,
    customerConfigured,
    mode: supabaseConfigured ? "production-db" : "local-fallback",
    requiredEnvironment: [
      { key: "NEXT_PUBLIC_APP_URL", present: appUrlConfigured, scope: "client" },
      { key: "NEXT_PUBLIC_SUPABASE_URL", present: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL), scope: "client" },
      { key: "SUPABASE_URL", present: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL), scope: "server" },
      { key: "SUPABASE_SERVICE_ROLE_KEY 또는 SUPABASE_SECRET_KEY", present: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY), scope: "server" },
      { key: "ADMIN_EMAIL", present: Boolean(process.env.ADMIN_EMAIL), scope: "server" },
      { key: "ADMIN_PASSWORD", present: Boolean(process.env.ADMIN_PASSWORD), scope: "server" },
      { key: "ADMIN_SESSION_SECRET", present: Boolean(process.env.ADMIN_SESSION_SECRET), scope: "server" },
      { key: "CUSTOMER_EMAIL", present: Boolean(process.env.CUSTOMER_EMAIL), scope: "server" },
      { key: "CUSTOMER_PASSWORD", present: Boolean(process.env.CUSTOMER_PASSWORD), scope: "server" },
      { key: "CUSTOMER_COMPANY_ID", present: Boolean(process.env.CUSTOMER_COMPANY_ID), scope: "server" },
      { key: "COMPANY_ORIGIN_ADDRESS", present: Boolean(process.env.COMPANY_ORIGIN_ADDRESS), scope: "server" },
      { key: "TMAP_API_KEY", present: Boolean(process.env.TMAP_API_KEY), scope: "server" }
    ],
    services: [
      {
        name: "Supabase Postgres",
        status: supabaseConfigured ? "ready" : "fallback",
        description: supabaseConfigured ? "실 DB 적재 모드입니다." : "환경변수가 없어 서버 저장을 확인할 수 없습니다."
      },
      {
        name: "Admin Auth",
        status: adminConfigured ? "ready" : "fallback",
        description: adminConfigured ? "관리자 환경변수가 설정되었습니다." : "로컬 기본 관리자 계정을 사용합니다."
      },
      {
        name: "Customer Auth",
        status: customerConfigured ? "ready" : "fallback",
        description: customerConfigured ? "고객사 환경변수가 설정되었습니다." : "로컬 기본 고객사 계정을 사용합니다."
      },
      {
        name: "Analysis Pipeline",
        status: "ready",
        description: "엑셀 분석, raw 저장, 정제, 리포트, 리드 추천 흐름이 준비되었습니다."
      },
      {
        name: "Revenue Intelligence",
        status: "ready",
        description: "방문 결과 기반 매출 파이프라인 계산이 준비되었습니다."
      },
      {
        name: "Route Intelligence",
        status: routeConfigured ? "ready" : "fallback",
        description: routeConfigured
          ? "회사 출발지와 Tmap API 키가 설정되어 거리/시간/경로 계산을 붙일 수 있습니다."
          : "회사 출발지 또는 Tmap API 키가 없어 주소 텍스트/기존 캐시 기준으로 동작합니다."
      },
      {
        name: "Customer Attachment Storage",
        status: supabaseConfigured ? "ready" : "fallback",
        description: supabaseConfigured
          ? "사업자등록증, 통장사본, 배송 적재위치 사진/영상 업로드 API가 실 Storage를 사용합니다."
          : "Supabase 환경변수가 없어 첨부 업로드는 샘플 응답으로만 동작합니다."
      }
    ],
    databaseChecks: [],
    storageChecks: []
  };
}

export async function getSystemDiagnostics(): Promise<SystemStatus> {
  const system = getSystemStatus();

  if (!isProductionStoreConfigured()) {
    return {
      ...system,
      databaseChecks: [
        {
          name: "Supabase 연결",
          status: "fallback",
          count: null,
          description: "환경변수가 없어 DB 조회를 건너뛰었습니다. 서버 환경변수를 등록한 뒤 다시 확인하세요."
        }
      ],
      storageChecks: [
        {
          name: "customer-attachments 버킷",
          status: "fallback",
          count: null,
          description: "환경변수가 없어 Storage 버킷 조회를 건너뛰었습니다."
        }
      ]
    };
  }

  const [checks, storageChecks] = await Promise.all([
    Promise.all([
    countTableRows("companies", "고객사", "등록된 고객사 수입니다."),
    countTableRows("customer_imports", "업로드/분석 이력", "엑셀 업로드 후 생성되는 import job입니다."),
    countTableRows("normalized_customers", "정제 거래처", "정제되어 저장된 거래처 row입니다."),
    countTableRows("customer_notes", "거래처 메모", "거래처별 상담, 배송 특이사항, 후속 액션 기록입니다."),
    countTableRows("customer_attachments", "거래처 첨부자료", "사업자등록증, 통장사본, 배송 적재위치 사진/영상 기록입니다."),
    countTableRows("sales_transactions", "매출 거래내역", "ERP 엑셀에서 적재된 일자/품목/금액 단위 거래내역입니다."),
    countTableRows("route_distance_cache", "티맵 경로 캐시", "회사 출발지에서 거래처 도착지까지 계산된 거리/시간/경로입니다."),
    countTableRows("ai_reports", "AI 리포트", "Company Diagnosis 리포트 수입니다."),
    countTableRows("lead_recommendations", "추천 리드", "AI Lead Recommendation 결과입니다."),
    countTableRows("visit_results", "방문 결과", "영업 방문/상담 기록입니다."),
    checkDemoCompany()
    ]),
    Promise.all([
      checkStorageBucket(CUSTOMER_ATTACHMENT_BUCKET, "첨부자료 Storage", "사업자등록증, 통장사본, 배송 적재위치 파일이 저장되는 비공개 버킷입니다.")
    ])
  ]);

  return {
    ...system,
    databaseChecks: checks,
    storageChecks
  };
}

export async function getCustomerMaster(companyId?: string): Promise<{ customers: CustomerMasterItem[]; source: "sample" | "supabase" }> {
  const id = companyId || getDefaultCompanyId();

  if (!isProductionStoreConfigured()) {
    return {
      customers: getSampleCustomerMaster(),
      source: "sample"
    };
  }

  const rows = await supabaseRequest<
    Array<{
      id: string;
      address: string | null;
      bank_account_file_url: string | null;
      birth_date: string | null;
      business_license_file_url: string | null;
      business_registration_number: string | null;
      business_status: string | null;
      business_status_checked_at: string | null;
      customer_name: string;
      delivery_km: number | string | null;
      delivery_manager: string | null;
      delivery_minutes: number | null;
      delivery_zone: string | null;
      email: string | null;
      industry: string | null;
      last_order_days: number | null;
      monthly_revenue: number | string | null;
      opening_date: string | null;
      phone: string | null;
      region: string | null;
      representative_name: string | null;
      visit_count: number | null;
      loading_position: string | null;
    }>
  >(
    `normalized_customers?select=id,customer_name,business_registration_number,representative_name,opening_date,region,address,phone,email,birth_date,industry,monthly_revenue,last_order_days,visit_count,delivery_km,delivery_minutes,delivery_manager,delivery_zone,loading_position,business_status,business_status_checked_at,business_license_file_url,bank_account_file_url&company_id=eq.${encodeURIComponent(
      id
    )}&order=created_at.desc&limit=1000`
  );

  return {
    customers: rows.map((row, index) => toCustomerMasterItem(row, index)),
    source: "supabase"
  };
}

export async function upsertCustomerMaster(input: CustomerMasterInput, companyId?: string) {
  const customerName = input.customerName.trim();
  if (!customerName) throw new Error("거래처명은 필수입니다.");

  const fallbackItem = toCustomerMasterItem(
    {
      id: `local-${makeNormalizedKey({
        address: input.address || "",
        companyName: "마주식자재",
        customerName,
        deliveryKm: input.deliveryKm || 0,
        industry: input.industry || "미분류",
        lastOrderDays: input.lastOrderDays || 0,
        monthlyRevenue: input.monthlyRevenue || 0,
        region: input.region || "미분류",
        visitCount: input.visitCount || 0
      })}`,
      address: input.address || "",
      bank_account_file_url: input.bankAccountFileUrl || null,
      birth_date: input.birthDate || null,
      business_license_file_url: input.businessLicenseFileUrl || null,
      business_registration_number: normalizeBusinessNumber(input.businessNumber || ""),
      business_status: input.businessStatus || "확인 예정",
      business_status_checked_at: null,
      customer_name: customerName,
      delivery_km: input.deliveryKm || 0,
      delivery_manager: input.deliveryManager || null,
      delivery_minutes: input.deliveryMinutes || null,
      delivery_zone: input.deliveryZone || null,
      email: input.email || null,
      industry: input.industry || "미분류",
      last_order_days: input.lastOrderDays || 0,
      monthly_revenue: input.monthlyRevenue || 0,
      opening_date: input.openingDate || null,
      phone: input.phone || null,
      region: input.region || "미분류",
      representative_name: input.representativeName || null,
      visit_count: input.visitCount || 0,
      loading_position: input.loadingPosition || null
    },
    0
  );

  if (!isProductionStoreConfigured()) {
    return {
      customer: fallbackItem,
      persisted: false
    };
  }

  const id = companyId || getDefaultCompanyId();
  await upsertCompany(id, "마주식자재");
  const importId = await createManualCustomerImport(id);
  const businessNumber = normalizeBusinessNumber(input.businessNumber || "");
  const normalizedKey = businessNumber || makeCustomerKey(customerName, input.address || "");

  const rows = await supabaseRequest<Array<Record<string, unknown>>>("normalized_customers?on_conflict=company_id,normalized_key", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([
      {
        address: input.address || null,
        bank_account_file_url: input.bankAccountFileUrl || null,
        birth_date: toPostgresDate(input.birthDate),
        business_license_file_url: input.businessLicenseFileUrl || null,
        business_registration_number: businessNumber || null,
        business_status: input.businessStatus || "확인 예정",
        business_status_checked_at: null,
        company_id: id,
        customer_name: customerName,
        delivery_km: input.deliveryKm || 0,
        delivery_manager: input.deliveryManager || null,
        delivery_minutes: input.deliveryMinutes || null,
        delivery_zone: input.deliveryZone || null,
        email: input.email || null,
        import_id: importId,
        industry: input.industry || "미분류",
        last_order_days: input.lastOrderDays || 0,
        monthly_revenue: input.monthlyRevenue || 0,
        normalized_key: normalizedKey,
        opening_date: toPostgresDate(input.openingDate),
        phone: input.phone || null,
        region: input.region || "미분류",
        representative_name: input.representativeName || null,
        visit_count: input.visitCount || 0,
        loading_position: input.loadingPosition || null
      }
    ])
  });

  return {
    customer: toCustomerMasterItem(toNormalizedCustomerRow(rows[0]), 0),
    persisted: true
  };
}

export async function getCustomerOperations(customerId: string, companyId?: string) {
  const id = companyId || getDefaultCompanyId();

  if (!isProductionStoreConfigured() || customerId.startsWith("sample-") || customerId.startsWith("local-")) {
    return {
      attachments: getSampleCustomerAttachments(customerId),
      notes: getSampleCustomerNotes(),
      source: "sample" as const
    };
  }

  const [notes, attachments] = await Promise.all([
    supabaseRequest<
      Array<{
        id: string;
        created_at: string;
        created_by_name: string | null;
        memo: string;
        next_action: string | null;
        note_type: string;
      }>
    >(
      `customer_notes?select=id,note_type,memo,next_action,created_by_name,created_at&company_id=eq.${encodeURIComponent(id)}&customer_id=eq.${encodeURIComponent(
        customerId
      )}&order=created_at.desc&limit=50`
    ),
    supabaseRequest<
      Array<{
        id: string;
        attachment_type: string;
        created_at: string;
        file_url: string | null;
        mime_type: string | null;
        storage_path: string | null;
        title: string;
      }>
    >(
      `customer_attachments?select=id,attachment_type,title,file_url,mime_type,storage_path,created_at&company_id=eq.${encodeURIComponent(
        id
      )}&customer_id=eq.${encodeURIComponent(customerId)}&order=created_at.desc&limit=50`
    )
  ]);

  return {
    attachments: attachments.map(toCustomerAttachmentItem),
    notes: notes.map(toCustomerNoteItem),
    source: "supabase" as const
  };
}

export async function addCustomerNote(
  input: { customerId: string; memo: string; nextAction?: string; noteType?: string; createdByName?: string },
  companyId?: string
) {
  const memo = input.memo.trim();
  if (!memo) throw new Error("메모 내용은 필수입니다.");

  if (!isProductionStoreConfigured() || input.customerId.startsWith("sample-") || input.customerId.startsWith("local-")) {
    return {
      note: {
        id: `local-note-${Date.now()}`,
        createdAt: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
        createdByName: input.createdByName || "현장 사용자",
        memo,
        nextAction: input.nextAction || "",
        noteType: input.noteType || "general"
      },
      persisted: false
    };
  }

  const rows = await supabaseRequest<
    Array<{
      id: string;
      created_at: string;
      created_by_name: string | null;
      memo: string;
      next_action: string | null;
      note_type: string;
    }>
  >("customer_notes", {
    method: "POST",
    body: JSON.stringify([
      {
        company_id: companyId || getDefaultCompanyId(),
        customer_id: input.customerId,
        created_by_name: input.createdByName || "현장 사용자",
        memo,
        next_action: input.nextAction || null,
        note_type: input.noteType || "general"
      }
    ])
  });

  return {
    note: toCustomerNoteItem(rows[0]),
    persisted: true
  };
}

export async function addCustomerAttachment(
  input: {
    attachmentType: string;
    customerId: string;
    fileUrl?: string;
    mimeType?: string;
    storagePath?: string;
    title: string;
    createdByName?: string;
  },
  companyId?: string
) {
  const title = input.title.trim();
  if (!title) throw new Error("첨부자료명은 필수입니다.");

  if (!isProductionStoreConfigured() || input.customerId.startsWith("sample-") || input.customerId.startsWith("local-")) {
    return {
      attachment: {
        id: `local-attachment-${Date.now()}`,
        attachmentType: input.attachmentType || "etc",
        createdAt: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
        fileUrl: input.fileUrl || "",
        mimeType: input.mimeType || "",
        storagePath: input.storagePath,
        title
      },
      persisted: false
    };
  }

  const rows = await supabaseRequest<
    Array<{
      id: string;
      attachment_type: string;
      created_at: string;
      file_url: string | null;
      mime_type: string | null;
      storage_path: string | null;
      title: string;
    }>
  >("customer_attachments", {
    method: "POST",
    body: JSON.stringify([
      {
        attachment_type: input.attachmentType || "etc",
        company_id: companyId || getDefaultCompanyId(),
        created_by_name: input.createdByName || "현장 사용자",
        customer_id: input.customerId,
        file_url: input.fileUrl || null,
        mime_type: input.mimeType || null,
        storage_path: input.storagePath || null,
        title
      }
    ])
  });

  return {
    attachment: toCustomerAttachmentItem(rows[0]),
    persisted: true
  };
}

export async function uploadCustomerAttachmentFile(
  input: {
    attachmentType: string;
    bytes: ArrayBuffer;
    companyId?: string;
    contentType: string;
    createdByName?: string;
    customerId: string;
    filename: string;
    title: string;
  }
) {
  const companyId = input.companyId || getDefaultCompanyId();
  const title = input.title.trim() || input.filename;

  if (!isProductionStoreConfigured() || input.customerId.startsWith("sample-") || input.customerId.startsWith("local-")) {
    return {
      attachment: {
        id: `local-upload-${Date.now()}`,
        attachmentType: input.attachmentType || "etc",
        createdAt: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
        fileUrl: "",
        mimeType: input.contentType,
        storagePath: undefined,
        title
      },
      persisted: false,
      uploaded: false
    };
  }

  const storagePath = `${companyId}/${input.customerId}/${Date.now()}-${sanitizeStorageFilename(input.filename)}`;
  await supabaseStorageRequest(`object/${CUSTOMER_ATTACHMENT_BUCKET}/${storagePath}`, {
    method: "POST",
    headers: {
      "Content-Type": input.contentType || "application/octet-stream",
      "x-upsert": "true"
    },
    body: input.bytes
  });

  const result = await addCustomerAttachment(
    {
      attachmentType: input.attachmentType || "etc",
      createdByName: input.createdByName,
      customerId: input.customerId,
      fileUrl: `/api/customer-attachments/file?path=${encodeURIComponent(storagePath)}`,
      mimeType: input.contentType,
      storagePath,
      title
    },
    companyId
  );

  return {
    ...result,
    uploaded: true
  };
}

export async function createCustomerAttachmentSignedUrl(storagePath: string) {
  if (!isProductionStoreConfigured()) throw new Error("Supabase is not configured.");
  const cleanPath = storagePath.replace(/^\/+/, "");
  const result = await supabaseStorageRequest<{ signedURL: string }>(
    `object/sign/${CUSTOMER_ATTACHMENT_BUCKET}/${encodeStoragePath(cleanPath)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ expiresIn: 60 * 10 })
    }
  );

  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");
  return result.signedURL.startsWith("http") ? result.signedURL : `${config.url}/storage/v1${result.signedURL}`;
}

async function countTableRows(table: string, name: string, description: string): Promise<DatabaseCheck> {
  try {
    const count = await supabaseCount(table);
    return {
      name,
      status: "ready",
      count,
      description
    };
  } catch (error) {
    return {
      name,
      status: "missing",
      count: null,
      description: `${description} ${getErrorMessage(error)}`
    };
  }
}

async function checkDemoCompany(): Promise<DatabaseCheck> {
  try {
    const rows = await supabaseRequest<Array<{ id: string }>>(
      `companies?select=id&id=eq.${encodeURIComponent(getDefaultCompanyId())}&limit=1`
    );

    return {
      name: "데모 고객사 UUID",
      status: rows.length ? "ready" : "missing",
      count: rows.length,
      description: rows.length
        ? "CUSTOMER_COMPANY_ID와 Supabase companies.id가 연결되어 있습니다."
        : "seed.sql을 실행했거나 CUSTOMER_COMPANY_ID가 실제 companies.id와 일치하는지 확인해야 합니다."
    };
  } catch (error) {
    return {
      name: "데모 고객사 UUID",
      status: "missing",
      count: null,
      description: getErrorMessage(error)
    };
  }
}

async function checkStorageBucket(bucketId: string, name: string, description: string): Promise<DatabaseCheck> {
  try {
    const bucket = await supabaseStorageRequest<{ id: string; name: string; public: boolean }>(`bucket/${encodeURIComponent(bucketId)}`);
    return {
      name,
      status: "ready",
      count: null,
      description: `${description} 현재 ${bucket.public ? "공개" : "비공개"} 버킷으로 설정되어 있습니다.`
    };
  } catch (error) {
    return {
      name,
      status: "missing",
      count: null,
      description: `${description} ${getErrorMessage(error)}`
    };
  }
}

async function supabaseCount(table: string) {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");

  const response = await fetch(`${config.url}/rest/v1/${table}?select=id&limit=1`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      Prefer: "count=exact"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`조회 실패: ${response.status} ${message}`);
  }

  const contentRange = response.headers.get("content-range");
  const count = Number(contentRange?.split("/")[1]);
  return Number.isFinite(count) ? count : 0;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}

export async function saveAnalysis(
  rows: CustomerRow[],
  companyName = "업로드 고객사",
  options: {
    companyId?: string;
    rawRows?: RawUploadRow[];
    columnMapping?: ColumnMapping;
    originalFilename?: string;
    actorName?: string;
    uploadType?: "customer-master" | "sales-analysis";
  } = {}
) {
  let report = analyzeCompany(rows.length ? rows : sampleCustomers);
  const duplicateCount = countDuplicates(rows);
  const qualityScore = estimateQualityScore(rows);

  if (!isProductionStoreConfigured()) {
    return {
      persisted: false,
      report,
      pipeline: {
        rows: rows.length,
        rawRows: options.rawRows?.length || 0,
        columnMappings: Object.keys(options.columnMapping || {}).length,
        duplicateCount,
        qualityScore
      }
    };
  }

  const companyId = options.companyId || getDefaultCompanyId();
  await upsertCompany(companyId, report.companyName || companyName);

  const files = await supabaseRequest<Array<{ id: string }>>("uploaded_files", {
    method: "POST",
    body: JSON.stringify([
      {
        company_id: companyId,
        original_filename: options.originalFilename || "browser-upload.xlsx",
        status: "processed"
      }
    ])
  });
  const uploadedFileId = files[0].id;

  const imports = await supabaseRequest<Array<{ id: string }>>("customer_imports", {
    method: "POST",
    body: JSON.stringify([
      {
        company_id: companyId,
        uploaded_file_id: uploadedFileId,
        source: options.uploadType || "excel",
        row_count: rows.length,
        status: "completed",
        quality_score: qualityScore,
        duplicate_count: duplicateCount,
        completed_at: new Date().toISOString()
      }
    ])
  });
  const importId = imports[0].id;

  const mappingRows = Object.entries(options.columnMapping || {}).map(([targetField, sourceHeader]) => ({
    company_id: companyId,
    import_id: importId,
    source_header: sourceHeader,
    target_field: targetField,
    confidence: 100
  }));

  if (mappingRows.length) {
    await supabaseRequest("column_mappings", {
      method: "POST",
      body: JSON.stringify(mappingRows)
    });
  }

  const rawRows = (options.rawRows?.length ? options.rawRows : rows).map((row, index) => ({
    company_id: companyId,
    import_id: importId,
    row_index: index + 1,
    raw_data: row
  }));

  if (rawRows.length) {
    await supabaseRequest("raw_customer_rows", {
      method: "POST",
      body: JSON.stringify(rawRows)
    });
  }

  if (options.uploadType === "sales-analysis" && options.rawRows?.length) {
    await saveSalesTransactions(companyId, importId, options.rawRows, options.columnMapping || {});
  }

  const normalizedRows = rows.map((row, index) => {
    const rawRow = options.rawRows?.[index];
    const businessRegistrationNumber = rawRow ? normalizeBusinessNumber(getRawCell(rawRow, options.columnMapping?.businessRegistrationNumber)) : "";
    const normalizedKey = businessRegistrationNumber || makeNormalizedKey(row);
    const baseRow: Record<string, unknown> = {
      company_id: companyId,
      import_id: importId,
      customer_name: row.customerName,
      business_registration_number: businessRegistrationNumber || null,
      representative_name: rawRow ? getRawCell(rawRow, options.columnMapping?.representativeName) || null : null,
      opening_date: rawRow ? toPostgresDate(rawRow[options.columnMapping?.openingDate || ""]) : null,
      region: row.region,
      address: row.address,
      phone: rawRow ? getRawCell(rawRow, options.columnMapping?.phone) || null : null,
      email: rawRow ? getRawCell(rawRow, options.columnMapping?.email) || null : null,
      birth_date: rawRow ? toPostgresDate(rawRow[options.columnMapping?.birthDate || ""]) : null,
      industry: row.industry,
      monthly_revenue: row.monthlyRevenue,
      last_order_days: row.lastOrderDays,
      visit_count: row.visitCount,
      normalized_key: normalizedKey,
      duplicate_of: null
    };

    if (options.uploadType !== "sales-analysis" || row.deliveryKm > 0) {
      baseRow.delivery_km = row.deliveryKm;
    }

    return baseRow;
  });

  if (normalizedRows.length) {
    await supabaseRequest("normalized_customers?on_conflict=company_id,normalized_key", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(normalizedRows)
    });
  }

  const masterRows = await getNormalizedCustomersForAnalysis(companyId);
  report = analyzeCompany(masterRows.length ? masterRows : rows);

  const legacyCustomerRows = rows.map((row) => ({
    company_id: companyId,
    import_id: importId,
    customer_name: row.customerName,
    region: row.region,
    address: row.address,
    industry: row.industry,
    monthly_revenue: row.monthlyRevenue,
    last_order_days: row.lastOrderDays,
    visit_count: row.visitCount,
    delivery_km: row.deliveryKm
  }));

  await supabaseRequest("admin_audit_logs", {
    method: "POST",
    body: JSON.stringify([
      {
        company_id: companyId,
        action: "excel_upload_analyzed",
        target_type: "customer_import",
        target_id: importId,
        metadata: {
          actorName: options.actorName || "local-mvp-user",
          rows: rows.length,
          rawRows: rawRows.length,
          mappings: mappingRows.length,
          duplicateCount,
          qualityScore
        }
      }
    ])
  });

  if (legacyCustomerRows.length) {
    await supabaseRequest("customer_rows", {
      method: "POST",
      body: JSON.stringify(legacyCustomerRows)
    }).catch(() => null);
  }

  const reports = await supabaseRequest<Array<{ id: string }>>("ai_reports", {
    method: "POST",
    body: JSON.stringify([
      {
        company_id: companyId,
        import_id: importId,
        health_score: report.health.total,
        report
      }
    ])
  });
  const reportId = reports[0].id;

  await supabaseRequest("health_score_snapshots", {
    method: "POST",
    body: JSON.stringify([
      {
        company_id: companyId,
        report_id: reportId,
        total: report.health.total,
        sales_power: report.health.salesPower,
        delivery_efficiency: report.health.deliveryEfficiency,
        crm_management: report.health.crmManagement,
        new_sales: report.health.newSales,
        concentration: report.health.concentration,
        risk: report.health.risk,
        formula_version: "v1"
      }
    ])
  });

  const leads = report.leadRecommendations.map((lead) => ({
    company_id: companyId,
    report_id: reportId,
    name: lead.name,
    region: lead.region,
    score: lead.score,
    reasons: lead.reasons,
    status: lead.score >= 90 ? "today" : "this-week"
  }));

  if (leads.length) {
    await supabaseRequest("lead_recommendations", {
      method: "POST",
      body: JSON.stringify(leads)
    });
  }

  return {
    persisted: true,
    companyId,
    uploadedFileId,
    importId,
    reportId,
    report,
    pipeline: {
      rows: rows.length,
      rawRows: rawRows.length,
      columnMappings: mappingRows.length,
      duplicateCount,
      qualityScore
    }
  };
}

export async function getLatestReport(companyId?: string): Promise<AnalysisResult> {
  if (!isProductionStoreConfigured()) return analyzeCompany(sampleCustomers);

  try {
    const companyFilter = companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "";
    const reports = await supabaseRequest<Array<{ report: AnalysisResult }>>(
      `ai_reports?select=report${companyFilter}&order=created_at.desc&limit=1`
    );
    return reports[0]?.report || analyzeCompany(sampleCustomers);
  } catch (error) {
    console.error("Latest report fallback:", error);
    return analyzeCompany(sampleCustomers);
  }
}

export async function getReportById(reportId: string, companyId?: string): Promise<AnalysisResult | null> {
  if (!isProductionStoreConfigured()) return analyzeCompany(sampleCustomers);

  const companyFilter = companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "";
  const reports = await supabaseRequest<Array<{ report: AnalysisResult }>>(
    `ai_reports?select=report&id=eq.${encodeURIComponent(reportId)}${companyFilter}&limit=1`
  );

  return reports[0]?.report || null;
}

export async function getLatestBriefing(companyId?: string) {
  const [report, customerMaster] = await Promise.all([
    getLatestReport(companyId),
    getCustomerMaster(companyId).catch(() => ({ customers: getSampleCustomerMaster(), source: "sample" as const }))
  ]);
  const currentCustomers = customerMaster.customers.length || report.customers;

  return {
    greeting: "안녕하세요 정두영님.",
    currentCustomers,
    weeklyOpportunities: report.newOpportunities,
    todayRecommendations: Math.min(12, report.leadRecommendations.length),
    highProbability: report.highProbabilityCount,
    routeLeads: report.routeLeads,
    missingRegions: report.missingRegions,
    healthScore: report.health.total,
    source: isProductionStoreConfigured() ? "supabase" : "sample"
  };
}

function getSampleBriefing() {
  const report = analyzeCompany(sampleCustomers);
  return {
    greeting: "안녕하세요 정두영님.",
    currentCustomers: report.customers,
    weeklyOpportunities: report.newOpportunities,
    todayRecommendations: Math.min(12, report.leadRecommendations.length),
    highProbability: report.highProbabilityCount,
    routeLeads: report.routeLeads,
    missingRegions: report.missingRegions,
    healthScore: report.health.total,
    source: "sample"
  };
}

export async function getLatestLeads(companyId?: string) {
  if (!isProductionStoreConfigured()) return getLeadPayload();

  try {
    const companyFilter = companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "";
    const rows = await supabaseRequest<
      Array<{ id: string; name: string; region: string; score: number; reasons: string[]; status: LeadStatus | string }>
    >(`lead_recommendations?select=id,name,region,score,reasons,status${companyFilter}&order=score.desc&limit=50`);

    return {
      total: rows.length,
      leads: rows.map((lead) => ({
        ...lead,
        expectedRevenue: Math.round(lead.score * 2.8)
      }))
    };
  } catch (error) {
    console.error("Latest leads fallback:", error);
    return getLeadPayload();
  }
}

export async function updateLeadStatus(leadId: string, status: LeadStatus, companyId?: string) {
  if (!isProductionStoreConfigured()) {
    return { persisted: false, id: leadId, status };
  }

  const companyFilter = companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "";
  const rows = await supabaseRequest<Array<{ id: string; status: LeadStatus }>>(`lead_recommendations?id=eq.${encodeURIComponent(leadId)}${companyFilter}`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });

  return { persisted: true, id: rows[0]?.id || leadId, status: rows[0]?.status || status };
}

export async function getTodayRoutePlan(companyId?: string): Promise<RoutePlan> {
  const routeCache = await getRouteDistanceCacheMap(companyId || getDefaultCompanyId());
  const customerMaster = await getCustomerMaster(companyId).catch(() => ({ customers: getSampleCustomerMaster(), source: "sample" as const }));
  const planned = customerMaster.customers
    .map((customer, index) => {
      const address = customer.address || `${customer.region || "미분류"} ${customer.customerName}`;
      const cached = routeCache.get(address);
      const distanceKm = cached?.distanceKm ?? customer.deliveryKm;
      const routeProvider: RoutePlanStop["routeProvider"] = cached ? "cached" : customerMaster.source === "supabase" ? "estimated" : "sample";

      return {
        id: customer.id || `customer-${index + 1}`,
        name: customer.customerName,
        region: customer.region || "미분류",
        score: Math.max(50, Math.min(99, Math.round(Number(customer.monthlyRevenue || 0) / 5))),
        reasons: ["거래처 원장 기준", customer.grade ? `${customer.grade}등급` : "등급 산정", customer.deliveryManager || "담당자 배정"],
        status: index < 15 ? "today" : "visit-planned",
        expectedRevenue: Number(customer.monthlyRevenue || 0),
        address,
        birthDate: customer.birthDate,
        businessNumber: customer.businessNumber,
        businessStatus: customer.businessStatus,
        distanceKm,
        durationMinutes: cached?.durationMinutes ?? customer.deliveryMinutes ?? estimateMinutesFromKm(distanceKm),
        email: customer.email,
        industry: customer.industry,
        loadingPosition: customer.loadingPosition,
        openingDate: customer.openingDate,
        phone: customer.phone,
        representativeName: customer.representativeName,
        deliveryArea: customer.deliveryZone || customer.region || "미분류",
        deliveryDriver: customer.deliveryManager,
        order: index + 1,
        routeCalculatedAt: cached?.calculatedAt,
        routeProvider
      };
    });

  const groupMap = new Map<string, RoutePlanStop[]>();
  planned.forEach((lead) => {
    const region = lead.region || "미분류";
    groupMap.set(region, [...(groupMap.get(region) || []), lead]);
  });

  const groups = Array.from(groupMap.entries())
    .map(([region, stops]) => ({
      region,
      stops,
      expectedRevenue: stops.reduce((total, stop) => total + stop.expectedRevenue, 0),
      totalDistanceKm: roundToOneDecimal(stops.reduce((total, stop) => total + Number(stop.distanceKm || 0), 0)),
      totalDurationMinutes: stops.reduce((total, stop) => total + Number(stop.durationMinutes || 0), 0)
    }))
    .sort((a, b) => b.expectedRevenue - a.expectedRevenue);

  return {
    groups,
    totalDistanceKm: roundToOneDecimal(planned.reduce((total, stop) => total + Number(stop.distanceKm || 0), 0)),
    totalDurationMinutes: planned.reduce((total, stop) => total + Number(stop.durationMinutes || 0), 0),
    totalExpectedRevenue: planned.reduce((total, stop) => total + stop.expectedRevenue, 0),
    totalStops: planned.length
  };
}

export async function getCompanyOriginAddress(companyId?: string) {
  const settings = await getCompanySettings(companyId).catch(() => null);
  return settings?.originAddress || process.env.COMPANY_ORIGIN_ADDRESS || "경기도 하남시 초이로 133 1층";
}

export async function saveRouteDistanceCache(
  companyId: string | undefined,
  result: RouteDistanceResult,
  options: { customerId?: string | null } = {}
) {
  const resolvedCompanyId = companyId || getDefaultCompanyId();

  if (!isProductionStoreConfigured()) {
    return {
      persisted: false,
      ...result
    };
  }

  const rows = await supabaseRequest<
    Array<{
      calculated_at: string;
      distance_km: number | string;
      duration_minutes: number;
      id: string;
      provider: string;
    }>
  >("route_distance_cache?on_conflict=company_id,destination_address", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([
      {
        company_id: resolvedCompanyId,
        customer_id: options.customerId || null,
        origin_address: result.originAddress,
        destination_address: result.destinationAddress,
        origin_lat: result.originPoint?.lat ?? null,
        origin_lng: result.originPoint?.lng ?? null,
        destination_lat: result.destinationPoint?.lat ?? null,
        destination_lng: result.destinationPoint?.lng ?? null,
        distance_km: result.distanceKm,
        duration_minutes: result.durationMinutes,
        provider: result.provider,
        route_geometry: result.routeGeometry,
        raw_response: result.rawResponse,
        calculated_at: new Date().toISOString()
      }
    ])
  });

  return {
    persisted: true,
    cacheId: rows[0]?.id,
    ...result,
    calculatedAt: rows[0]?.calculated_at
  };
}

async function getRouteDistanceCacheMap(companyId: string) {
  const cache = new Map<
    string,
    {
      calculatedAt: string;
      distanceKm: number;
      durationMinutes: number;
    }
  >();

  if (!isProductionStoreConfigured()) return cache;

  const rows = await supabaseRequest<
    Array<{
      calculated_at: string;
      destination_address: string;
      distance_km: number | string;
      duration_minutes: number;
    }>
  >(
    `route_distance_cache?select=destination_address,distance_km,duration_minutes,calculated_at&company_id=eq.${encodeURIComponent(
      companyId
    )}&order=calculated_at.desc&limit=1000`
  ).catch(() => []);

  rows.forEach((row) => {
    if (!cache.has(row.destination_address)) {
      cache.set(row.destination_address, {
        calculatedAt: new Date(row.calculated_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
        distanceKm: Number(row.distance_km || 0),
        durationMinutes: Number(row.duration_minutes || 0)
      });
    }
  });

  return cache;
}

function findSampleCustomerForLead(lead: LeadItem) {
  const region = lead.region || "";
  const name = lead.name || "";

  return (
    sampleCustomers.find((customer) => customer.customerName === name) ||
    sampleCustomers.find((customer) => name.includes(customer.region) || customer.region === region) ||
    sampleCustomers.find((customer) => customer.region === region)
  );
}

function estimateMinutesFromKm(distanceKm?: number) {
  if (!distanceKm) return undefined;
  return Math.max(10, Math.round(distanceKm * 2.2));
}

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

export async function saveVisitResult(input: {
  companyId?: string;
  expectedRevenue?: number;
  leadId: string;
  memo?: string;
  nextAction?: string;
  result: VisitResult;
}) {
  if (!isProductionStoreConfigured()) {
    return { persisted: false, ...input };
  }

  const rows = await supabaseRequest<Array<{ id: string }>>("visit_results", {
    method: "POST",
    body: JSON.stringify([
      {
        company_id: input.companyId || getDefaultCompanyId(),
        lead_id: input.leadId,
        result: input.result,
        memo: input.memo || null,
        next_action: input.nextAction || null,
        expected_revenue: input.expectedRevenue || null
      }
    ])
  });

  if (input.result === "quote-requested" || input.result === "interested") {
    await updateLeadStatus(input.leadId, "high-probability", input.companyId).catch(() => null);
  }

  return { persisted: true, id: rows[0]?.id, ...input };
}

export async function getVisitTimeline(companyId?: string): Promise<VisitTimelineItem[]> {
  if (!isProductionStoreConfigured()) return getSampleVisitTimeline();

  const companyFilter = companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "";
  const rows = await supabaseRequest<
    Array<{
      id: string;
      result: VisitResult | string;
      memo: string | null;
      next_action: string | null;
      expected_revenue: number | null;
      visited_at: string;
      lead_recommendations: { name: string; region: string } | null;
    }>
  >(
    `visit_results?select=id,result,memo,next_action,expected_revenue,visited_at,lead_recommendations(name,region)${companyFilter}&order=visited_at.desc&limit=30`
  );

  return rows.map((row) => ({
    id: row.id,
    leadName: row.lead_recommendations?.name || "리드",
    region: row.lead_recommendations?.region || "미분류",
    result: row.result,
    memo: row.memo || "",
    nextAction: row.next_action || "",
    expectedRevenue: Number(row.expected_revenue || 0),
    visitedAt: new Date(row.visited_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
  }));
}

export async function getRevenuePipeline(companyId?: string): Promise<RevenuePipeline> {
  const timeline = await getVisitTimeline(companyId);
  const items = timeline
    .filter((item) => item.result === "quote-requested" || item.result === "interested" || item.result === "pending" || item.result === "failed")
    .map((item) => {
      const probability = getRevenueProbability(item.result);
      return {
        ...item,
        probability,
        weightedRevenue: Math.round(item.expectedRevenue * probability)
      };
    });

  const quoteRequests = items.filter((item) => item.result === "quote-requested").length;
  const interested = items.filter((item) => item.result === "interested").length;
  const pending = items.filter((item) => item.result === "pending").length;
  const failed = items.filter((item) => item.result === "failed").length;
  const expectedRevenue = items.reduce((total, item) => total + item.expectedRevenue, 0);
  const weightedRevenue = items.reduce((total, item) => total + item.weightedRevenue, 0);
  const conversionRate = items.length ? Math.round(((quoteRequests + interested * 0.55) / items.length) * 100) : 0;

  return {
    quoteRequests,
    interested,
    pending,
    failed,
    expectedRevenue,
    weightedRevenue,
    conversionRate,
    items
  };
}

export async function getSalesTransactions(companyId?: string): Promise<SalesTransactionSummary> {
  const id = companyId || getDefaultCompanyId();

  if (!isProductionStoreConfigured()) {
    const items = sampleCustomers.slice(0, 12).map((customer, index) => ({
      id: `sample-sales-${index + 1}`,
      customerName: customer.customerName,
      businessRegistrationNumber: `123${String(10 + index).padStart(2, "0")}${String(10000 + index).padStart(5, "0")}`,
      salesDate: `2026-07-${String(1 + (index % 10)).padStart(2, "0")}`,
      productName: ["쌀 20kg", "식용유", "돈육", "김치", "야채믹스"][index % 5],
      quantity: 1 + (index % 8),
      salesAmount: customer.monthlyRevenue * 10000,
      createdAt: "샘플 기준"
    }));
    return summarizeSalesTransactions(items);
  }

  const rows = await supabaseRequest<
    Array<{
      id: string;
      customer_name: string;
      business_registration_number: string | null;
      sales_date: string | null;
      product_name: string | null;
      quantity: number | null;
      sales_amount: number | null;
      created_at: string;
    }>
  >(
    `sales_transactions?select=id,customer_name,business_registration_number,sales_date,product_name,quantity,sales_amount,created_at&company_id=eq.${encodeURIComponent(
      id
    )}&order=sales_date.desc,created_at.desc&limit=200`
  ).catch(() => []);

  return summarizeSalesTransactions(
    rows.map((row) => ({
      id: row.id,
      customerName: row.customer_name,
      businessRegistrationNumber: row.business_registration_number || undefined,
      salesDate: row.sales_date || undefined,
      productName: row.product_name || undefined,
      quantity: Number(row.quantity || 0),
      salesAmount: Number(row.sales_amount || 0),
      createdAt: new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    }))
  );
}

function summarizeSalesTransactions(items: SalesTransactionItem[]): SalesTransactionSummary {
  const customerNames = new Set(items.map((item) => item.customerName).filter(Boolean));
  return {
    totalAmount: items.reduce((total, item) => total + item.salesAmount, 0),
    transactionCount: items.length,
    customerCount: customerNames.size,
    latestSalesDate: items.find((item) => item.salesDate)?.salesDate,
    items
  };
}

export async function getSalesAssistantDrafts(companyId?: string): Promise<SalesAssistantDraft[]> {
  const timeline = await getVisitTimeline(companyId);
  const targetItems = timeline.filter((item) => item.result === "quote-requested" || item.result === "interested" || item.result === "visited").slice(0, 8);

  return targetItems.flatMap((item) => {
    const drafts: SalesAssistantDraft[] = [
      {
        id: `${item.id}-summary`,
        leadName: item.leadName,
        region: item.region,
        type: "summary",
        title: "방문 요약",
        body: `${item.region} ${item.leadName} 방문 결과는 '${getVisitResultLabel(item.result)}'입니다. 메모: ${item.memo || "특이사항 없음"}. 예상 월매출은 ${item.expectedRevenue.toLocaleString()}만원입니다.`,
        nextAction: item.nextAction || "후속 연락"
      },
      {
        id: `${item.id}-follow-up`,
        leadName: item.leadName,
        region: item.region,
        type: "follow-up",
        title: "후속 메시지 초안",
        body: `안녕하세요, ${item.leadName} 대표님. 오늘 상담 감사드립니다. 말씀 주신 내용 기준으로 ${item.region} 지역 납품 조건과 추천 품목을 정리해서 전달드리겠습니다. 필요하신 품목이나 현재 사용 중인 단가표가 있으시면 함께 확인해드리겠습니다.`,
        nextAction: item.result === "interested" ? "재방문 일정 조율" : item.nextAction || "후속 메시지 발송"
      }
    ];

    if (item.result === "quote-requested") {
      drafts.push({
        id: `${item.id}-quote`,
        leadName: item.leadName,
        region: item.region,
        type: "quote",
        title: "견적 요청 메모",
        body: `${item.leadName} 견적 요청. 지역: ${item.region}. 예상 월매출: ${item.expectedRevenue.toLocaleString()}만원. 방문 메모를 기준으로 주력 품목, 납품 주기, 결제 조건을 확인한 뒤 견적서 초안을 생성해야 합니다.`,
        nextAction: "견적서 발송"
      });
    }

    return drafts;
  });
}

export async function getCompanyDashboardPayload(companyId?: string) {
  const [briefing, report, leads, uploadHistory] = await Promise.all([
    getLatestBriefing(companyId).catch(() => getSampleBriefing()),
    getLatestReport(companyId).catch(() => analyzeCompany(sampleCustomers)),
    getLatestLeads(companyId).catch(() => getLeadPayload()),
    getUploadHistory(companyId).catch(() => getSampleUploadHistory(companyId))
  ]);

  return {
    briefing,
    report,
    leads,
    uploadHistory,
    source: isProductionStoreConfigured() ? "supabase" : "sample"
  };
}

export async function getCompanySettings(companyId?: string, fallbackName = "마주식자재"): Promise<CompanySettings> {
  const id = companyId || getDefaultCompanyId();
  const fallback = {
    id,
    name: fallbackName,
    businessType: "식자재 유통",
    ownerName: "정두영",
    originAddress: process.env.COMPANY_ORIGIN_ADDRESS || "경기도 하남시 초이로 133 1층",
    status: "fallback",
    updatedAt: "샘플 기준"
  };

  if (!isProductionStoreConfigured()) {
    return fallback;
  }

  const rows = await supabaseRequest<
    Array<{
      id: string;
      name: string;
      business_type: string | null;
      owner_name: string | null;
      origin_address: string | null;
      status: string;
      updated_at: string;
    }>
  >(`companies?select=id,name,business_type,owner_name,origin_address,status,updated_at&id=eq.${encodeURIComponent(id)}&limit=1`).catch(() => []);

  const row = rows[0];
  if (!row) {
    return {
      ...fallback,
      status: "missing",
      updatedAt: "회사 미생성"
    };
  }

  return {
    id: row.id,
    name: row.name,
    businessType: row.business_type || "",
    ownerName: row.owner_name || "",
    originAddress: row.origin_address || "",
    status: row.status,
    updatedAt: new Date(row.updated_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
  };
}

export async function updateCompanySettings(companyId: string, input: CompanySettingsInput) {
  const payload = {
    id: companyId,
    name: input.name.trim(),
    business_type: input.businessType?.trim() || null,
    owner_name: input.ownerName?.trim() || null,
    origin_address: input.originAddress?.trim() || null,
    status: "active",
    updated_at: new Date().toISOString()
  };

  if (!payload.name) throw new Error("회사명은 필수입니다.");

  if (!isProductionStoreConfigured()) {
    return {
      persisted: false,
      company: {
        id: companyId,
        name: payload.name,
        businessType: payload.business_type || "",
        ownerName: payload.owner_name || "",
        originAddress: payload.origin_address || "",
        status: "active",
        updatedAt: "로컬 샘플"
      }
    };
  }

  const rows = await supabaseRequest<
    Array<{
      id: string;
      name: string;
      business_type: string | null;
      owner_name: string | null;
      origin_address: string | null;
      status: string;
      updated_at: string;
    }>
  >("companies?on_conflict=id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([payload])
  });

  const row = rows[0];
  return {
    persisted: true,
    company: {
      id: row.id,
      name: row.name,
      businessType: row.business_type || "",
      ownerName: row.owner_name || "",
      originAddress: row.origin_address || "",
      status: row.status,
      updatedAt: new Date(row.updated_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    }
  };
}

export async function getAdminDashboardPayload() {
  if (!isProductionStoreConfigured()) return { ...getAdminDashboard(), uploadHistory: getSampleUploadHistory(), source: "sample" };

  const [companies, imports, reports, leads, uploadHistory] = await Promise.all([
    supabaseRequest<SupabaseRow[]>("companies?select=id"),
    supabaseRequest<
      Array<{
        id: string;
        row_count: number;
        status: string;
        quality_score: number;
        duplicate_count: number;
        created_at: string;
        companies: { name: string };
      }>
    >(
      "customer_imports?select=id,row_count,status,quality_score,duplicate_count,created_at,companies(name)&order=created_at.desc&limit=20"
    ),
    supabaseRequest<Array<{ health_score: number }>>("ai_reports?select=health_score&order=created_at.desc&limit=50"),
    supabaseRequest<Array<{ id: string; name: string; region: string; score: number; status: string }>>(
      "lead_recommendations?select=id,name,region,score,status&order=score.desc&limit=20"
    ),
    getUploadHistory()
  ]);

  const avgHealthScore = reports.length
    ? Math.round(reports.reduce((total, report) => total + Number(report.health_score || 0), 0) / reports.length)
    : 0;
  const processedRows = imports.reduce((total, item) => total + Number(item.row_count || 0), 0);
  const avgQuality = imports.length
    ? Math.round(imports.reduce((total, item) => total + Number(item.quality_score || 0), 0) / imports.length)
    : 0;

  return {
    ...getAdminDashboard(),
    source: "supabase",
    overview: {
      companies: companies.length,
      uploadedFiles: imports.length,
      processedRows,
      avgHealthScore
    },
    jobs: imports.map((item) => ({
      id: item.id,
      company: item.companies?.name || "고객사",
      rows: item.row_count,
      status: item.status as "completed" | "running" | "failed",
      uploadedAt: new Date(item.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
      qualityScore: item.quality_score
    })),
    dataQuality: [
      { label: "주소 인식률", value: avgQuality, description: "업로드 데이터의 주소/지역 필드 완성도를 봅니다." },
      { label: "중복 제거율", value: 96, description: "거래처명과 주소를 기준으로 중복을 제거합니다." },
      { label: "필수 컬럼 완성도", value: avgQuality, description: "거래처명, 지역, 주소, 업종, 매출, 방문 정보를 확인합니다." },
      { label: "리포트 생성 성공률", value: reports.length ? 100 : 0, description: "실 DB에 생성된 AI 리포트 기준입니다." }
    ],
    leadQueue: leads.map((lead) => ({
      id: lead.id,
      name: lead.name,
      region: lead.region,
      score: lead.score,
      status: lead.status === "today" ? "오늘 추천" : lead.status === "this-week" ? "이번주 추천" : lead.status,
      statusValue: lead.status
    })),
    uploadHistory
  };
}

export async function getUploadHistory(companyId?: string): Promise<UploadHistoryItem[]> {
  if (!isProductionStoreConfigured()) return getSampleUploadHistory(companyId);

  const companyFilter = companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "";
  const rows = await supabaseRequest<
    Array<{
      id: string;
      row_count: number;
      status: "completed" | "running" | "failed";
      quality_score: number;
      duplicate_count: number;
      created_at: string;
      companies: { name: string };
      uploaded_files: { original_filename: string } | null;
      ai_reports: Array<{ id: string; health_score: number }>;
    }>
  >(
    `customer_imports?select=id,row_count,status,quality_score,duplicate_count,created_at,companies(name),uploaded_files(original_filename),ai_reports(id,health_score)${companyFilter}&order=created_at.desc&limit=12`
  );

  return rows.map((row) => ({
    id: row.id,
    company: row.companies?.name || "고객사",
    filename: row.uploaded_files?.original_filename || "업로드 파일",
    reportId: row.ai_reports?.[0]?.id || "",
    rows: row.row_count,
    status: row.status,
    qualityScore: row.quality_score,
    duplicateCount: row.duplicate_count,
    healthScore: row.ai_reports?.[0]?.health_score || 0,
    createdAt: new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
  }));
}

async function saveSalesTransactions(companyId: string, importId: string, rawRows: RawUploadRow[], columnMapping: ColumnMapping) {
  const salesRows = rawRows
    .map((row) => {
      const customerName = getRawCell(row, columnMapping.customerName);
      const businessRegistrationNumber = normalizeBusinessNumber(getRawCell(row, columnMapping.businessRegistrationNumber));
      const customerKey = businessRegistrationNumber || makeCustomerKey(customerName, getRawCell(row, columnMapping.address));

      return {
        company_id: companyId,
        import_id: importId,
        customer_key: customerKey,
        customer_name: customerName,
        business_registration_number: businessRegistrationNumber || null,
        sales_date: toPostgresDate(row[columnMapping.salesDate || ""]),
        product_name: getRawCell(row, columnMapping.productName) || null,
        quantity: toNumeric(row[columnMapping.quantity || ""]),
        sales_amount: toNumeric(row[columnMapping.salesAmount || ""]),
        raw_data: row
      };
    })
    .filter((row) => row.customer_name && row.sales_amount > 0);

  if (!salesRows.length) return;

  await supabaseRequest("sales_transactions", {
    method: "POST",
    body: JSON.stringify(salesRows)
  });
}

function estimateQualityScore(rows: CustomerRow[]) {
  if (!rows.length) return 0;

  const fields: Array<keyof CustomerRow> = ["customerName", "region", "address", "industry", "monthlyRevenue", "lastOrderDays", "visitCount", "deliveryKm"];
  const total = rows.length * fields.length;
  const filled = rows.reduce(
    (count, row) => count + fields.filter((field) => row[field] !== undefined && row[field] !== null && String(row[field]).trim() !== "").length,
    0
  );

  return Math.round((filled / total) * 100);
}

function getRawCell(row: RawUploadRow, key?: string) {
  return key ? String(row[key] || "").trim() : "";
}

function normalizeBusinessNumber(value: string) {
  return value.replace(/[^0-9]/g, "");
}

function makeCustomerKey(customerName: string, address: string) {
  return `${customerName}-${address}`
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/[^0-9a-zA-Z가-힣-]/g, "");
}

function toNumeric(value: unknown) {
  if (typeof value === "number") return value;
  const parsed = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toPostgresDate(value: unknown) {
  const date = parseUploadDate(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

function parseUploadDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + value);
    return epoch;
  }
  const date = new Date(String(value).replace(/\./g, "-").replace(/\//g, "-"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function makeNormalizedKey(row: CustomerRow) {
  return `${row.customerName}-${row.address}`
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/[^0-9a-zA-Z가-힣-]/g, "");
}

function countDuplicates(rows: CustomerRow[]) {
  const seen = new Set<string>();
  let duplicates = 0;

  rows.forEach((row) => {
    const key = makeNormalizedKey(row);
    if (seen.has(key)) duplicates += 1;
    seen.add(key);
  });

  return duplicates;
}

async function upsertCompany(companyId: string, name: string) {
  await supabaseRequest<Array<{ id: string }>>("companies?on_conflict=id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([
      {
        id: companyId,
        name,
        status: "active",
        updated_at: new Date().toISOString()
      }
    ])
  });
}

async function getNormalizedCustomersForAnalysis(companyId: string): Promise<CustomerRow[]> {
  const rows = await supabaseRequest<
    Array<{
      customer_name: string;
      region: string | null;
      address: string | null;
      industry: string | null;
      monthly_revenue: number | string | null;
      last_order_days: number | null;
      visit_count: number | null;
      delivery_km: number | string | null;
    }>
  >(
    `normalized_customers?select=customer_name,region,address,industry,monthly_revenue,last_order_days,visit_count,delivery_km&company_id=eq.${encodeURIComponent(
      companyId
    )}&order=created_at.desc&limit=5000`
  );

  return rows.map((row) => ({
    companyName: "마주식자재",
    customerName: row.customer_name,
    region: row.region || "미분류",
    address: row.address || "",
    industry: row.industry || "미분류",
    monthlyRevenue: Number(row.monthly_revenue || 0),
    lastOrderDays: Number(row.last_order_days || 0),
    visitCount: Number(row.visit_count || 0),
    deliveryKm: Number(row.delivery_km || 0)
  }));
}

async function createManualCustomerImport(companyId: string) {
  const files = await supabaseRequest<Array<{ id: string }>>("uploaded_files", {
    method: "POST",
    body: JSON.stringify([
      {
        company_id: companyId,
        original_filename: "manual-customer-master",
        status: "processed"
      }
    ])
  });

  const imports = await supabaseRequest<Array<{ id: string }>>("customer_imports", {
    method: "POST",
    body: JSON.stringify([
      {
        company_id: companyId,
        completed_at: new Date().toISOString(),
        duplicate_count: 0,
        quality_score: 100,
        row_count: 1,
        source: "manual-customer-master",
        status: "completed",
        uploaded_file_id: files[0]?.id || null
      }
    ])
  });

  return imports[0].id;
}

function toNormalizedCustomerRow(row: Record<string, unknown>) {
  return {
    id: String(row.id || ""),
    address: asNullableString(row.address),
    bank_account_file_url: asNullableString(row.bank_account_file_url),
    birth_date: asNullableString(row.birth_date),
    business_license_file_url: asNullableString(row.business_license_file_url),
    business_registration_number: asNullableString(row.business_registration_number),
    business_status: asNullableString(row.business_status),
    business_status_checked_at: asNullableString(row.business_status_checked_at),
    customer_name: String(row.customer_name || ""),
    delivery_km: row.delivery_km as number | string | null,
    delivery_manager: asNullableString(row.delivery_manager),
    delivery_minutes: typeof row.delivery_minutes === "number" ? row.delivery_minutes : null,
    delivery_zone: asNullableString(row.delivery_zone),
    email: asNullableString(row.email),
    industry: asNullableString(row.industry),
    last_order_days: typeof row.last_order_days === "number" ? row.last_order_days : 0,
    monthly_revenue: row.monthly_revenue as number | string | null,
    opening_date: asNullableString(row.opening_date),
    phone: asNullableString(row.phone),
    region: asNullableString(row.region),
    representative_name: asNullableString(row.representative_name),
    visit_count: typeof row.visit_count === "number" ? row.visit_count : 0,
    loading_position: asNullableString(row.loading_position)
  };
}

function toCustomerMasterItem(
  row: {
    id: string;
    address: string | null;
    bank_account_file_url: string | null;
    birth_date: string | null;
    business_license_file_url: string | null;
    business_registration_number: string | null;
    business_status: string | null;
    business_status_checked_at: string | null;
    customer_name: string;
    delivery_km: number | string | null;
    delivery_manager: string | null;
    delivery_minutes: number | null;
    delivery_zone: string | null;
    email: string | null;
    industry: string | null;
    last_order_days: number | null;
    monthly_revenue: number | string | null;
    opening_date: string | null;
    phone: string | null;
    region: string | null;
    representative_name: string | null;
    visit_count: number | null;
    loading_position: string | null;
  },
  index: number
): CustomerMasterItem {
  const monthlyRevenue = Number(row.monthly_revenue || 0);

  return {
    id: row.id,
    address: row.address || "",
    bankAccountFileUrl: row.bank_account_file_url || undefined,
    birthDate: row.birth_date || undefined,
    businessLicenseFileUrl: row.business_license_file_url || undefined,
    businessNumber: row.business_registration_number || `123-${String(10 + index).padStart(2, "0")}-${String(10000 + index).padStart(5, "0")}`,
    businessStatus: row.business_status || (index % 7 === 0 ? "확인 필요" : "정상"),
    businessStatusCheckedAt: row.business_status_checked_at || undefined,
    customerName: row.customer_name,
    deliveryKm: Number(row.delivery_km || 0),
    deliveryManager: row.delivery_manager || ["김배송 매니저", "박배송 매니저", "이배송 매니저", "최배송 매니저"][index % 4],
    deliveryMinutes: row.delivery_minutes || undefined,
    deliveryZone: row.delivery_zone || undefined,
    email: row.email || `${row.customer_name.replace(/\s/g, "").toLowerCase()}@example.com`,
    grade: getRevenueGrade(monthlyRevenue),
    industry: row.industry || "미분류",
    lastOrderDays: Number(row.last_order_days || 0),
    loadingPosition: row.loading_position || (index % 3 === 0 ? "후문 냉장창고 앞" : index % 3 === 1 ? "1층 주방 입구" : "건물 우측 적재 구역"),
    memoCount: 2 + (index % 4),
    monthlyRevenue,
    openingDate: row.opening_date || undefined,
    phone: row.phone || `010-${String(3100 + index).padStart(4, "0")}-${String(1000 + index).padStart(4, "0")}`,
    region: row.region || "미분류",
    representativeName: row.representative_name || (index % 2 === 0 ? "김민준" : "이서연"),
    visitCount: Number(row.visit_count || 0)
  };
}

function getSampleCustomerMaster(): CustomerMasterItem[] {
  return sampleCustomers.map((customer, index) =>
    toCustomerMasterItem(
      {
        id: `sample-${index + 1}`,
        address: customer.address,
        bank_account_file_url: null,
        birth_date: null,
        business_license_file_url: null,
        business_registration_number: `123-${String(10 + index).padStart(2, "0")}-${String(10000 + index).padStart(5, "0")}`,
        business_status: index % 7 === 0 ? "확인 필요" : "정상",
        business_status_checked_at: null,
        customer_name: customer.customerName,
        delivery_km: customer.deliveryKm,
        delivery_manager: null,
        delivery_minutes: null,
        delivery_zone: null,
        email: `${customer.customerName.replace(/\s/g, "").toLowerCase()}@example.com`,
        industry: customer.industry,
        last_order_days: customer.lastOrderDays,
        monthly_revenue: customer.monthlyRevenue,
        opening_date: null,
        phone: null,
        region: customer.region,
        representative_name: null,
        visit_count: customer.visitCount,
        loading_position: null
      },
      index
    )
  );
}

function toCustomerNoteItem(row: {
  id: string;
  created_at: string;
  created_by_name: string | null;
  memo: string;
  next_action: string | null;
  note_type: string;
}): CustomerNoteItem {
  return {
    id: row.id,
    createdAt: new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
    createdByName: row.created_by_name || "현장 사용자",
    memo: row.memo,
    nextAction: row.next_action || "",
    noteType: row.note_type
  };
}

function toCustomerAttachmentItem(row: {
  id: string;
  attachment_type: string;
  created_at: string;
  file_url: string | null;
  mime_type: string | null;
  storage_path?: string | null;
  title: string;
}): CustomerAttachmentItem {
  return {
    id: row.id,
    attachmentType: row.attachment_type,
    createdAt: new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
    fileUrl: row.file_url || (row.storage_path ? `/api/customer-attachments/file?path=${encodeURIComponent(row.storage_path)}` : ""),
    mimeType: row.mime_type || "",
    storagePath: row.storage_path || undefined,
    title: row.title
  };
}

function getSampleCustomerNotes(): CustomerNoteItem[] {
  return [
    {
      id: "sample-note-001",
      createdAt: "2026. 7. 8. 오전 10:20",
      createdByName: "김배송 매니저",
      memo: "오전 입고 선호. 배송 적재위치는 후문 냉장창고 앞이며 도착 전 연락 필요.",
      nextAction: "다음 배송 전 연락",
      noteType: "delivery"
    },
    {
      id: "sample-note-002",
      createdAt: "2026. 7. 6. 오후 2:12",
      createdByName: "정두영",
      memo: "단가표 재요청. 한식 주력 품목 위주로 견적서 발송 예정.",
      nextAction: "견적서 발송",
      noteType: "sales"
    }
  ];
}

function getSampleCustomerAttachments(customerId: string): CustomerAttachmentItem[] {
  return [
    {
      id: `${customerId}-attachment-license`,
      attachmentType: "business_license",
      createdAt: "2026. 7. 1. 오전 9:10",
      fileUrl: "",
      mimeType: "image/png",
      storagePath: undefined,
      title: "사업자등록증"
    },
    {
      id: `${customerId}-attachment-bank`,
      attachmentType: "bank_account",
      createdAt: "2026. 7. 1. 오전 9:12",
      fileUrl: "",
      mimeType: "image/png",
      storagePath: undefined,
      title: "통장사본"
    },
    {
      id: `${customerId}-attachment-loading`,
      attachmentType: "loading_position",
      createdAt: "2026. 7. 2. 오후 4:30",
      fileUrl: "",
      mimeType: "video/mp4",
      storagePath: undefined,
      title: "배송 적재위치 사진/영상"
    }
  ];
}

function getRevenueGrade(monthlyRevenue: number): "A" | "B" | "C" {
  if (monthlyRevenue >= 350) return "A";
  if (monthlyRevenue >= 180) return "B";
  return "C";
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function sanitizeStorageFilename(filename: string) {
  const fallback = "attachment";
  const safe = filename
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|#%{}[\]^~`]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return safe || fallback;
}

function encodeStoragePath(path: string) {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function getSampleUploadHistory(companyId?: string): UploadHistoryItem[] {
  const company = companyId ? "마주식자재" : "마주식자재";

  return [
    {
      id: "sample-import-003",
      company,
      filename: "거래처_현황_2026_06.xlsx",
      reportId: "sample-report-003",
      rows: 483,
      status: "completed",
      qualityScore: 92,
      duplicateCount: 7,
      healthScore: 84,
      createdAt: "2026. 6. 30. 오전 9:12"
    },
    {
      id: "sample-import-002",
      company,
      filename: "6월_매출거래처.xlsx",
      reportId: "sample-report-002",
      rows: 321,
      status: "completed",
      qualityScore: 88,
      duplicateCount: 4,
      healthScore: 81,
      createdAt: "2026. 6. 24. 오후 4:40"
    },
    {
      id: "sample-import-001",
      company,
      filename: "신규영업리스트.csv",
      reportId: "sample-report-001",
      rows: 147,
      status: "completed",
      qualityScore: 79,
      duplicateCount: 11,
      healthScore: 76,
      createdAt: "2026. 6. 17. 오전 11:03"
    }
  ];
}

function getSampleVisitTimeline(): VisitTimelineItem[] {
  return [
    {
      id: "sample-visit-003",
      leadName: "성수 한식 A",
      region: "성수동",
      result: "quote-requested",
      memo: "대표가 단가표 요청. 다음주 월요일 견적 발송 필요.",
      nextAction: "견적서 발송",
      expectedRevenue: 260,
      visitedAt: "2026. 6. 30. 오후 3:20"
    },
    {
      id: "sample-visit-002",
      leadName: "송파 신규오픈 B",
      region: "송파구",
      result: "interested",
      memo: "샘플 납품 가능 여부 확인 요청.",
      nextAction: "재방문 일정 조율",
      expectedRevenue: 244,
      visitedAt: "2026. 6. 30. 오후 1:10"
    },
    {
      id: "sample-visit-001",
      leadName: "강남구 한식 A",
      region: "강남구",
      result: "visited",
      memo: "기존 거래처 있음. 다음 달 재접촉.",
      nextAction: "후속 콜",
      expectedRevenue: 251,
      visitedAt: "2026. 6. 29. 오전 11:40"
    }
  ];
}

function getRevenueProbability(result: string) {
  if (result === "quote-requested") return 0.72;
  if (result === "interested") return 0.46;
  if (result === "pending") return 0.22;
  return 0.05;
}

function getVisitResultLabel(result: string) {
  if (result === "quote-requested") return "견적 요청";
  if (result === "interested") return "관심 있음";
  if (result === "visited") return "방문 완료";
  if (result === "pending") return "보류";
  if (result === "failed") return "실패";
  return result;
}

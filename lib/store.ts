import { analyzeCompany, AnalysisResult } from "./analysis";
import { BusinessStatusResult, checkBusinessRegistrationStatuses, isBusinessStatusApiConfigured } from "./business-status";
import { enrichLeadRecommendations } from "./leads";
import { resolvePlaceLinks } from "./place-links";
import { CustomerRow, sampleCustomers } from "./sample-data";
import { isTelegramConfigured, sendTelegramMessage } from "./telegram";
import { RouteDistanceResult } from "./tmap";

export type RawUploadRow = Record<string, string | number | boolean | null | undefined>;
export type ColumnMapping = Record<string, string>;
export type UploadHistoryItem = {
  id: string;
  company: string;
  companyId: string;
  filename: string;
  reportId: string;
  rows: number;
  status: "completed" | "running" | "failed";
  qualityScore: number;
  duplicateCount: number;
  healthScore: number;
  createdAt: string;
};
export type AdminAuditLogItem = {
  id: string;
  action: string;
  actorName: string;
  company: string;
  companyId: string;
  metadata: Record<string, unknown>;
  targetId: string;
  targetType: string;
  createdAt: string;
};
type AdminDashboardPayload = {
  source: "sample" | "supabase";
  overview: {
    companies: number;
    uploadedFiles: number;
    processedRows: number;
    avgHealthScore: number;
  };
  jobs: Array<{
    id: string;
    company: string;
    rows: number;
    status: "completed" | "running" | "failed";
    uploadedAt: string;
    qualityScore: number;
  }>;
  dataQuality: Array<{ label: string; value: number; description: string }>;
  scoringWeights: Array<{ label: string; value: number; note: string }>;
  leadQueue: Array<{ id: string; name: string; region: string; score: number; status: string; statusValue: string; companyId: string }>;
  uploadHistory: UploadHistoryItem[];
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
  telegramChatId?: string;
  updatedAt: string;
};
export type CompanySettingsInput = {
  businessType?: string;
  name: string;
  originAddress?: string;
  ownerName?: string;
  telegramChatId?: string;
};
export type CustomerMasterItem = {
  id: string;
  address: string;
  bankAccountFileUrl?: string;
  birthDate?: string;
  businessLicenseFileUrl?: string;
  businessNumber?: string;
  businessStatus?: string;
  businessStatusCheckedAt?: string;
  customerName: string;
  deliveryKm: number;
  deliveryManager?: string;
  deliveryMinutes?: number;
  deliveryZone?: string;
  email?: string;
  grade: "A" | "B" | "C";
  industry: string;
  lastOrderDays: number;
  loadingPosition?: string;
  naverPlaceUrl?: string;
  kakaoPlaceUrl?: string;
  googleMapUrl?: string;
  placeLinksCheckedAt?: string;
  memoCount: number;
  monthlyRevenue: number;
  openingDate?: string;
  phone?: string;
  region: string;
  representativeName?: string;
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
  naverPlaceUrl?: string;
  kakaoPlaceUrl?: string;
  googleMapUrl?: string;
  monthlyRevenue?: number;
  openingDate?: string;
  phone?: string;
  region?: string;
  representativeName?: string;
  visitCount?: number;
};
export type CustomerMasterAuditContext = {
  actorName?: string;
  actorRole?: string;
  requestMethod?: string;
};
export type AuditActorContext = {
  actorName?: string;
  actorRole?: string;
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
  source: "sample" | "supabase";
  totalDistanceKm: number;
  totalDurationMinutes: number;
  totalExpectedRevenue: number;
  totalStops: number;
};
export type DeliveryVehicle = {
  id: string;
  name: string;
  driver: string;
  area: string;
  addresses: readonly string[];
  stops: RoutePlanStop[];
  totalDistanceKm: number;
  totalDurationMinutes: number;
  expectedRevenue: number;
  fuelType?: "gasoline" | "diesel";
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
  customerId?: string;
  customerKey: string;
  matched: boolean;
  businessRegistrationNumber?: string;
  salesDate?: string;
  productName?: string;
  quantity: number;
  salesAmount: number;
  createdAt: string;
};
export type SalesTransactionSummary = {
  averageOrderAmount: number;
  topCustomers: Array<{
    customerId?: string;
    customerName: string;
    matched: boolean;
    grade: "A" | "B" | "C";
    latestSalesDate?: string;
    share: number;
    totalAmount: number;
    transactionCount: number;
  }>;
  topProducts: Array<{ productName: string; share: number; totalAmount: number; transactionCount: number }>;
  unmatchedGroups: Array<{
    customerKey: string;
    customerName: string;
    latestSalesDate?: string;
    totalAmount: number;
    transactionCount: number;
  }>;
  totalAmount: number;
  transactionCount: number;
  customerCount: number;
  matchedCustomerCount: number;
  unmatchedCustomerCount: number;
  matchedAmount: number;
  unmatchedAmount: number;
  matchRate: number;
  latestSalesDate?: string;
  items: SalesTransactionItem[];
  truncated: boolean;
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
  blockingIssues: string[];
  readinessScore: number;
  readyForOperations: boolean;
  warningIssues: string[];
  requiredEnvironment: Array<{ key: string; present: boolean; required: boolean; scope: "server" | "client" }>;
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
  staffInvitations?: StaffInvitation[];
  staffInvitationCount?: number;
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
export type StaffInvitation = {
  id: string;
  companyId: string;
  employeeName: string;
  employeePhone: string;
  inviteCode: string;
  inviteUrl: string;
  role: "driver" | "sales" | "manager" | "member";
  status: "pending" | "accepted" | "expired" | "revoked";
  createdAt: string;
  expiresAt?: string;
};
export type StaffInvitationInput = {
  companyId: string;
  employeeName?: string;
  employeePhone?: string;
  role?: StaffInvitation["role"];
};
export type StaffInvitationUpdateInput = {
  companyId: string;
  invitationId: string;
  role?: StaffInvitation["role"];
  status?: Extract<StaffInvitation["status"], "pending" | "revoked">;
};
export type StaffKakaoAcceptInput = {
  avatarUrl?: string;
  email?: string;
  inviteCode: string;
  kakaoUserId: string;
  name?: string;
};
export type PersonalKakaoWorkspaceInput = {
  avatarUrl?: string;
  email?: string;
  kakaoUserId: string;
  name?: string;
};
export type StaffKakaoAcceptResult = {
  companyId: string;
  companyName: string;
  email: string;
  name: string;
  persisted: boolean;
  workspaceRole: StaffInvitation["role"];
};
export type PersonalKakaoWorkspaceResult = {
  companyId: string;
  companyName: string;
  email: string;
  name: string;
  persisted: boolean;
  workspaceRole: "owner";
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
const CUSTOMER_MASTER_SELECT =
  "id,customer_name,business_registration_number,representative_name,opening_date,region,address,phone,email,birth_date,industry,monthly_revenue,last_order_days,visit_count,delivery_km,delivery_minutes,delivery_manager,delivery_zone,loading_position,business_status,business_status_checked_at,business_license_file_url,bank_account_file_url";
const CUSTOMER_MASTER_SELECT_WITH_PLACE_LINKS = `${CUSTOMER_MASTER_SELECT},naver_place_url,kakao_place_url,google_map_url,place_links_checked_at`;
// Fixed caps keep reads predictable; callers expose a partial-data warning when caps are hit.
const CUSTOMER_MASTER_FETCH_LIMIT = 3000;
const SALES_TRANSACTIONS_FETCH_LIMIT = 1000;
const STAFF_INVITATIONS_MIGRATION_MESSAGE =
  "직원 초대 저장소가 아직 준비되지 않았습니다. Supabase SQL Editor에서 직원 초대 스키마를 적용한 뒤 다시 시도해주세요.";
const SUPABASE_CONNECTION_KEY_MESSAGE =
  "Supabase 연결 키가 현재 프로젝트와 맞지 않습니다. Vercel 환경변수의 SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY를 같은 Supabase 프로젝트 값으로 맞춘 뒤 재배포해주세요.";

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

function isMissingStaffInvitationTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("PGRST205") && message.includes("staff_invitations");
}

function isInvalidSupabaseApiKeyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Invalid API key") || message.includes("Forbidden use of secret API key");
}

function isMissingCustomerPlaceLinksColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return ["naver_place_url", "kakao_place_url", "google_map_url", "place_links_checked_at"].some((column) => message.includes(column));
}

function isMissingTelegramChatIdColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("telegram_chat_id");
}

function normalizeStaffStoreError(error: unknown): never {
  if (isMissingStaffInvitationTableError(error)) throw new Error(STAFF_INVITATIONS_MIGRATION_MESSAGE);
  if (isInvalidSupabaseApiKeyError(error)) throw new Error(SUPABASE_CONNECTION_KEY_MESSAGE);
  throw error instanceof Error ? error : new Error(String(error));
}

function staffStoreRequest<T>(request: Promise<T>) {
  return request.catch(normalizeStaffStoreError);
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

export async function upsertAuthCredentials(input: Partial<AuthCredentials>, auditContext: AuditActorContext = {}): Promise<{ credentials: AuthCredentials; persisted: boolean }> {
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

  await writeAdminAuditLog({
    companyId: credentials.customerCompanyId,
    action: "auth_credentials_updated",
    targetType: "auth_credentials",
    metadata: {
      actorName: auditContext.actorName || "시스템",
      actorRole: auditContext.actorRole || "unknown",
      adminEmailChanged: credentials.adminEmail !== fallback.adminEmail,
      adminPasswordChanged: Boolean(input.adminPassword && input.adminPassword !== fallback.adminPassword),
      customerCompanyId: credentials.customerCompanyId,
      customerEmailChanged: credentials.customerEmail !== fallback.customerEmail,
      customerPasswordChanged: Boolean(input.customerPassword && input.customerPassword !== fallback.customerPassword)
    }
  }).catch(() => null);

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
          customerCount: 0,
          salesTransactionCount: 0,
          uploadCount: 0,
          recentUploads: [],
          staffInvitationCount: 0,
          staffInvitations: [],
          updatedAt: "기준 데이터"
        }
      ]
    };
  }

  try {
    const [companies, credentialRows, customerRows, salesRows, importRows, invitationRows] = await Promise.all([
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
      >("customer_imports?select=id,company_id,row_count,status,quality_score,duplicate_count,created_at,uploaded_files(original_filename),ai_reports(id,health_score)&order=created_at.desc"),
      supabaseRequest<
        Array<{
          id: string;
          company_id: string;
          employee_name: string | null;
          employee_phone: string | null;
          invite_code: string;
          role: StaffInvitation["role"];
          status: StaffInvitation["status"];
          expires_at: string | null;
          created_at: string;
        }>
      >("staff_invitations?select=id,company_id,employee_name,employee_phone,invite_code,role,status,expires_at,created_at&order=created_at.desc").catch(() => [])
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
          companyId: row.company_id,
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
    const invitationsByCompany = invitationRows.reduce<Map<string, StaffInvitation[]>>((map, row) => {
      const invitations = map.get(row.company_id) || [];
      if (invitations.length < 5) {
        invitations.push(toStaffInvitation(row));
      }
      map.set(row.company_id, invitations);
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
          staffInvitationCount: invitationsByCompany.get(company.id)?.length || 0,
          staffInvitations: invitationsByCompany.get(company.id) || [],
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
          customerCount: 0,
          salesTransactionCount: 0,
          uploadCount: 0,
          recentUploads: [],
          staffInvitationCount: 0,
          staffInvitations: [],
          updatedAt: "fallback"
        }
      ]
    };
  }
}

export async function upsertManagedCompanyAccount(input: ManagedCompanyAccountInput, auditContext: AuditActorContext = {}): Promise<{ company: ManagedCompanyAccount; persisted: boolean }> {
  const companyId = input.id || globalThis.crypto.randomUUID();
  const companyName = input.name.trim();
  const customerEmail = input.customerEmail.trim().toLowerCase();
  const isNewCompany = !input.id;

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
        staffInvitationCount: 0,
        staffInvitations: [],
        updatedAt: "서버 저장 미확인"
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
  await writeAdminAuditLog({
    companyId: company.id,
    action: isNewCompany ? "managed_company_created" : "managed_company_updated",
    targetType: "company",
    targetId: company.id,
    metadata: {
      actorName: auditContext.actorName || "시스템",
      actorRole: auditContext.actorRole || "unknown",
      businessType: company.business_type || "",
      companyName: company.name,
      customerEmailChanged: true,
      hasCustomerPassword: Boolean(input.customerPassword),
      originAddress: company.origin_address || "",
      ownerName: company.owner_name || "",
      status: company.status
    }
  }).catch(() => null);

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
      staffInvitationCount: 0,
      staffInvitations: [],
      updatedAt: new Date(company.updated_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    }
  };
}

export async function createStaffInvitation(input: StaffInvitationInput, auditContext: AuditActorContext = {}): Promise<{ invitation: StaffInvitation; persisted: boolean }> {
  const companyId = input.companyId;
  const employeeName = input.employeeName?.trim() || "직원";
  const employeePhone = input.employeePhone?.trim() || "";
  const role = input.role || "driver";
  const inviteCode = createInviteCode(companyId);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

  if (!companyId) throw new Error("고객사 ID가 필요합니다.");

  if (!isProductionStoreConfigured()) {
    return {
      persisted: false,
      invitation: {
        id: globalThis.crypto.randomUUID(),
        companyId,
        employeeName,
        employeePhone,
        inviteCode,
        inviteUrl: createStaffInviteUrl(inviteCode),
        role,
        status: "pending",
        createdAt: "서버 저장 미확인",
        expiresAt
      }
    };
  }

  const rows = await staffStoreRequest(supabaseRequest<
    Array<{
      accepted_by: string | null;
      id: string;
      company_id: string;
      employee_name: string | null;
      employee_phone: string | null;
      invite_code: string;
      role: StaffInvitation["role"];
      status: StaffInvitation["status"];
      expires_at: string | null;
      created_at: string;
    }>
  >("staff_invitations", {
    method: "POST",
    headers: {
      Prefer: "return=representation"
    },
    body: JSON.stringify([
      {
        company_id: companyId,
        employee_name: employeeName,
        employee_phone: employeePhone || null,
        invite_code: inviteCode,
        role,
        status: "pending",
        expires_at: expiresAt
      }
    ])
  }));

  const invitation = toStaffInvitation(rows[0]);

  await writeAdminAuditLog({
    companyId,
    action: "staff_invitation_created",
    targetType: "staff_invitation",
    targetId: invitation.id,
    metadata: {
      actorName: auditContext.actorName || "시스템",
      actorRole: auditContext.actorRole || "unknown",
      employeeName: invitation.employeeName,
      hasEmployeePhone: Boolean(invitation.employeePhone),
      role: invitation.role,
      status: invitation.status
    }
  }).catch(() => null);

  return {
    persisted: true,
    invitation
  };
}

export async function getCompanyStaffInvitations(companyId: string): Promise<{ invitations: StaffInvitation[]; persisted: boolean }> {
  if (!companyId) throw new Error("고객사 ID가 필요합니다.");

  if (!isProductionStoreConfigured()) {
    return {
      persisted: false,
      invitations: []
    };
  }

  const rows = await staffStoreRequest(supabaseRequest<
    Array<{
      id: string;
      company_id: string;
      employee_name: string | null;
      employee_phone: string | null;
      invite_code: string;
      role: StaffInvitation["role"];
      status: StaffInvitation["status"];
      expires_at: string | null;
      created_at: string;
    }>
  >(
    `staff_invitations?select=id,company_id,employee_name,employee_phone,invite_code,role,status,expires_at,created_at&company_id=eq.${encodeURIComponent(
      companyId
    )}&order=created_at.desc`
  ));

  return {
    invitations: rows.map(toStaffInvitation),
    persisted: true
  };
}

export async function updateStaffInvitation(input: StaffInvitationUpdateInput, auditContext: AuditActorContext = {}): Promise<{ invitation: StaffInvitation; persisted: boolean }> {
  if (!input.companyId) throw new Error("고객사 ID가 필요합니다.");
  if (!input.invitationId) throw new Error("직원 초대 ID가 필요합니다.");

  const patch: Record<string, string> = {};
  if (input.role) patch.role = input.role;
  if (input.status) patch.status = input.status;
  if (!Object.keys(patch).length) throw new Error("변경할 직원 업무 구분 또는 상태가 필요합니다.");

  if (!isProductionStoreConfigured()) {
    return {
      persisted: false,
      invitation: {
        id: input.invitationId,
        companyId: input.companyId,
        employeeName: "직원",
        employeePhone: "",
        inviteCode: input.invitationId,
        inviteUrl: createStaffInviteUrl(input.invitationId),
        role: input.role || "driver",
        status: input.status || "pending",
        createdAt: "서버 저장 미확인"
      }
    };
  }

  const rows = await staffStoreRequest(supabaseRequest<
    Array<{
      accepted_by: string | null;
      id: string;
      company_id: string;
      employee_name: string | null;
      employee_phone: string | null;
      invite_code: string;
      role: StaffInvitation["role"];
      status: StaffInvitation["status"];
      expires_at: string | null;
      created_at: string;
    }>
  >(`staff_invitations?select=id,company_id,employee_name,employee_phone,invite_code,role,status,expires_at,created_at,accepted_by&id=eq.${encodeURIComponent(input.invitationId)}&company_id=eq.${encodeURIComponent(input.companyId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  }));

  const invitation = rows[0];
  if (!invitation) throw new Error("직원 초대 정보를 찾을 수 없습니다.");

  if (invitation.accepted_by) {
    const memberPatch: Record<string, string> = {
      updated_at: new Date().toISOString()
    };
    if (input.role) memberPatch.role = input.role;
    if (input.status) memberPatch.status = input.status === "revoked" ? "inactive" : "active";

    // company_members는 실제 로그인 권한/역할을 판단하는 기준 테이블이므로, 여기서 실패한 채로
    // 조용히 넘어가면 "비활성화했다"고 화면에는 뜨지만 실제로는 그 직원이 계속 접속 가능한
    // 상태가 될 수 있습니다. 그래서 이 PATCH는 실패 시 그대로 throw해서 관리자에게 알립니다.
    await supabaseRequest(
      `company_members?company_id=eq.${encodeURIComponent(input.companyId)}&user_id=eq.${encodeURIComponent(invitation.accepted_by)}`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=minimal"
        },
        body: JSON.stringify(memberPatch)
      }
    );
  }

  const updatedInvitation = toStaffInvitation(invitation);

  await writeAdminAuditLog({
    companyId: input.companyId,
    action: "staff_invitation_updated",
    targetType: "staff_invitation",
    targetId: updatedInvitation.id,
    metadata: {
      actorName: auditContext.actorName || "시스템",
      actorRole: auditContext.actorRole || "unknown",
      employeeName: updatedInvitation.employeeName,
      role: updatedInvitation.role,
      status: updatedInvitation.status
    }
  }).catch(() => null);

  return {
    invitation: updatedInvitation,
    persisted: true
  };
}

export async function acceptStaffKakaoInvitation(input: StaffKakaoAcceptInput): Promise<StaffKakaoAcceptResult> {
  const inviteCode = input.inviteCode.trim();
  const kakaoUserId = input.kakaoUserId.trim();
  if (!inviteCode) throw new Error("초대 코드가 필요합니다.");
  if (!kakaoUserId) throw new Error("카카오 사용자 확인이 필요합니다.");

  if (!isProductionStoreConfigured()) {
    const companyId = getDefaultCompanyId();
    const company = await getCompanySettings(companyId).catch(() => null);
    return {
      companyId,
      companyName: company?.name || "마주식자재",
      email: input.email || `kakao-${kakaoUserId}@maju.local`,
      name: input.name || "모바일 직원",
      persisted: false,
      workspaceRole: "driver"
    };
  }

  const invitationRows = await staffStoreRequest(supabaseRequest<
    Array<{
      id: string;
      company_id: string;
      employee_name: string | null;
      employee_phone: string | null;
      role: StaffInvitation["role"];
      status: StaffInvitation["status"];
    }>
  >(`staff_invitations?select=id,company_id,employee_name,employee_phone,role,status&invite_code=eq.${encodeURIComponent(inviteCode)}&limit=1`));

  const invitation = invitationRows[0];
  if (!invitation) throw new Error("유효하지 않은 초대 코드입니다.");
  if (invitation.status !== "pending") throw new Error("이미 처리되었거나 사용할 수 없는 초대입니다.");

  const company = await getCompanySettings(invitation.company_id);
  const displayName = input.name || invitation.employee_name || "모바일 직원";
  const loginEmail = input.email || `kakao-${kakaoUserId}@maju.local`;
  const now = new Date().toISOString();

  const userRows = await supabaseRequest<Array<{ id: string; email: string | null; name: string }>>("app_users?on_conflict=kakao_user_id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([
      {
        auth_provider: "kakao",
        avatar_url: input.avatarUrl || null,
        email: loginEmail,
        kakao_user_id: kakaoUserId,
        last_login_at: now,
        name: displayName,
        phone: invitation.employee_phone || null,
        role: "customer_member",
        status: "active"
      }
    ])
  });

  const user = userRows[0];
  await supabaseRequest("company_members", {
    method: "POST",
    headers: {
      Prefer: "return=minimal"
    },
    body: JSON.stringify([
      {
        company_id: invitation.company_id,
        role: invitation.role || "member",
        status: "active",
        updated_at: now,
        user_id: user.id
      }
    ])
  }).catch(() => null);

  await staffStoreRequest(supabaseRequest(`staff_invitations?id=eq.${encodeURIComponent(invitation.id)}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      accepted_at: now,
      accepted_by: user.id,
      status: "accepted"
    })
  }));

  return {
    companyId: invitation.company_id,
    companyName: company.name,
    email: user.email || loginEmail,
    name: user.name || displayName,
    persisted: true,
    workspaceRole: invitation.role || "member"
  };
}

export async function createPersonalKakaoWorkspace(input: PersonalKakaoWorkspaceInput): Promise<PersonalKakaoWorkspaceResult> {
  const kakaoUserId = input.kakaoUserId.trim();
  if (!kakaoUserId) throw new Error("카카오 사용자 확인이 필요합니다.");

  const displayName = input.name || "개인 사용자";
  const loginEmail = input.email || `kakao-${kakaoUserId}@maju.local`;

  if (!isProductionStoreConfigured()) {
    const companyId = getDefaultCompanyId();
    return {
      companyId,
      companyName: `${displayName} 워크스페이스`,
      email: loginEmail,
      name: displayName,
      persisted: false,
      workspaceRole: "owner"
    };
  }

  const now = new Date().toISOString();
  const userRows = await supabaseRequest<Array<{ id: string; email: string | null; name: string }>>("app_users?on_conflict=kakao_user_id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([
      {
        auth_provider: "kakao",
        avatar_url: input.avatarUrl || null,
        email: loginEmail,
        kakao_user_id: kakaoUserId,
        last_login_at: now,
        name: displayName,
        role: "customer_user",
        status: "active"
      }
    ])
  });

  const user = userRows[0];
  const existingMemberships = await supabaseRequest<
    Array<{
      company_id: string;
      role: StaffInvitation["role"] | "owner" | "member";
      companies: { business_type: string | null; name: string } | null;
    }>
  >(`company_members?select=company_id,role,companies(name,business_type)&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.asc&limit=1`).catch(() => []);

  const existing = existingMemberships[0];
  if (existing?.company_id) {
    return {
      companyId: existing.company_id,
      companyName: existing.companies?.name || `${displayName} 워크스페이스`,
      email: user.email || loginEmail,
      name: user.name || displayName,
      persisted: true,
      workspaceRole: "owner"
    };
  }

  const companyRows = await supabaseRequest<Array<{ id: string; name: string }>>("companies", {
    method: "POST",
    body: JSON.stringify([
      {
        business_type: "personal",
        name: `${displayName} 워크스페이스`,
        owner_name: displayName,
        status: "active",
        updated_at: now
      }
    ])
  });

  const company = companyRows[0];
  await supabaseRequest("company_members", {
    method: "POST",
    headers: {
      Prefer: "return=minimal"
    },
    body: JSON.stringify([
      {
        company_id: company.id,
        role: "owner",
        status: "active",
        updated_at: now,
        user_id: user.id
      }
    ])
  });

  return {
    companyId: company.id,
    companyName: company.name,
    email: user.email || loginEmail,
    name: user.name || displayName,
    persisted: true,
    workspaceRole: "owner"
  };
}

function toStaffInvitation(row: {
  id: string;
  company_id: string;
  employee_name: string | null;
  employee_phone: string | null;
  invite_code: string;
  role: StaffInvitation["role"];
  status: StaffInvitation["status"];
  expires_at: string | null;
  created_at: string;
}): StaffInvitation {
  return {
    id: row.id,
    companyId: row.company_id,
    employeeName: row.employee_name || "직원",
    employeePhone: row.employee_phone || "",
    inviteCode: row.invite_code,
    inviteUrl: createStaffInviteUrl(row.invite_code),
    role: row.role || "driver",
    status: row.status || "pending",
    createdAt: new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
    expiresAt: row.expires_at ? new Date(row.expires_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : undefined
  };
}

function createInviteCode(companyId: string) {
  const seed = companyId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase() || "MAJU";
  const random = globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
  return `${seed}-${random}`;
}

function createStaffInviteUrl(inviteCode: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${appUrl.replace(/\/$/, "")}/mobile/join?invite=${encodeURIComponent(inviteCode)}`;
}

export function getSystemStatus(): SystemStatus {
  const supabaseConfigured = isProductionStoreConfigured();
  const appUrlConfigured = Boolean(process.env.NEXT_PUBLIC_APP_URL);
  const adminConfigured = Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET);
  const customerConfigured = Boolean(process.env.CUSTOMER_EMAIL && process.env.CUSTOMER_PASSWORD);
  const ocrConfigured = Boolean(process.env.CLOVA_OCR_INVOKE_URL && process.env.CLOVA_OCR_SECRET) || Boolean(process.env.UPSTAGE_API_KEY) || Boolean(process.env.OPENAI_API_KEY);
  const kakaoRestConfigured = Boolean(process.env.KAKAO_REST_KEY);
  const kakaoMapConfigured = Boolean(process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY);
  const kakaoConfigured = kakaoRestConfigured && kakaoMapConfigured;
  const opinetConfigured = Boolean(process.env.OPINET_API_KEY);
  const naverSearchConfigured = Boolean(process.env.NAVER_SEARCH_CLIENT_ID && process.env.NAVER_SEARCH_CLIENT_SECRET);
  const ntsBusinessConfigured = isBusinessStatusApiConfigured();
  const routeConfigured = Boolean(process.env.COMPANY_ORIGIN_ADDRESS && process.env.TMAP_API_KEY);
  const blockingIssues = [
    !supabaseConfigured && "Supabase URL과 Service Role Key가 없어 거래처/매출/첨부자료 서버 저장을 확인할 수 없습니다.",
    !adminConfigured && "관리자 이메일, 비밀번호, 세션 시크릿 환경변수를 모두 설정해야 합니다.",
    !customerConfigured && "고객사 로그인 이메일과 비밀번호 환경변수를 설정해야 합니다."
  ].filter((issue): issue is string => Boolean(issue));
  const warningIssues = [
    !kakaoConfigured && "카카오 REST 키 또는 JavaScript 키가 없어 주소검색/지도 표시가 제한될 수 있습니다.",
    !routeConfigured && "회사 출발지 또는 TMAP API 키가 없어 실도로 경로 계산이 제한됩니다.",
    !ntsBusinessConfigured && "NTS_BUSINESS_API_KEY가 없어 국세청 사업자 휴폐업 상태조회가 제한됩니다.",
    !ocrConfigured && "OCR 공급자 환경변수가 없어 사업자등록증 자동입력은 보조 검증 모드로 동작합니다.",
    !appUrlConfigured && "NEXT_PUBLIC_APP_URL이 없어 배포 URL 기반 링크와 리다이렉트 확인이 제한될 수 있습니다."
  ].filter((issue): issue is string => Boolean(issue));
  const readinessScore = Math.max(0, Math.min(100, 100 - blockingIssues.length * 25 - warningIssues.length * 10));

  return {
    appUrlConfigured,
    adminConfigured,
    customerConfigured,
    mode: supabaseConfigured ? "production-db" : "local-fallback",
    blockingIssues,
    readinessScore,
    readyForOperations: blockingIssues.length === 0,
    warningIssues,
    requiredEnvironment: [
      { key: "NEXT_PUBLIC_APP_URL", present: appUrlConfigured, required: true, scope: "client" },
      { key: "NEXT_PUBLIC_SUPABASE_URL", present: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL), required: true, scope: "client" },
      { key: "SUPABASE_URL", present: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL), required: true, scope: "server" },
      { key: "SUPABASE_SERVICE_ROLE_KEY 또는 SUPABASE_SECRET_KEY", present: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY), required: true, scope: "server" },
      { key: "ADMIN_EMAIL", present: Boolean(process.env.ADMIN_EMAIL), required: true, scope: "server" },
      { key: "ADMIN_PASSWORD", present: Boolean(process.env.ADMIN_PASSWORD), required: true, scope: "server" },
      { key: "ADMIN_SESSION_SECRET", present: Boolean(process.env.ADMIN_SESSION_SECRET), required: true, scope: "server" },
      { key: "CUSTOMER_EMAIL", present: Boolean(process.env.CUSTOMER_EMAIL), required: true, scope: "server" },
      { key: "CUSTOMER_PASSWORD", present: Boolean(process.env.CUSTOMER_PASSWORD), required: true, scope: "server" },
      { key: "CUSTOMER_COMPANY_ID", present: Boolean(process.env.CUSTOMER_COMPANY_ID), required: true, scope: "server" },
      { key: "COMPANY_ORIGIN_ADDRESS", present: Boolean(process.env.COMPANY_ORIGIN_ADDRESS), required: true, scope: "server" },
      { key: "TMAP_API_KEY", present: Boolean(process.env.TMAP_API_KEY), required: true, scope: "server" },
      { key: "KAKAO_REST_KEY", present: kakaoRestConfigured, required: true, scope: "server" },
      { key: "NEXT_PUBLIC_KAKAO_MAP_APP_KEY", present: kakaoMapConfigured, required: true, scope: "client" },
      { key: "OPINET_API_KEY", present: opinetConfigured, required: false, scope: "server" },
      { key: "NAVER_SEARCH_CLIENT_ID + NAVER_SEARCH_CLIENT_SECRET", present: naverSearchConfigured, required: false, scope: "server" },
      { key: "NTS_BUSINESS_API_KEY", present: ntsBusinessConfigured, required: false, scope: "server" },
      { key: "CLOVA_OCR_INVOKE_URL + CLOVA_OCR_SECRET 또는 UPSTAGE_API_KEY", present: ocrConfigured, required: false, scope: "server" }
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
        description: adminConfigured ? "관리자 환경변수가 설정되었습니다." : "관리자 인증 환경변수를 확인해야 합니다."
      },
      {
        name: "Customer Auth",
        status: customerConfigured ? "ready" : "fallback",
        description: customerConfigured ? "고객사 환경변수가 설정되었습니다." : "고객사 인증 환경변수를 확인해야 합니다."
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
        name: "Kakao Map",
        status: kakaoConfigured ? "ready" : "fallback",
        description: kakaoConfigured
          ? "주소검색 REST API와 카카오맵 JavaScript SDK가 모두 설정되어 있습니다."
          : "카카오 REST 키 또는 JavaScript 키가 없어 주소검색/지도 표시가 제한될 수 있습니다."
      },
      {
        name: "Fuel Price Intelligence",
        status: opinetConfigured ? "ready" : "fallback",
        description: opinetConfigured
          ? "OPINET 무료 API Key로 전국 평균 유가를 조회하고 30분 캐시해 예상 유류비에 반영합니다."
          : "OPINET 키가 없어 기본 유가 단가로 예상 유류비를 계산합니다."
      },
      {
        name: "Naver Place Lookup",
        status: naverSearchConfigured ? "ready" : "fallback",
        description: naverSearchConfigured
          ? "네이버 지역 검색 API로 거래처 등록 시 네이버 플레이스 링크를 자동으로 조회합니다."
          : "네이버 검색 API 키가 없어 거래처 등록 시 네이버 플레이스 링크는 검색결과 페이지로 대체됩니다."
      },
      {
        name: "Business Status Intelligence",
        status: ntsBusinessConfigured ? "ready" : "fallback",
        description: ntsBusinessConfigured
          ? "국세청 사업자등록정보 상태조회 API로 거래처 휴폐업 상태를 갱신할 수 있습니다."
          : "NTS_BUSINESS_API_KEY가 없어 사업자 상태조회는 수동 확인 기준으로 동작합니다."
      },
      {
        name: "Document OCR",
        status: ocrConfigured ? "ready" : "fallback",
        description: ocrConfigured
          ? "사업자등록증 OCR 공급자 환경변수가 감지되었습니다."
          : "OCR 공급자 환경변수가 없어 사업자등록증 자동입력은 보조 검증 모드로 동작합니다."
      },
      {
        name: "Customer Attachment Storage",
        status: supabaseConfigured ? "ready" : "fallback",
        description: supabaseConfigured
          ? "사업자등록증, 통장사본, 배송 적재위치 사진/영상 업로드 API가 실 Storage를 사용합니다."
          : "Supabase 환경변수가 없어 첨부파일 서버 저장을 확인할 수 없습니다."
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
    countTableRows("admin_audit_logs", "감사 로그", "데이터 등록/수정 시 남는 관리자 감사 로그입니다."),
    countTableRows("column_mappings", "엑셀 헤더 매핑 이력", "대량 등록 시 저장되는 헤더-필드 매핑 이력입니다."),
    countTableRows("raw_customer_rows", "엑셀 원본 행", "대량 등록 원본 엑셀 행 백업입니다."),
    countTableRows("health_score_snapshots", "건강도 스냅샷", "리포트별 건강도 점수 스냅샷입니다."),
    countTableRows("auth_credentials", "DB 저장 로그인 정보", "관리자/고객 로그인 정보를 DB에서 관리할 때 사용하는 테이블입니다."),
    countTableRows("excel_mapping_presets", "엑셀 매핑 프리셋", "ERP/유통사별로 저장해둔 엑셀 헤더 매핑 프리셋입니다."),
    checkVisitLeadRelationship(),
    checkCustomerPlaceLinkColumns(),
    checkDefaultCompany()
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

export async function getCustomerMaster(
  companyId?: string,
  options?: { offset?: number }
): Promise<{ customers: CustomerMasterItem[]; source: "sample" | "supabase"; truncated: boolean }> {
  const id = companyId || getDefaultCompanyId();
  const offset = Math.max(0, Math.floor(options?.offset || 0));

  if (!isProductionStoreConfigured()) {
    return {
      customers: [],
      source: "sample",
      truncated: false
    };
  }

  type CustomerMasterRow = {
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
    google_map_url?: string | null;
    industry: string | null;
    kakao_place_url?: string | null;
    last_order_days: number | null;
    monthly_revenue: number | string | null;
    naver_place_url?: string | null;
    opening_date: string | null;
    phone: string | null;
    place_links_checked_at?: string | null;
    region: string | null;
    representative_name: string | null;
    visit_count: number | null;
    loading_position: string | null;
  };
  let rows: CustomerMasterRow[];

  try {
    rows = await supabaseRequest<Array<CustomerMasterRow>>(
      `normalized_customers?select=${CUSTOMER_MASTER_SELECT_WITH_PLACE_LINKS}&company_id=eq.${encodeURIComponent(id)}&order=created_at.desc&limit=${CUSTOMER_MASTER_FETCH_LIMIT}&offset=${offset}`
    );
  } catch (error) {
    if (!isMissingCustomerPlaceLinksColumnError(error)) throw error;
    rows = await supabaseRequest<Array<CustomerMasterRow>>(
      `normalized_customers?select=${CUSTOMER_MASTER_SELECT}&company_id=eq.${encodeURIComponent(id)}&order=created_at.desc&limit=${CUSTOMER_MASTER_FETCH_LIMIT}&offset=${offset}`
    );
  }

  return {
    customers: rows.map((row, index) => toCustomerMasterItem(row, offset + index)),
    source: "supabase",
    truncated: rows.length >= CUSTOMER_MASTER_FETCH_LIMIT
  };
}

export async function upsertCustomerMaster(input: CustomerMasterInput, companyId?: string, auditContext: CustomerMasterAuditContext = {}) {
  const customerName = input.customerName.trim();
  if (!customerName) throw new Error("거래처명은 필수입니다.");
  const resolvedPlaceLinks = await resolvePlaceLinks(
    {
      address: input.address || "",
      customerName
    },
    {
      googleMapUrl: input.googleMapUrl,
      kakaoPlaceUrl: input.kakaoPlaceUrl,
      naverPlaceUrl: input.naverPlaceUrl
    }
  );

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
      industry: input.industry || resolvedPlaceLinks.enrichedIndustry || "미분류",
      kakao_place_url: resolvedPlaceLinks.kakaoPlaceUrl || null,
      last_order_days: input.lastOrderDays || 0,
      google_map_url: resolvedPlaceLinks.googleMapUrl || null,
      monthly_revenue: input.monthlyRevenue || 0,
      naver_place_url: resolvedPlaceLinks.naverPlaceUrl || null,
      opening_date: input.openingDate || null,
      phone: input.phone || resolvedPlaceLinks.enrichedPhone || null,
      place_links_checked_at: resolvedPlaceLinks.checkedAt,
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
  const businessNumber = normalizeBusinessNumber(input.businessNumber || "");
  const normalizedKey = businessNumber || makeCustomerKey(customerName, input.address || "");
  // import 생성과 중복 조회는 서로 의존하지 않으므로 병렬 실행합니다.
  const [importId, existingRows] = await Promise.all([
    createManualCustomerImport(id),
    supabaseRequest<Array<{ id: string }>>(
      `normalized_customers?select=id&company_id=eq.${encodeURIComponent(id)}&normalized_key=eq.${encodeURIComponent(normalizedKey)}&limit=1`
    ).catch(() => [])
  ]);
  const placeLinks = {
    google_map_url: resolvedPlaceLinks.googleMapUrl || null,
    kakao_place_url: resolvedPlaceLinks.kakaoPlaceUrl || null,
    naver_place_url: resolvedPlaceLinks.naverPlaceUrl || null,
    place_links_checked_at: resolvedPlaceLinks.checkedAt
  };
  const customerPayload = {
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
    industry: input.industry || resolvedPlaceLinks.enrichedIndustry || "미분류",
    last_order_days: input.lastOrderDays || 0,
    monthly_revenue: input.monthlyRevenue || 0,
    normalized_key: normalizedKey,
    opening_date: toPostgresDate(input.openingDate),
    phone: input.phone || resolvedPlaceLinks.enrichedPhone || null,
    region: input.region || "미분류",
    representative_name: input.representativeName || null,
    visit_count: input.visitCount || 0,
    loading_position: input.loadingPosition || null
  };
  const rows = await upsertNormalizedCustomerWithOptionalPlaceLinks({ ...customerPayload, ...placeLinks }).catch((error) => {
    if (!isMissingCustomerPlaceLinksColumnError(error)) throw error;
    return upsertNormalizedCustomerWithOptionalPlaceLinks(customerPayload);
  });
  const savedCustomer = toCustomerMasterItem(toNormalizedCustomerRow(rows[0]), 0);

  await writeAdminAuditLog({
    companyId: id,
    action: existingRows.length ? "customer_master_updated" : "customer_master_created",
    targetType: "normalized_customer",
    targetId: savedCustomer.id,
    metadata: {
      actorName: auditContext.actorName || "시스템",
      actorRole: auditContext.actorRole || "unknown",
      requestMethod: auditContext.requestMethod || "unknown",
      customerName: savedCustomer.customerName,
      hasAddress: Boolean(savedCustomer.address),
      hasBusinessNumber: Boolean(savedCustomer.businessNumber),
      hasLoadingPosition: Boolean(savedCustomer.loadingPosition),
      monthlyRevenue: savedCustomer.monthlyRevenue,
      grade: savedCustomer.grade
    }
  }).catch(() => null);

  return {
    customer: savedCustomer,
    persisted: true
  };
}

async function upsertNormalizedCustomerWithOptionalPlaceLinks(payload: Record<string, unknown>) {
  return supabaseRequest<Array<Record<string, unknown>>>("normalized_customers?on_conflict=company_id,normalized_key", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([payload])
  });
}

export async function getCustomerOperations(customerId: string, companyId?: string) {
  const id = companyId || getDefaultCompanyId();

  if (!isProductionStoreConfigured() || customerId.startsWith("sample-") || customerId.startsWith("local-")) {
    return {
      attachments: [],
      notes: [],
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
  const note = toCustomerNoteItem(rows[0]);

  await writeAdminAuditLog({
    companyId: companyId || getDefaultCompanyId(),
    action: "customer_note_created",
    targetType: "customer_note",
    targetId: note.id,
    metadata: {
      actorName: input.createdByName || "현장 사용자",
      customerId: input.customerId,
      hasNextAction: Boolean(note.nextAction),
      memoLength: memo.length,
      noteType: note.noteType
    }
  }).catch(() => null);

  return {
    note,
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
  const attachment = toCustomerAttachmentItem(rows[0]);

  await writeAdminAuditLog({
    companyId: companyId || getDefaultCompanyId(),
    action: "customer_attachment_created",
    targetType: "customer_attachment",
    targetId: attachment.id,
    metadata: {
      actorName: input.createdByName || "현장 사용자",
      attachmentType: attachment.attachmentType,
      customerId: input.customerId,
      hasFileUrl: Boolean(attachment.fileUrl),
      mimeType: attachment.mimeType,
      title: attachment.title
    }
  }).catch(() => null);

  return {
    attachment,
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

async function checkDefaultCompany(): Promise<DatabaseCheck> {
  try {
    const rows = await supabaseRequest<Array<{ id: string }>>(
      `companies?select=id&id=eq.${encodeURIComponent(getDefaultCompanyId())}&limit=1`
    );

    return {
      name: "기본 고객사 연결",
      status: rows.length ? "ready" : "missing",
      count: rows.length,
      description: rows.length
        ? "CUSTOMER_COMPANY_ID와 Supabase companies.id가 연결되어 있습니다."
        : "seed.sql을 실행했거나 CUSTOMER_COMPANY_ID가 실제 companies.id와 일치하는지 확인해야 합니다."
    };
  } catch (error) {
    return {
      name: "기본 고객사 연결",
      status: "missing",
      count: null,
      description: getErrorMessage(error)
    };
  }
}

async function checkCustomerPlaceLinkColumns(): Promise<DatabaseCheck> {
  try {
    await supabaseRequest<Array<Record<string, unknown>>>("normalized_customers?select=naver_place_url,kakao_place_url,google_map_url,place_links_checked_at&limit=1");

    return {
      name: "매장 외부 링크 컬럼",
      status: "ready",
      count: null,
      description: "네이버 플레이스, 카카오맵, 구글맵 링크 저장 컬럼이 적용되어 있습니다."
    };
  } catch (error) {
    return {
      name: "매장 외부 링크 컬럼",
      status: "missing",
      count: null,
      description: isMissingCustomerPlaceLinksColumnError(error)
        ? "20260725_customer_place_links.sql 마이그레이션을 Supabase SQL Editor에서 실행해야 링크가 DB에 저장됩니다."
        : getErrorMessage(error)
    };
  }
}

async function checkVisitLeadRelationship(): Promise<DatabaseCheck> {
  try {
    await supabaseRequest<Array<Record<string, unknown>>>(
      "visit_results?select=id,lead_recommendations(id)&limit=1"
    );

    return {
      name: "방문 결과 ↔ 추천 리드 연결",
      status: "ready",
      count: null,
      description: "visit_results.lead_id와 lead_recommendations 간 외래키가 정상적으로 연결되어 있습니다."
    };
  } catch (error) {
    const message = getErrorMessage(error);
    const isRelationshipMissing = message.includes("PGRST200") || message.includes("relationship");
    return {
      name: "방문 결과 ↔ 추천 리드 연결",
      status: "missing",
      count: null,
      description: isRelationshipMissing
        ? "supabase/migrations/20260814_visit_results_lead_fk.sql 마이그레이션을 실행해야 방문 히스토리에서 추천 리드 정보가 정상 조회됩니다."
        : message
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
  let report = analyzeCompany(rows);
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

  const rawRows = (options.rawRows?.length ? options.rawRows : rows).map((row, index) => ({
    company_id: companyId,
    import_id: importId,
    row_index: index + 1,
    raw_data: row
  }));

  // 서로 의존하지 않는 저장 작업은 병렬로 실행해 저장 대기 시간을 줄입니다.
  // column_mappings/raw_customer_rows는 매핑 이력·원본 백업용 부가 데이터라, 저장에 실패해도
  // 아래에서 이어지는 normalized_customers/매출 거래내역 저장까지 막히면 안 되므로 개별적으로 catch합니다.
  await Promise.all([
    mappingRows.length
      ? supabaseRequest("column_mappings", {
          method: "POST",
          body: JSON.stringify(mappingRows)
        }).catch((error) => {
          console.error(`[saveAnalysis] column_mappings 저장 실패 (importId=${importId}): ${getErrorMessage(error)}`);
          return null;
        })
      : Promise.resolve(),
    rawRows.length
      ? supabaseRequest("raw_customer_rows", {
          method: "POST",
          body: JSON.stringify(rawRows)
        }).catch((error) => {
          console.error(`[saveAnalysis] raw_customer_rows 저장 실패 (importId=${importId}): ${getErrorMessage(error)}`);
          return null;
        })
      : Promise.resolve(),
    options.uploadType === "sales-analysis" && options.rawRows?.length
      ? saveSalesTransactions(companyId, importId, options.rawRows, options.columnMapping || {})
      : Promise.resolve()
  ]);

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
  report = {
    ...report,
    leadRecommendations: await enrichLeadRecommendations(
      report.leadRecommendations,
      (masterRows.length ? masterRows : rows).map((row) => row.customerName)
    ).catch(() => report.leadRecommendations)
  };

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

  // 감사 로그, 레거시 행 저장, 리포트 생성은 서로 결과값을 주고받지 않으므로 병렬로 실행합니다.
  // 감사 로그 저장 실패(테이블 누락 등)가 Promise.all을 reject시켜 정작 중요한 ai_reports 저장까지
  // 막아버리는 일이 없도록 감사 로그는 개별적으로 catch합니다.
  const [, , reports] = await Promise.all([
    supabaseRequest("admin_audit_logs", {
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
    }).catch((error) => {
      console.error(`[saveAnalysis] admin_audit_logs 저장 실패: ${getErrorMessage(error)}`);
      return null;
    }),
    legacyCustomerRows.length
      ? supabaseRequest("customer_rows", {
          method: "POST",
          body: JSON.stringify(legacyCustomerRows)
        }).catch(() => null)
      : Promise.resolve(null),
    supabaseRequest<Array<{ id: string }>>("ai_reports", {
      method: "POST",
      body: JSON.stringify([
        {
          company_id: companyId,
          import_id: importId,
          health_score: report.health.total,
          report
        }
      ])
    })
  ]);
  const reportId = (reports as Array<{ id: string }>)[0].id;

  const leads = report.leadRecommendations.map((lead) => ({
    company_id: companyId,
    report_id: reportId,
    name: lead.name,
    region: lead.region,
    score: lead.score,
    reasons: lead.reasons,
    status: lead.score >= 90 ? "today" : "this-week"
  }));

  // 건강도 스냅샷과 리드 저장도 서로 독립적이므로 병렬로 실행합니다. ai_reports는 이미 저장이
  // 끝난 상태이므로, 이 두 부가 정보 중 하나가 실패해도 다른 하나까지 함께 날아가거나
  // saveAnalysis() 전체가 실패한 것처럼 보이지 않도록 각각 개별적으로 catch합니다.
  await Promise.all([
    supabaseRequest("health_score_snapshots", {
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
    }).catch((error) => {
      console.error(`[saveAnalysis] health_score_snapshots 저장 실패 (reportId=${reportId}): ${getErrorMessage(error)}`);
      return null;
    }),
    leads.length
      ? supabaseRequest("lead_recommendations", {
          method: "POST",
          body: JSON.stringify(leads)
        }).catch((error) => {
          console.error(`[saveAnalysis] lead_recommendations 저장 실패 (reportId=${reportId}): ${getErrorMessage(error)}`);
          return null;
        })
      : Promise.resolve()
  ]);

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
  if (!isProductionStoreConfigured()) return analyzeCompany([]);

  try {
    const companyFilter = companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "";
    const reports = await supabaseRequest<Array<{ report: AnalysisResult }>>(
      `ai_reports?select=report${companyFilter}&order=created_at.desc&limit=1`
    );
    return reports[0]?.report || analyzeCurrentCustomerMaster(companyId);
  } catch (error) {
    console.error("Latest report fallback:", error);
    return analyzeCurrentCustomerMaster(companyId).catch(() => analyzeCompany([]));
  }
}

async function analyzeCurrentCustomerMaster(companyId?: string): Promise<AnalysisResult> {
  if (!isProductionStoreConfigured()) return analyzeCompany([]);
  const rows = await getNormalizedCustomersForAnalysis(companyId || getDefaultCompanyId());
  return analyzeCompany(rows);
}

export async function getReportById(reportId: string, companyId?: string): Promise<AnalysisResult | null> {
  if (!isProductionStoreConfigured()) return analyzeCompany([]);

  const companyFilter = companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "";
  const reports = await supabaseRequest<Array<{ report: AnalysisResult }>>(
    `ai_reports?select=report&id=eq.${encodeURIComponent(reportId)}${companyFilter}&limit=1`
  );

  return reports[0]?.report || null;
}

export async function getLatestBriefing(companyId?: string) {
  const [report, customerMaster] = await Promise.all([
    getLatestReport(companyId),
    getCustomerMaster(companyId).catch(() => ({ customers: [], source: "sample" as const }))
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

function getEmptyBriefing(source: "sample" | "supabase" = "supabase") {
  return {
    greeting: "안녕하세요 정두영님.",
    currentCustomers: 0,
    weeklyOpportunities: 0,
    todayRecommendations: 0,
    highProbability: 0,
    routeLeads: 0,
    missingRegions: [],
    healthScore: 0,
    source
  };
}

export async function getLatestLeads(companyId?: string) {
  if (!isProductionStoreConfigured()) return { total: 0, leads: [] };

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
    return { total: 0, leads: [] };
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
  const customerMaster = await getCustomerMaster(companyId);
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
    source: customerMaster.source,
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

export type DeliveryVehicleFuelType = "gasoline" | "diesel";

function isMissingDeliveryVehiclesTableError(error: unknown) {
  return error instanceof Error && error.message.includes("delivery_vehicles");
}

/** Delivery vehicles are keyed 1:1 by driver (담당자) name within a company. */
export async function getDeliveryVehicleFuelTypes(companyId?: string): Promise<Record<string, DeliveryVehicleFuelType>> {
  if (!isProductionStoreConfigured()) return {};

  const resolvedCompanyId = companyId || getDefaultCompanyId();

  try {
    const rows = await supabaseRequest<Array<{ driver_name: string; fuel_type: string }>>(
      `delivery_vehicles?select=driver_name,fuel_type&company_id=eq.${encodeURIComponent(resolvedCompanyId)}`
    );
    return rows.reduce<Record<string, DeliveryVehicleFuelType>>((map, row) => {
      map[row.driver_name] = row.fuel_type === "gasoline" ? "gasoline" : "diesel";
      return map;
    }, {});
  } catch (error) {
    if (isMissingDeliveryVehiclesTableError(error)) return {};
    throw error;
  }
}

export async function upsertDeliveryVehicleFuelType(
  companyId: string,
  driverName: string,
  fuelType: DeliveryVehicleFuelType
): Promise<{ persisted: boolean; driverName: string; fuelType: DeliveryVehicleFuelType }> {
  if (!driverName.trim()) throw new Error("담당자명이 필요합니다.");
  if (!isProductionStoreConfigured()) return { persisted: false, driverName, fuelType };

  try {
    await supabaseRequest("delivery_vehicles?on_conflict=company_id,driver_name", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([
        {
          company_id: companyId,
          driver_name: driverName.trim(),
          fuel_type: fuelType,
          updated_at: new Date().toISOString()
        }
      ])
    });
    return { persisted: true, driverName, fuelType };
  } catch (error) {
    if (isMissingDeliveryVehiclesTableError(error)) {
      throw new Error("배송차 연료 타입을 저장할 수 없습니다. Supabase에 delivery_vehicles 테이블이 아직 없습니다. supabase/migrations/20260813_delivery_vehicles.sql을 먼저 실행하세요.");
    }
    throw error;
  }
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
    // 방문 결과 저장 자체는 이미 완료됐으므로 리드 상태 동기화 실패로 전체 저장을 막지는 않되,
    // 조용히 사라지지 않도록 로그는 남깁니다.
    await updateLeadStatus(input.leadId, "high-probability", input.companyId).catch((error) => {
      console.error(`[saveVisitResult] leadId=${input.leadId} 리드 상태 동기화 실패: ${getErrorMessage(error)}`);
    });
  }

  return { persisted: true, id: rows[0]?.id, ...input };
}

export async function getVisitTimeline(companyId?: string): Promise<VisitTimelineItem[]> {
  if (!isProductionStoreConfigured()) return [];

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
  const timeline = await getVisitTimeline(companyId).catch(() => []);
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

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function getSalesTransactions(
  companyId?: string,
  options?: { offset?: number; from?: string; to?: string }
): Promise<SalesTransactionSummary> {
  const id = companyId || getDefaultCompanyId();
  const offset = Math.max(0, Math.floor(options?.offset || 0));
  const from = options?.from && ISO_DATE_PATTERN.test(options.from) ? options.from : undefined;
  const to = options?.to && ISO_DATE_PATTERN.test(options.to) ? options.to : undefined;
  const dateFilter = `${from ? `&sales_date=gte.${from}` : ""}${to ? `&sales_date=lte.${to}` : ""}`;

  if (!isProductionStoreConfigured()) {
    const items = sampleCustomers.slice(0, 12).map((customer, index) => ({
      id: `sample-sales-${index + 1}`,
      customerId: `sample-${index + 1}`,
      customerKey: `sample-${index + 1}`,
      matched: true,
      customerName: customer.customerName,
      businessRegistrationNumber: `123${String(10 + index).padStart(2, "0")}${String(10000 + index).padStart(5, "0")}`,
      salesDate: `2026-07-${String(1 + (index % 10)).padStart(2, "0")}`,
      productName: ["쌀 20kg", "식용유", "돈육", "김치", "야채믹스"][index % 5],
      quantity: 1 + (index % 8),
      salesAmount: customer.monthlyRevenue * 10000,
      createdAt: "기준 데이터"
    }));
    return summarizeSalesTransactions(items, false);
  }

  const [rows, customerKeyMap] = await Promise.all([
    supabaseRequest<
      Array<{
        id: string;
        customer_key: string | null;
        customer_name: string;
        business_registration_number: string | null;
        sales_date: string | null;
        product_name: string | null;
        quantity: number | null;
        sales_amount: number | null;
        created_at: string;
      }>
    >(
      `sales_transactions?select=id,customer_key,customer_name,business_registration_number,sales_date,product_name,quantity,sales_amount,created_at&company_id=eq.${encodeURIComponent(
        id
      )}${dateFilter}&order=sales_date.desc,created_at.desc&limit=${SALES_TRANSACTIONS_FETCH_LIMIT}&offset=${offset}`
    ).catch(() => []),
    getNormalizedCustomerKeyMap(id)
  ]);

  return summarizeSalesTransactions(
    rows.map((row) => {
      const matchedCustomer = row.customer_key ? customerKeyMap.get(row.customer_key) : undefined;
      return {
        id: row.id,
        customerId: matchedCustomer?.id,
        customerKey: row.customer_key || "",
        matched: Boolean(matchedCustomer),
        customerName: matchedCustomer?.customerName || row.customer_name,
        businessRegistrationNumber: row.business_registration_number || undefined,
        salesDate: row.sales_date || undefined,
        productName: row.product_name || undefined,
        quantity: Number(row.quantity || 0),
        salesAmount: Number(row.sales_amount || 0),
        createdAt: new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
      };
    }),
    rows.length >= SALES_TRANSACTIONS_FETCH_LIMIT
  );
}

async function getNormalizedCustomerKeyMap(companyId: string) {
  const map = new Map<string, { id: string; customerName: string }>();

  const rows = await supabaseRequest<Array<{ id: string; customer_name: string; normalized_key: string }>>(
    `normalized_customers?select=id,customer_name,normalized_key&company_id=eq.${encodeURIComponent(companyId)}&limit=${CUSTOMER_MASTER_FETCH_LIMIT}`
  ).catch(() => []);

  for (const row of rows) {
    if (row.normalized_key) map.set(row.normalized_key, { id: row.id, customerName: row.customer_name });
  }

  return map;
}

export function normalizeNameForDuplicateCheck(value: string) {
  return value
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/[^0-9a-z가-힣]/g, "");
}

export type DuplicateCustomerGroup = {
  customerName: string;
  count: number;
  customers: Array<{ id: string; address: string; normalizedKey: string }>;
};

/**
 * Finds customer-master rows that share the same (normalized) name but were stored under
 * different normalized_key values — the signature of the same real-world business getting
 * split into multiple records because address text drifted between uploads (extra spaces,
 * floor/unit suffixes, "서울" vs "서울시", etc). This never merges anything automatically;
 * it only surfaces candidates for a human to confirm and clean up manually.
 */
export async function findDuplicateCustomerCandidates(companyId?: string): Promise<DuplicateCustomerGroup[]> {
  const id = companyId || getDefaultCompanyId();
  if (!isProductionStoreConfigured()) return [];

  const rows = await supabaseRequest<Array<{ id: string; customer_name: string; normalized_key: string; address: string | null }>>(
    `normalized_customers?select=id,customer_name,normalized_key,address&company_id=eq.${encodeURIComponent(id)}&limit=1000`
  ).catch(() => []);

  const groups = new Map<string, { customerName: string; customers: Array<{ id: string; address: string; normalizedKey: string }> }>();
  for (const row of rows) {
    if (!row.customer_name?.trim()) continue;
    const nameKey = normalizeNameForDuplicateCheck(row.customer_name);
    if (!nameKey) continue;

    const current = groups.get(nameKey) || { customerName: row.customer_name, customers: [] };
    current.customers.push({ id: row.id, address: row.address || "", normalizedKey: row.normalized_key });
    groups.set(nameKey, current);
  }

  return Array.from(groups.values())
    .filter((group) => new Set(group.customers.map((customer) => customer.normalizedKey)).size > 1)
    .map((group) => ({ customerName: group.customerName, count: group.customers.length, customers: group.customers }))
    .sort((a, b) => b.count - a.count);
}

export type MergeDuplicateCustomersResult = {
  primaryCustomerId: string;
  mergedCustomerIds: string[];
  movedTransactions: number;
  movedNotes: number;
  movedAttachments: number;
};

/**
 * Merges duplicateIds into primaryId: reassigns their sales history (by normalized_key),
 * notes, and attachments to the primary record, then hard-deletes the duplicate rows. This is
 * destructive and irreversible by design (confirmed product decision) — callers must confirm
 * with the user before invoking this.
 */
export async function mergeDuplicateCustomers(companyId: string, primaryId: string, duplicateIds: string[]): Promise<MergeDuplicateCustomersResult> {
  const cleanDuplicateIds = Array.from(new Set(duplicateIds.filter((id) => id && id !== primaryId)));
  const empty: MergeDuplicateCustomersResult = { primaryCustomerId: primaryId, mergedCustomerIds: [], movedTransactions: 0, movedNotes: 0, movedAttachments: 0 };
  if (!cleanDuplicateIds.length) return empty;
  if (!isProductionStoreConfigured()) return { ...empty, mergedCustomerIds: cleanDuplicateIds };

  const rows = await supabaseRequest<Array<{ id: string; normalized_key: string }>>(
    `normalized_customers?select=id,normalized_key&company_id=eq.${encodeURIComponent(companyId)}&id=in.(${[primaryId, ...cleanDuplicateIds]
      .map((id) => encodeURIComponent(id))
      .join(",")})`
  );
  const primaryRow = rows.find((row) => row.id === primaryId);
  if (!primaryRow) throw new Error("병합 대상 거래처(기준 레코드)를 찾을 수 없습니다.");
  const duplicateRows = rows.filter((row) => cleanDuplicateIds.includes(row.id));

  let movedTransactions = 0;
  let movedNotes = 0;
  let movedAttachments = 0;

  for (const duplicate of duplicateRows) {
    if (duplicate.normalized_key && duplicate.normalized_key !== primaryRow.normalized_key) {
      const updated = await supabaseRequest<Array<{ id: string }>>(
        `sales_transactions?company_id=eq.${encodeURIComponent(companyId)}&customer_key=eq.${encodeURIComponent(duplicate.normalized_key)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ customer_key: primaryRow.normalized_key })
        }
      ).catch(() => []);
      movedTransactions += updated.length;
    }

    const movedNoteRows = await supabaseRequest<Array<{ id: string }>>(
      `customer_notes?company_id=eq.${encodeURIComponent(companyId)}&customer_id=eq.${encodeURIComponent(duplicate.id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ customer_id: primaryId })
      }
    ).catch(() => []);
    movedNotes += movedNoteRows.length;

    const movedAttachmentRows = await supabaseRequest<Array<{ id: string }>>(
      `customer_attachments?company_id=eq.${encodeURIComponent(companyId)}&customer_id=eq.${encodeURIComponent(duplicate.id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ customer_id: primaryId })
      }
    ).catch(() => []);
    movedAttachments += movedAttachmentRows.length;
  }

  await supabaseRequest(
    `normalized_customers?company_id=eq.${encodeURIComponent(companyId)}&id=in.(${duplicateRows.map((row) => encodeURIComponent(row.id)).join(",")})`,
    {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    }
  );

  return {
    primaryCustomerId: primaryId,
    mergedCustomerIds: duplicateRows.map((row) => row.id),
    movedTransactions,
    movedNotes,
    movedAttachments
  };
}

export type ChurnRiskCustomer = {
  customerId: string;
  customerName: string;
  address?: string;
  daysSinceLastOrder: number;
  lastOrderDate: string;
  monthlyRevenue: number;
  region?: string;
};

/**
 * Computes churn risk from real sales_transactions history instead of the last_order_days
 * column on normalized_customers — that column is only as fresh as the last customer-master
 * upload and is never recalculated as new sales come in, so it silently goes stale. This joins
 * each customer's normalized_key against the latest matching sales_transactions.sales_date and
 * reports how many days have actually passed since that real transaction. Customers with no
 * sales history at all are skipped (not enough data to call it "churn" vs. "never ordered yet"),
 * and customers already marked business_status "폐업" are skipped since that is a separate,
 * permanent signal already surfaced elsewhere.
 */
export async function getChurnRiskCustomers(companyId?: string, thresholdDays = 21): Promise<ChurnRiskCustomer[]> {
  const id = companyId || getDefaultCompanyId();
  if (!isProductionStoreConfigured()) return [];

  const [customers, transactions] = await Promise.all([
    supabaseRequest<
      Array<{
        id: string;
        customer_name: string;
        region: string | null;
        address: string | null;
        monthly_revenue: number | string | null;
        normalized_key: string | null;
        business_status: string | null;
      }>
    >(
      `normalized_customers?select=id,customer_name,region,address,monthly_revenue,normalized_key,business_status&company_id=eq.${encodeURIComponent(
        id
      )}&limit=2000`
    ).catch(() => []),
    supabaseRequest<Array<{ customer_key: string | null; sales_date: string | null }>>(
      `sales_transactions?select=customer_key,sales_date&company_id=eq.${encodeURIComponent(id)}&sales_date=not.is.null&limit=10000`
    ).catch(() => [])
  ]);

  const latestByKey = new Map<string, string>();
  for (const transaction of transactions) {
    if (!transaction.customer_key || !transaction.sales_date) continue;
    const current = latestByKey.get(transaction.customer_key);
    if (!current || transaction.sales_date > current) latestByKey.set(transaction.customer_key, transaction.sales_date);
  }

  const today = Date.now();
  const results: ChurnRiskCustomer[] = [];
  for (const customer of customers) {
    if (customer.business_status === "폐업") continue;
    if (!customer.normalized_key) continue;
    const lastOrderDate = latestByKey.get(customer.normalized_key);
    if (!lastOrderDate) continue;

    const parsed = new Date(lastOrderDate);
    if (Number.isNaN(parsed.getTime())) continue;
    const daysSinceLastOrder = Math.floor((today - parsed.getTime()) / 86_400_000);
    if (daysSinceLastOrder < thresholdDays) continue;

    results.push({
      customerId: customer.id,
      customerName: customer.customer_name,
      address: customer.address || undefined,
      daysSinceLastOrder,
      lastOrderDate,
      monthlyRevenue: Number(customer.monthly_revenue || 0),
      region: customer.region || undefined
    });
  }

  return results.sort((a, b) => b.daysSinceLastOrder - a.daysSinceLastOrder).slice(0, 30);
}

export type BusinessStatusRefreshResult = {
  configured: boolean;
  checked: number;
  updated: number;
  skippedNoBusinessNumber: number;
  closed: Array<{ customerId: string; customerName: string; closedDate: string | null }>;
};

// Caps how many customers a single on-demand refresh processes, so the action stays responsive
// even for a large customer master. The NTS API itself allows up to 100 numbers per call.
const BUSINESS_STATUS_REFRESH_LIMIT = 300;

/**
 * Refreshes normalized_customers.business_status/business_status_checked_at against the National
 * Tax Service's real-time 휴업/폐업 status API, scoped to a company and optionally a specific set
 * of customer ids. Used both by the on-demand UI action (거래처 관리 > 사업자 상태 조회) and by
 * refreshAllCompaniesBusinessStatuses() for the daily cron. Customers without a saved
 * 사업자등록번호 can't be checked and are counted separately. Returns configured: false (no-op)
 * when NTS_BUSINESS_API_KEY isn't set, so callers can show a clear "API 키 필요" message instead
 * of a silent failure.
 */
export async function bulkUpdateDeliveryManager(companyId: string, customerIds: string[], deliveryManager: string): Promise<{ updated: number }> {
  if (!customerIds.length) return { updated: 0 };
  if (!isProductionStoreConfigured()) return { updated: 0 };

  const trimmed = deliveryManager.trim();
  await supabaseRequest(
    `normalized_customers?company_id=eq.${encodeURIComponent(companyId)}&id=in.(${customerIds.map((id) => encodeURIComponent(id)).join(",")})`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ delivery_manager: trimmed || null })
    }
  );

  return { updated: customerIds.length };
}

export async function refreshCustomerBusinessStatuses(companyId: string, customerIds?: string[]): Promise<BusinessStatusRefreshResult> {
  const emptyResult: BusinessStatusRefreshResult = {
    configured: isBusinessStatusApiConfigured(),
    checked: 0,
    updated: 0,
    skippedNoBusinessNumber: 0,
    closed: []
  };
  if (!emptyResult.configured) return emptyResult;
  if (!isProductionStoreConfigured()) return emptyResult;

  const idFilter = customerIds && customerIds.length ? `&id=in.(${customerIds.map(encodeURIComponent).join(",")})` : "";
  const rows = await supabaseRequest<Array<{ id: string; customer_name: string; business_registration_number: string | null }>>(
    `normalized_customers?select=id,customer_name,business_registration_number&company_id=eq.${encodeURIComponent(
      companyId
    )}${idFilter}&order=business_status_checked_at.asc.nullsfirst&limit=${BUSINESS_STATUS_REFRESH_LIMIT}`
  ).catch(() => []);

  const checkable = rows.filter((row) => normalizeBusinessNumber(row.business_registration_number || "").length === 10);
  const skippedNoBusinessNumber = rows.length - checkable.length;
  if (!checkable.length) {
    return { ...emptyResult, skippedNoBusinessNumber };
  }

  const statusByNumber = await checkBusinessRegistrationStatuses(checkable.map((row) => row.business_registration_number || ""));
  const checkedAt = new Date().toISOString();
  const closed: BusinessStatusRefreshResult["closed"] = [];

  const updates = await Promise.all(
    checkable.map(async (row) => {
      const number = normalizeBusinessNumber(row.business_registration_number || "");
      const status: BusinessStatusResult | undefined = statusByNumber.get(number);
      const label = status?.label || "확인 필요";
      if (label === "폐업") {
        closed.push({ customerId: row.id, customerName: row.customer_name, closedDate: status?.closedDate || null });
      }

      const updated = await supabaseRequest(`normalized_customers?id=eq.${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ business_status: label, business_status_checked_at: checkedAt })
      })
        .then(() => true)
        .catch(() => false);
      return updated;
    })
  );

  return {
    configured: true,
    checked: checkable.length,
    updated: updates.filter(Boolean).length,
    skippedNoBusinessNumber,
    closed
  };
}

export type BusinessStatusDailyRefreshResult = {
  configured: boolean;
  companiesProcessed: number;
  totalChecked: number;
  totalUpdated: number;
  closed: Array<{ companyId: string; customerId: string; customerName: string; closedDate: string | null }>;
};

/**
 * Runs refreshCustomerBusinessStatuses() across every company, for the daily cron
 * (app/api/cron/business-status). Each company is capped at BUSINESS_STATUS_REFRESH_LIMIT
 * customers per run, oldest-checked first, so a growing customer base is covered gradually
 * across days rather than risking one slow run that times out.
 */
export async function refreshAllCompaniesBusinessStatuses(): Promise<BusinessStatusDailyRefreshResult> {
  const emptyResult: BusinessStatusDailyRefreshResult = {
    configured: isBusinessStatusApiConfigured(),
    companiesProcessed: 0,
    totalChecked: 0,
    totalUpdated: 0,
    closed: []
  };
  if (!emptyResult.configured || !isProductionStoreConfigured()) return emptyResult;

  const companies = await supabaseRequest<Array<{ id: string }>>("companies?select=id").catch(() => []);
  const results = await Promise.all(
    companies.map(async (company) => ({ companyId: company.id, result: await refreshCustomerBusinessStatuses(company.id) }))
  );

  return results.reduce<BusinessStatusDailyRefreshResult>(
    (total, { companyId, result }) => ({
      configured: true,
      companiesProcessed: total.companiesProcessed + 1,
      totalChecked: total.totalChecked + result.checked,
      totalUpdated: total.totalUpdated + result.updated,
      closed: [...total.closed, ...result.closed.map((item) => ({ companyId, ...item }))]
    }),
    { ...emptyResult, configured: true }
  );
}

export type ChurnRiskDigestResult = {
  configured: boolean;
  companiesNotified: number;
  companiesSkippedNoRisk: number;
  companiesFailed: Array<{ companyId: string; companyName: string; error: string }>;
};

/**
 * Daily digest: for every company that has a Telegram group chat_id configured in
 * 회사 설정, posts a summary of its 21일+ 매출 없음 거래처 to that group. Companies without a
 * chat_id configured are silently skipped — this is opt-in per company.
 */
export async function sendDailyChurnRiskDigests(): Promise<ChurnRiskDigestResult> {
  const empty: ChurnRiskDigestResult = { configured: isTelegramConfigured(), companiesNotified: 0, companiesSkippedNoRisk: 0, companiesFailed: [] };
  if (!empty.configured || !isProductionStoreConfigured()) return empty;

  const companies = await supabaseRequest<Array<{ id: string; name: string; telegram_chat_id: string | null }>>(
    "companies?select=id,name,telegram_chat_id"
  ).catch(() => []);
  const targets = companies.filter((company) => company.telegram_chat_id?.trim());

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  const results = await Promise.all(
    targets.map(async (company) => {
      try {
        const riskCustomers = await getChurnRiskCustomers(company.id);
        if (!riskCustomers.length) return { skipped: true as const };

        const timelineUrl = appUrl ? `${appUrl}/crm/timeline?companyId=${encodeURIComponent(company.id)}` : "";
        const lines = riskCustomers
          .slice(0, 10)
          .map((customer) => `- ${customer.customerName} (${customer.region || "지역 미확인"}) · ${customer.daysSinceLastOrder}일 경과`);
        const more = riskCustomers.length > 10 ? `\n…외 ${(riskCustomers.length - 10).toLocaleString()}곳` : "";
        const text = [
          `⚠️ <b>${company.name} 이탈 위험 거래처 ${riskCustomers.length}곳</b>`,
          "21일 이상 매출 없는 거래처입니다.",
          "",
          lines.join("\n") + more,
          timelineUrl ? `\n거래처 원장: ${timelineUrl}` : ""
        ]
          .filter(Boolean)
          .join("\n");

        const sendResult = await sendTelegramMessage(company.telegram_chat_id as string, text);
        if (!sendResult.ok) throw new Error(sendResult.error || "발송 실패");
        return { skipped: false as const };
      } catch (error) {
        return { skipped: false as const, error: error instanceof Error ? error.message : String(error), companyId: company.id, companyName: company.name };
      }
    })
  );

  return results.reduce<ChurnRiskDigestResult>(
    (total, result) => {
      if ("error" in result && result.error) {
        return { ...total, companiesFailed: [...total.companiesFailed, { companyId: result.companyId as string, companyName: result.companyName as string, error: result.error }] };
      }
      if (result.skipped) return { ...total, companiesSkippedNoRisk: total.companiesSkippedNoRisk + 1 };
      return { ...total, companiesNotified: total.companiesNotified + 1 };
    },
    { ...empty }
  );
}

export async function matchSalesTransactionsToCustomer(
  companyId: string,
  customerKey: string,
  targetCustomerId: string
): Promise<{ matchedTransactionCount: number; customerName: string }> {
  if (!isProductionStoreConfigured()) throw new Error("Supabase is not configured.");
  if (!customerKey.trim()) throw new Error("연결할 거래처 key가 없습니다.");

  const targetRows = await supabaseRequest<Array<{ id: string; customer_name: string; normalized_key: string }>>(
    `normalized_customers?select=id,customer_name,normalized_key&company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(
      targetCustomerId
    )}&limit=1`
  );
  const targetCustomer = targetRows[0];
  if (!targetCustomer) throw new Error("연결할 거래처를 찾을 수 없습니다.");
  if (!targetCustomer.normalized_key) throw new Error("대상 거래처에 기준 key가 없어 연결할 수 없습니다.");

  const updatedRows = await supabaseRequest<Array<{ id: string }>>(
    `sales_transactions?company_id=eq.${encodeURIComponent(companyId)}&customer_key=eq.${encodeURIComponent(customerKey)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ customer_key: targetCustomer.normalized_key })
    }
  );

  return { matchedTransactionCount: updatedRows.length, customerName: targetCustomer.customer_name };
}

function summarizeSalesTransactions(items: SalesTransactionItem[], truncated = false): SalesTransactionSummary {
  const totalAmount = items.reduce((total, item) => total + item.salesAmount, 0);
  const matchedAmount = items.filter((item) => item.matched).reduce((total, item) => total + item.salesAmount, 0);
  const unmatchedAmount = totalAmount - matchedAmount;
  const matchedCustomerIds = new Set(items.filter((item) => item.matched && item.customerId).map((item) => item.customerId as string));
  const unmatchedCustomerNames = new Set(items.filter((item) => !item.matched).map((item) => item.customerName || "미지정 거래처"));
  const distinctCustomerKeys = new Set(items.map((item) => item.customerId || `name:${item.customerName || "미지정 거래처"}`));

  const customerGroups = new Map<
    string,
    { customerId?: string; customerName: string; matched: boolean; latestSalesDate?: string; totalAmount: number; transactionCount: number }
  >();

  for (const item of items) {
    const groupKey = item.customerId || `name:${item.customerName || "미지정 거래처"}`;
    const current = customerGroups.get(groupKey) || {
      customerId: item.customerId,
      customerName: item.customerName || "미지정 거래처",
      matched: item.matched,
      totalAmount: 0,
      transactionCount: 0
    };
    current.totalAmount += item.salesAmount;
    current.transactionCount += 1;
    if (!current.latestSalesDate || compareDateText(item.salesDate, current.latestSalesDate) > 0) {
      current.latestSalesDate = item.salesDate;
    }
    customerGroups.set(groupKey, current);
  }

  const topCustomers = Array.from(customerGroups.values())
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 8)
    .map((group) => ({
      customerId: group.customerId,
      customerName: group.customerName,
      matched: group.matched,
      grade: getSalesAmountGrade(group.totalAmount),
      latestSalesDate: group.latestSalesDate,
      share: totalAmount ? Math.round((group.totalAmount / totalAmount) * 100) : 0,
      totalAmount: group.totalAmount,
      transactionCount: group.transactionCount
    }));
  const topProducts = summarizeSalesGroup(items, (item) => item.productName || "미지정 품목").slice(0, 8).map((item) => ({
    productName: item.key,
    share: totalAmount ? Math.round((item.totalAmount / totalAmount) * 100) : 0,
    totalAmount: item.totalAmount,
    transactionCount: item.transactionCount
  }));

  const unmatchedGroupMap = new Map<
    string,
    { customerKey: string; customerName: string; latestSalesDate?: string; totalAmount: number; transactionCount: number }
  >();
  for (const item of items) {
    if (item.matched || !item.customerKey) continue;
    const current = unmatchedGroupMap.get(item.customerKey) || {
      customerKey: item.customerKey,
      customerName: item.customerName || "미지정 거래처",
      totalAmount: 0,
      transactionCount: 0
    };
    current.totalAmount += item.salesAmount;
    current.transactionCount += 1;
    if (!current.latestSalesDate || compareDateText(item.salesDate, current.latestSalesDate) > 0) {
      current.latestSalesDate = item.salesDate;
    }
    unmatchedGroupMap.set(item.customerKey, current);
  }
  const unmatchedGroups = Array.from(unmatchedGroupMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);

  return {
    averageOrderAmount: items.length ? Math.round(totalAmount / items.length) : 0,
    topCustomers,
    topProducts,
    unmatchedGroups,
    totalAmount,
    transactionCount: items.length,
    customerCount: distinctCustomerKeys.size,
    matchedCustomerCount: matchedCustomerIds.size,
    unmatchedCustomerCount: unmatchedCustomerNames.size,
    matchedAmount,
    unmatchedAmount,
    matchRate: totalAmount ? Math.round((matchedAmount / totalAmount) * 100) : 0,
    latestSalesDate: items.find((item) => item.salesDate)?.salesDate,
    items,
    truncated
  };
}

function summarizeSalesGroup(items: SalesTransactionItem[], getKey: (item: SalesTransactionItem) => string) {
  const groups = new Map<string, { key: string; latestSalesDate?: string; totalAmount: number; transactionCount: number }>();

  for (const item of items) {
    const key = getKey(item).trim() || "미지정";
    const current = groups.get(key) || { key, totalAmount: 0, transactionCount: 0 };
    current.totalAmount += item.salesAmount;
    current.transactionCount += 1;
    if (!current.latestSalesDate || compareDateText(item.salesDate, current.latestSalesDate) > 0) {
      current.latestSalesDate = item.salesDate;
    }
    groups.set(key, current);
  }

  return Array.from(groups.values()).sort((a, b) => b.totalAmount - a.totalAmount);
}

function compareDateText(left?: string, right?: string) {
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  return left.localeCompare(right);
}

function getSalesAmountGrade(amount: number): "A" | "B" | "C" {
  if (amount >= 2500000) return "A";
  if (amount >= 1800000) return "B";
  return "C";
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
    getLatestBriefing(companyId).catch(() => getEmptyBriefing(isProductionStoreConfigured() ? "supabase" : "sample")),
    getLatestReport(companyId).catch(() => analyzeCompany([])),
    getLatestLeads(companyId).catch(() => ({ total: 0, leads: [] })),
    getUploadHistory(companyId).catch(() => [])
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
    updatedAt: "기준 데이터"
  };

  if (!isProductionStoreConfigured()) {
    return fallback;
  }

  type CompanyRow = {
    id: string;
    name: string;
    business_type: string | null;
    owner_name: string | null;
    origin_address: string | null;
    status: string;
    telegram_chat_id?: string | null;
    updated_at: string;
  };
  let rows: CompanyRow[];

  try {
    rows = await supabaseRequest<Array<CompanyRow>>(
      `companies?select=id,name,business_type,owner_name,origin_address,status,telegram_chat_id,updated_at&id=eq.${encodeURIComponent(id)}&limit=1`
    );
  } catch (error) {
    if (!isMissingTelegramChatIdColumnError(error)) throw error;
    rows = await supabaseRequest<Array<CompanyRow>>(
      `companies?select=id,name,business_type,owner_name,origin_address,status,updated_at&id=eq.${encodeURIComponent(id)}&limit=1`
    ).catch(() => []);
  }

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
    telegramChatId: row.telegram_chat_id || undefined,
    updatedAt: new Date(row.updated_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
  };
}

export async function updateCompanySettings(companyId: string, input: CompanySettingsInput) {
  const payload: Record<string, unknown> = {
    id: companyId,
    name: input.name.trim(),
    business_type: input.businessType?.trim() || null,
    owner_name: input.ownerName?.trim() || null,
    origin_address: input.originAddress?.trim() || null,
    telegram_chat_id: input.telegramChatId?.trim() || null,
    status: "active",
    updated_at: new Date().toISOString()
  };

  if (!payload.name) throw new Error("회사명은 필수입니다.");

  if (!isProductionStoreConfigured()) {
    return {
      persisted: false,
      company: {
        id: companyId,
        name: payload.name as string,
        businessType: (payload.business_type as string) || "",
        ownerName: (payload.owner_name as string) || "",
        originAddress: (payload.origin_address as string) || "",
        telegramChatId: (payload.telegram_chat_id as string) || undefined,
        status: "active",
        updatedAt: "서버 저장 미확인"
      }
    };
  }

  type CompanyRow = {
    id: string;
    name: string;
    business_type: string | null;
    owner_name: string | null;
    origin_address: string | null;
    telegram_chat_id?: string | null;
    status: string;
    updated_at: string;
  };
  let rows: CompanyRow[];

  try {
    rows = await supabaseRequest<Array<CompanyRow>>("companies?on_conflict=id", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify([payload])
    });
  } catch (error) {
    if (!isMissingTelegramChatIdColumnError(error)) throw error;
    if (payload.telegram_chat_id) {
      throw new Error(
        "텔레그램 chat_id를 저장할 수 없습니다. Supabase에 telegram_chat_id 컬럼이 아직 없습니다. ALTER TABLE companies ADD COLUMN IF NOT EXISTS telegram_chat_id text; 를 먼저 실행하세요."
      );
    }
    const { telegram_chat_id: _telegramChatId, ...payloadWithoutTelegram } = payload;
    rows = await supabaseRequest<Array<CompanyRow>>("companies?on_conflict=id", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify([payloadWithoutTelegram])
    });
  }

  const row = rows[0];
  return {
    persisted: true,
    company: {
      id: row.id,
      name: row.name,
      businessType: row.business_type || "",
      ownerName: row.owner_name || "",
      originAddress: row.origin_address || "",
      telegramChatId: row.telegram_chat_id || undefined,
      status: row.status,
      updatedAt: new Date(row.updated_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    }
  };
}

export async function getAdminDashboardPayload(): Promise<AdminDashboardPayload> {
  if (!isProductionStoreConfigured()) return getEmptyAdminDashboardPayload("sample");

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
    supabaseRequest<Array<{ id: string; name: string; region: string; score: number; status: string; company_id: string }>>(
      "lead_recommendations?select=id,name,region,score,status,company_id&order=score.desc&limit=20"
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
  const totalRows = Math.max(1, processedRows);
  const duplicateRows = imports.reduce((total, item) => total + Number(item.duplicate_count || 0), 0);
  const duplicateCleanRate = imports.length ? Math.max(0, Math.round(((totalRows - duplicateRows) / totalRows) * 100)) : 0;

  return {
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
      { label: "중복 제거율", value: duplicateCleanRate, description: "업로드 행 수 대비 중복 후보가 아닌 행 비율입니다." },
      { label: "필수 컬럼 완성도", value: avgQuality, description: "거래처명, 지역, 주소, 업종, 매출, 방문 정보를 확인합니다." },
      { label: "리포트 생성 성공률", value: reports.length ? 100 : 0, description: "실 DB에 생성된 AI 리포트 기준입니다." }
    ],
    scoringWeights: getOperationalScoringWeights(),
    leadQueue: leads.map((lead) => ({
      id: lead.id,
      name: lead.name,
      region: lead.region,
      score: lead.score,
      status: lead.status === "today" ? "오늘 추천" : lead.status === "this-week" ? "이번주 추천" : lead.status,
      statusValue: lead.status,
      companyId: lead.company_id
    })),
    uploadHistory
  };
}

function getEmptyAdminDashboardPayload(source: "sample" | "supabase"): AdminDashboardPayload {
  return {
    source,
    overview: {
      companies: 0,
      uploadedFiles: 0,
      processedRows: 0,
      avgHealthScore: 0
    },
    jobs: [],
    dataQuality: [
      { label: "주소 인식률", value: 0, description: "거래처 마스터를 등록하면 주소/지역 완성도를 계산합니다." },
      { label: "중복 제거율", value: 0, description: "거래처명, 주소, 사업자번호 기준 중복 후보를 계산합니다." },
      { label: "필수 컬럼 완성도", value: 0, description: "필수 필드 매핑 후 저장 품질을 표시합니다." },
      { label: "리포트 생성 성공률", value: 0, description: "실 DB에 생성된 AI 리포트 기준으로 표시합니다." }
    ],
    scoringWeights: getOperationalScoringWeights(),
    leadQueue: [],
    uploadHistory: []
  };
}

function getOperationalScoringWeights(): AdminDashboardPayload["scoringWeights"] {
  return [
    { label: "영업력", value: 22, note: "최근 주문과 거래 규모" },
    { label: "배송효율", value: 18, note: "출발지-매장 거리와 배송권역" },
    { label: "CRM관리", value: 16, note: "메모, 방문, 첨부자료 완성도" },
    { label: "신규영업", value: 18, note: "White Space와 신규 기회" },
    { label: "집중도", value: 14, note: "지역과 업종 편중 위험" },
    { label: "리스크", value: 12, note: "이탈 가능성과 사업자 상태" }
  ];
}

export async function getUploadHistory(companyId?: string): Promise<UploadHistoryItem[]> {
  if (!isProductionStoreConfigured()) return [];

  const companyFilter = companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "";
  const rows = await supabaseRequest<
    Array<{
      id: string;
      company_id: string;
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
    `customer_imports?select=id,company_id,row_count,status,quality_score,duplicate_count,created_at,companies(name),uploaded_files(original_filename),ai_reports(id,health_score)${companyFilter}&order=created_at.desc&limit=12`
  );

  return rows.map((row) => ({
    id: row.id,
    company: row.companies?.name || "고객사",
    companyId: row.company_id,
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

export async function getAdminAuditLogs(companyId?: string, limit = 12): Promise<AdminAuditLogItem[]> {
  if (!isProductionStoreConfigured()) return [];

  const companyFilter = companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "";
  const rows = await supabaseRequest<
    Array<{
      id: string;
      action: string;
      target_type: string | null;
      target_id: string | null;
      company_id: string | null;
      metadata: Record<string, unknown> | null;
      created_at: string;
      companies: { name: string } | null;
    }>
  >(
    `admin_audit_logs?select=id,action,target_type,target_id,company_id,metadata,created_at,companies(name)${companyFilter}&order=created_at.desc&limit=${Math.max(
      1,
      Math.min(limit, 50)
    )}`
  );

  return rows.map((row) => {
    const metadata = row.metadata || {};

    return {
      id: row.id,
      action: row.action,
      actorName: String(metadata.actorName || "시스템"),
      company: row.companies?.name || "고객사 미확인",
      companyId: row.company_id || "",
      metadata,
      targetId: row.target_id || "",
      targetType: row.target_type || "대상 미확인",
      createdAt: new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    };
  });
}

async function writeAdminAuditLog({
  action,
  companyId,
  metadata,
  targetId,
  targetType
}: {
  action: string;
  companyId: string;
  metadata: Record<string, unknown>;
  targetId?: string;
  targetType?: string;
}) {
  if (!isProductionStoreConfigured()) return;

  try {
    await supabaseRequest("admin_audit_logs", {
      method: "POST",
      body: JSON.stringify([
        {
          action,
          company_id: companyId,
          metadata,
          target_id: targetId || null,
          target_type: targetType || null
        }
      ])
    });
  } catch (error) {
    // 감사 로그 저장 실패가 실제 사용자 작업(등록/수정/메모 저장 등)까지 막으면 안 되므로 여기서 삼켜서
    // 호출부에는 영향이 없게 하되, Vercel Function 로그에는 남겨서 운영자가 추적할 수 있게 합니다.
    // /admin/system 진단의 "감사 로그" 항목이 missing으로 뜨면 이 로그와 함께 원인을 확인하세요.
    console.error(`[writeAdminAuditLog] action=${action} companyId=${companyId} 실패: ${getErrorMessage(error)}`);
  }
}

/**
 * Sales-analysis uploads (ERP 매출 거래내역서) very often only carry a 거래처명 column, with no
 * address and no business registration number. Building the customer_key from name + empty
 * address in that case produces a key that can never equal the customer master's
 * name + real-address key, so the transaction silently lands in unmatchedGroups even though a
 * matching customer clearly exists. This resolves that common case up front: for rows with
 * neither a business number nor an address, look up the existing customer master by normalized
 * name and reuse its normalized_key directly when the name is unambiguous (exactly one
 * customer). Ambiguous or unknown names fall back to the previous behavior (unmatched, visible
 * in the manual matching UI).
 */
async function buildNameOnlyCustomerKeyLookup(companyId: string) {
  const lookup = new Map<string, string>();
  if (!isProductionStoreConfigured()) return lookup;

  const rows = await supabaseRequest<Array<{ customer_name: string; normalized_key: string }>>(
    `normalized_customers?select=customer_name,normalized_key&company_id=eq.${encodeURIComponent(companyId)}&limit=5000`
  ).catch(() => []);

  const seenKeys = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.customer_name?.trim() || !row.normalized_key) continue;
    const nameKey = normalizeNameForDuplicateCheck(row.customer_name);
    if (!nameKey) continue;
    const keys = seenKeys.get(nameKey) || new Set<string>();
    keys.add(row.normalized_key);
    seenKeys.set(nameKey, keys);
  }
  for (const [nameKey, keys] of Array.from(seenKeys)) {
    if (keys.size === 1) lookup.set(nameKey, Array.from(keys)[0]);
  }

  return lookup;
}

async function saveSalesTransactions(companyId: string, importId: string, rawRows: RawUploadRow[], columnMapping: ColumnMapping) {
  const nameOnlyLookup = await buildNameOnlyCustomerKeyLookup(companyId).catch(() => new Map<string, string>());
  const salesRows = rawRows
    .map((row) => {
      const customerName = getRawCell(row, columnMapping.customerName);
      const businessRegistrationNumber = normalizeBusinessNumber(getRawCell(row, columnMapping.businessRegistrationNumber));
      const address = getRawCell(row, columnMapping.address);
      const nameOnlyMatch = !businessRegistrationNumber && !address ? nameOnlyLookup.get(normalizeNameForDuplicateCheck(customerName)) : undefined;
      const customerKey = businessRegistrationNumber || nameOnlyMatch || makeCustomerKey(customerName, address);

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

export function normalizeBusinessNumber(value: string) {
  return value.replace(/[^0-9]/g, "");
}

export function makeCustomerKey(customerName: string, address: string) {
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
    google_map_url: asNullableString(row.google_map_url),
    industry: asNullableString(row.industry),
    kakao_place_url: asNullableString(row.kakao_place_url),
    last_order_days: typeof row.last_order_days === "number" ? row.last_order_days : 0,
    monthly_revenue: row.monthly_revenue as number | string | null,
    naver_place_url: asNullableString(row.naver_place_url),
    opening_date: asNullableString(row.opening_date),
    phone: asNullableString(row.phone),
    place_links_checked_at: asNullableString(row.place_links_checked_at),
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
    google_map_url?: string | null;
    industry: string | null;
    kakao_place_url?: string | null;
    last_order_days: number | null;
    monthly_revenue: number | string | null;
    naver_place_url?: string | null;
    opening_date: string | null;
    phone: string | null;
    place_links_checked_at?: string | null;
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
    businessNumber: row.business_registration_number || undefined,
    businessStatus: row.business_status || undefined,
    businessStatusCheckedAt: row.business_status_checked_at || undefined,
    customerName: row.customer_name,
    deliveryKm: Number(row.delivery_km || 0),
    deliveryManager: row.delivery_manager || undefined,
    deliveryMinutes: row.delivery_minutes || undefined,
    deliveryZone: row.delivery_zone || undefined,
    email: row.email || undefined,
    grade: getRevenueGrade(monthlyRevenue),
    industry: row.industry || "미분류",
    lastOrderDays: Number(row.last_order_days || 0),
    loadingPosition: row.loading_position || undefined,
    googleMapUrl: row.google_map_url || undefined,
    kakaoPlaceUrl: row.kakao_place_url || undefined,
    memoCount: 2 + (index % 4),
    monthlyRevenue,
    naverPlaceUrl: row.naver_place_url || undefined,
    openingDate: row.opening_date || undefined,
    phone: row.phone || undefined,
    placeLinksCheckedAt: row.place_links_checked_at || undefined,
    region: row.region || "미분류",
    representativeName: row.representative_name || undefined,
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
        google_map_url: customer.googleMapUrl || null,
        industry: customer.industry,
        kakao_place_url: customer.kakaoPlaceUrl || null,
        last_order_days: customer.lastOrderDays,
        monthly_revenue: customer.monthlyRevenue,
        naver_place_url: customer.naverPlaceUrl || null,
        opening_date: null,
        phone: null,
        place_links_checked_at: customer.naverPlaceUrl || customer.kakaoPlaceUrl || customer.googleMapUrl ? "운영 링크 등록" : null,
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
  const resolvedCompanyId = companyId || getDefaultCompanyId();

  return [
    {
      id: "sample-import-003",
      company,
      companyId: resolvedCompanyId,
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
      companyId: resolvedCompanyId,
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
      companyId: resolvedCompanyId,
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
      memo: "테스트 납품 가능 여부 확인 요청.",
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

import { analyzeCompany, AnalysisResult } from "./analysis";
import { BusinessStatusResult, checkBusinessRegistrationStatusesWithHealth, isBusinessStatusApiConfigured } from "./business-status";
import { fetchRecentGovRestaurantRows, isGovRestaurantApiConfigured } from "./gov-restaurant";
import { fetchRecentSeoulRestaurantRows, isSeoulOpenDataConfigured } from "./seoul-restaurant";
import { geocodeRegionLabel, isKakaoKeywordLeadSearchConfigured, searchKakaoKeywordLeads } from "./kakao-keyword-leads";
import { GoogleReviewSyncResult, isGoogleReviewsApiConfigured, syncGoogleReviewsForCustomer } from "./google-reviews";
import { fetchKeywordVolumeScores, isNaverDatalabConfigured } from "./naver-datalab";
import { enrichLeadRecommendations } from "./leads";
import { summarizePastedReviewText } from "./review-summarizer";
import { resolvePlaceLinks } from "./place-links";
import { CustomerRow, sampleCustomers } from "./sample-data";
import { isTelegramConfigured, sendTelegramMessage } from "./telegram";
import { hashPassword } from "./password";
import { sendEmail } from "./email";
import { isValidBusinessRegistrationNumber, normalizeBusinessNumber } from "./business-number";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { GeoPoint, haversineDistanceKm, resolveAddressPoint, RouteDistanceResult } from "./tmap";
import { chargeBilling, generateTossKey, isTossPaymentsConfigured, TossPayment } from "./toss-payments";
import { CustomerMessageChannel, sendCustomerMessage } from "./customer-messages";

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
  source: "empty" | "supabase";
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
  deliveryCompleteMessage?: string;
  deliveryIssueMessage?: string;
  deliveryPartialMessage?: string;
  notificationPhone?: string;
  notificationSenderName?: string;
  ownerName: string;
  originAddress: string;
  smsSenderPhone?: string;
  status: string;
  telegramChatId?: string;
  updatedAt: string;
  workspaceType?: "personal" | "company";
};
export type CompanySettingsInput = {
  businessType?: string;
  deliveryCompleteMessage?: string;
  deliveryIssueMessage?: string;
  deliveryPartialMessage?: string;
  name: string;
  notificationPhone?: string;
  notificationSenderName?: string;
  originAddress?: string;
  ownerName?: string;
  smsSenderPhone?: string;
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
  deliveryVehicle?: string;
  deliveryZone?: string;
  email?: string;
  grade: "A" | "B" | "C";
  industry: string;
  lastOrderDays: number;
  loadingPosition?: string;
  accessMethodType?: string;
  accessNote?: string;
  accessPassword?: string;
  businessHours?: string;
  menuSummary?: string;
  naverPlaceUrl?: string;
  kakaoPlaceUrl?: string;
  googleMapUrl?: string;
  placeLinksCheckedAt?: string;
  memoCount: number;
  monthlyRevenue: number;
  openingDate?: string;
  phone?: string;
  region: string;
  relationshipStatus?: string;
  relationshipStatusNote?: string;
  relationshipStatusUpdatedAt?: string;
  representativeName?: string;
  reviewSummary?: string;
  reviewKeywords?: string[];
  reviewSource?: string;
  reviewsUpdatedAt?: string;
  visitCount: number;
  // 동시 편집 감지(낙관적 동시성 제어)용 마지막 수정 시각. 편집 화면이 이 값을 저장해뒀다가
  // 다음 저장 요청에 expectedUpdatedAt으로 그대로 실어 보내면, 그 사이 다른 사람이 먼저 저장했는지
  // 서버가 확인할 수 있습니다.
  updatedAt?: string;
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
  deliveryVehicle?: string;
  deliveryZone?: string;
  email?: string;
  industry?: string;
  lastOrderDays?: number;
  loadingPosition?: string;
  accessMethodType?: string;
  accessNote?: string;
  accessPassword?: string;
  businessHours?: string;
  menuSummary?: string;
  naverPlaceUrl?: string;
  kakaoPlaceUrl?: string;
  googleMapUrl?: string;
  monthlyRevenue?: number;
  openingDate?: string;
  phone?: string;
  region?: string;
  representativeName?: string;
  reviewSummary?: string;
  reviewKeywords?: string[];
  reviewSource?: string;
  visitCount?: number;
  // 편집 화면이 마지막으로 읽은 updated_at(동시 편집 감지용). 기존 거래처를 수정하는 요청에서만
  // 의미가 있고, 값이 없으면(레거시 호출부 등) 동시성 검사를 건너뛰고 기존처럼 동작합니다.
  expectedUpdatedAt?: string;
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
  deliveryVehicle?: string;
  distanceKm?: number;
  durationMinutes?: number;
  email?: string;
  industry?: string;
  loadingPosition?: string;
  accessMethodType?: string;
  accessNote?: string;
  accessPassword?: string;
  businessHours?: string;
  menuSummary?: string;
  naverPlaceUrl?: string;
  kakaoPlaceUrl?: string;
  googleMapUrl?: string;
  openingDate?: string;
  order: number;
  phone?: string;
  relationshipStatus?: string;
  representativeName?: string;
  reviewSummary?: string;
  reviewKeywords?: string[];
  reviewSource?: string;
  reviewsUpdatedAt?: string;
  routeCalculatedAt?: string;
  routeProvider?: "tmap" | "estimated" | "cached";
  // 동시 편집 감지(낙관적 동시성 제어)용. 편집 화면이 이 값을 저장해뒀다가 다음 저장 요청에
  // expectedUpdatedAt으로 실어 보냅니다. lib/store.ts의 CustomerMasterItem.updatedAt 참고.
  updatedAt?: string;
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
  source: "empty" | "supabase";
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
  // 2026-08-24 피드백("삭제가 계속 안되네") 근본 원인 수정: 담당자가 지정되지 않은 거래처를
  // "김배송 매니저" 같은 가짜 이름으로 자동 채우던 로직을 없애고, 대신 이 플래그로 표시되는 단일
  // "미배정" 그룹으로 모읍니다. 실제로 저장된 배송차/담당자가 아니므로 삭제·편집 대상이 될 수 없습니다.
  isUnassigned?: boolean;
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
  companyStatus?: string;
  ownerName?: string;
  userId?: string;
  userStatus?: string;
  workspaceRole?: StaffInvitation["role"] | "owner" | "member";
  credentialSource?: "app_users" | "auth_credentials" | "fallback";
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
export type StaffMobileLocationInput = {
  accuracyMeters?: number;
  companyId: string;
  currentCustomerId?: string;
  deliveryVehicle?: string;
  driverName?: string;
  lat: number;
  lng: number;
  status?: "active" | "paused" | "offline";
  userAgent?: string;
  userId: string;
};
export type StaffVehicleLocation = {
  accuracyMeters?: number;
  currentCustomerId?: string;
  deliveryVehicle?: string;
  driverName: string;
  id: string;
  isStale: boolean;
  lastLocationAt?: string;
  lastSeenAt?: string;
  lat: number;
  lng: number;
  status: "active" | "paused" | "offline" | "stale";
  userId: string;
};
export type StaffLocationEvent = {
  accuracyMeters?: number;
  currentCustomerId?: string;
  deliveryVehicle?: string;
  driverName: string;
  id: string;
  lat: number;
  lng: number;
  recordedAt: string;
  userId: string;
};
export type DeliveryCompletionEvent = {
  actualOrder: number;
  completedAt: string;
  customerId: string;
  customerName: string;
  deliveryDriver?: string;
  deliveryVehicle?: string;
  id: string;
  memoSnippet?: string;
  plannedOrder?: number;
  statusLabel?: string;
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
  userId?: string;
  workspaceRole: StaffInvitation["role"];
};
export type PersonalKakaoWorkspaceResult = {
  companyId: string;
  companyName: string;
  email: string;
  name: string;
  persisted: boolean;
  userId?: string;
  workspaceRole: StaffInvitation["role"] | "owner";
};
export type OAuthProvider = "naver" | "google";
export type LinkedOAuthProvider = OAuthProvider | "kakao";
export type StaffOAuthAcceptInput = {
  avatarUrl?: string;
  email?: string;
  inviteCode: string;
  name?: string;
  provider: OAuthProvider;
  providerUserId: string;
};
export type PersonalOAuthWorkspaceInput = {
  avatarUrl?: string;
  email?: string;
  name?: string;
  provider: OAuthProvider;
  providerUserId: string;
};
export type StaffInvitationPreview = {
  companyId: string;
  companyName: string;
  employeeName: string;
  role: StaffInvitation["role"];
  status: StaffInvitation["status"];
};
export type DirectStaffAccountInput = {
  companyId: string;
  employeeName: string;
  employeeEmail?: string;
  employeePhone?: string;
  role?: StaffInvitation["role"];
};
export type DirectStaffAccountResult = {
  persisted: boolean;
  userId?: string;
  companyId: string;
  companyName: string;
  name: string;
  email: string;
  temporaryPassword: string;
  role: StaffInvitation["role"];
};

async function upsertAuthIdentity(input: { email?: string | null; provider: LinkedOAuthProvider; providerUserId: string; userId: string }) {
  if (!isProductionStoreConfigured()) return;
  if (!input.providerUserId || !input.userId) return;
  await supabaseRequest("auth_identities?on_conflict=provider,provider_user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([
      {
        email: input.email || null,
        last_used_at: new Date().toISOString(),
        provider: input.provider,
        provider_user_id: input.providerUserId,
        user_id: input.userId
      }
    ])
  }).catch(() => null);
}

export type CustomerAuthConnection = {
  connected: boolean;
  email?: string;
  lastUsedAt?: string;
  provider: "email" | LinkedOAuthProvider;
};

export async function linkOAuthIdentityToUser(input: {
  avatarUrl?: string | null;
  email?: string | null;
  name?: string | null;
  provider: LinkedOAuthProvider;
  providerUserId: string;
  userId: string;
}) {
  if (!isProductionStoreConfigured()) return { persisted: false };
  const providerColumn = `${input.provider}_user_id`;
  const now = new Date().toISOString();

  await upsertAuthIdentity({
    email: input.email,
    provider: input.provider,
    providerUserId: input.providerUserId,
    userId: input.userId
  });

  await appUsersRequest(`app_users?id=eq.${encodeURIComponent(input.userId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      avatar_url: input.avatarUrl || null,
      last_auth_provider: input.provider,
      last_login_at: now,
      name: input.name || undefined,
      [providerColumn]: input.providerUserId
    })
  }).catch(() => null);

  return { persisted: true };
}

export async function getCustomerAuthConnections(input: { email?: string; userId?: string }): Promise<CustomerAuthConnection[]> {
  const base: CustomerAuthConnection[] = [
    { connected: Boolean(input.email), email: input.email, provider: "email" },
    { connected: false, provider: "kakao" },
    { connected: false, provider: "naver" },
    { connected: false, provider: "google" }
  ];
  if (!isProductionStoreConfigured()) return base;

  let userId = input.userId || "";
  const email = input.email?.trim().toLowerCase() || "";
  if (!userId && email) {
    const users = await supabaseRequest<Array<{ id: string }>>(`app_users?select=id&email=eq.${encodeURIComponent(email)}&limit=1`).catch(() => []);
    userId = users[0]?.id || "";
  }
  if (!userId) return base;

  const identities = await supabaseRequest<
    Array<{
      email: string | null;
      last_used_at: string | null;
      provider: LinkedOAuthProvider;
    }>
  >(`auth_identities?select=provider,email,last_used_at&user_id=eq.${encodeURIComponent(userId)}`).catch(() => []);
  const identityByProvider = new Map(identities.map((identity) => [identity.provider, identity]));

  return base.map((connection) => {
    if (connection.provider === "email") return connection;
    const identity = identityByProvider.get(connection.provider);
    return {
      ...connection,
      connected: Boolean(identity),
      email: identity?.email || undefined,
      lastUsedAt: identity?.last_used_at || undefined
    };
  });
}
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
const CUSTOMER_MASTER_SELECT_WITH_PLACE_LINKS_AND_HOURS_MENU = `${CUSTOMER_MASTER_SELECT_WITH_PLACE_LINKS},business_hours,menu_summary`;
const CUSTOMER_MASTER_SELECT_WITH_RELATIONSHIP_STATUS = `${CUSTOMER_MASTER_SELECT_WITH_PLACE_LINKS_AND_HOURS_MENU},relationship_status,relationship_status_updated_at,relationship_status_note`;
// 배송차(deliveryVehicle)는 담당자(deliveryDriver)와 별개로 지정할 수 있는 독립된 값입니다.
// supabase/migrations/20260818_customer_delivery_vehicle.sql을 아직 실행하지 않은 환경에서도
// 나머지 거래처 조회가 함께 깨지지 않도록 가장 바깥쪽(가장 넓은) select 티어로 추가합니다.
const CUSTOMER_MASTER_SELECT_WITH_DELIVERY_VEHICLE = `${CUSTOMER_MASTER_SELECT_WITH_RELATIONSHIP_STATUS},delivery_vehicle`;
// 거래처 카드에 리뷰 기반 키워드 뱃지·AI 요약을 보여주기 위한 컬럼입니다.
// supabase/migrations/20260818b_customer_contacts_and_review_enrichment.sql을 아직 실행하지 않은 환경에서도
// 나머지 거래처 조회가 깨지지 않도록 가장 바깥쪽(가장 넓은) select 티어로 추가합니다.
const CUSTOMER_MASTER_SELECT_WITH_REVIEWS = `${CUSTOMER_MASTER_SELECT_WITH_DELIVERY_VEHICLE},review_summary,review_keywords,review_source,reviews_updated_at`;
// 거래처 출입방법(열쇠/카드/비밀번호/숨김위치)·비밀번호를 저장하기 위한 컬럼입니다(2026-08-24 피드백:
// "거래처의 출입방법과 비밀번호를 저장해야해. 놓친 것 같아"). supabase/migrations/20260824_customer_access_method.sql을
// 아직 실행하지 않은 환경에서도 나머지 거래처 조회가 깨지지 않도록 가장 바깥쪽(가장 넓은) select 티어로 추가합니다.
const CUSTOMER_MASTER_SELECT_WITH_ACCESS_METHOD = `${CUSTOMER_MASTER_SELECT_WITH_REVIEWS},access_method_type,access_note,access_password`;
// 동시 편집 감지(낙관적 동시성 제어)용 updated_at입니다. supabase/migrations/20260831c_normalized_customers_updated_at.sql을
// 아직 실행하지 않은 환경에서도 나머지 거래처 조회가 깨지지 않도록 가장 바깥쪽(가장 넓은) select 티어로 추가합니다.
const CUSTOMER_MASTER_SELECT_WITH_CONCURRENCY = `${CUSTOMER_MASTER_SELECT_WITH_ACCESS_METHOD},updated_at`;
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

  // Prefer: return=minimal은 PATCH/DELETE에서는 204(본문 없음)로 오지만, POST(insert)에서는
  // 201에 빈 본문으로 옵니다. 상태 코드 204만 특별 취급하면 이 201-빈 본문 케이스에서
  // response.json()이 "Unexpected end of JSON input"으로 죽습니다. 상태 코드 대신 본문이
  // 실제로 비어 있는지로 판단해 두 경우 모두 안전하게 처리합니다.
  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

function isMissingStaffInvitationTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("PGRST205") && message.includes("staff_invitations");
}

function isMissingStaffMobileLocationSchemaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("staff_mobile_devices") &&
    (message.includes("PGRST205") ||
      message.includes("last_lat") ||
      message.includes("last_lng") ||
      message.includes("last_location_at") ||
      message.includes("location_status") ||
      message.includes("schema cache"))
  );
}

function isInvalidSupabaseApiKeyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Invalid API key") || message.includes("Forbidden use of secret API key");
}

function isMissingCustomerPlaceLinksColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return ["naver_place_url", "kakao_place_url", "google_map_url", "place_links_checked_at"].some((column) => message.includes(column));
}

function isMissingCustomerHoursMenuColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return ["business_hours", "menu_summary"].some((column) => message.includes(column));
}

function isMissingCustomerRelationshipStatusColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return ["relationship_status", "relationship_status_updated_at", "relationship_status_note"].some((column) => message.includes(column));
}

// Generic "column does not exist" detector. Used to cascade through progressively narrower
// select lists AND progressively narrower insert/upsert payloads WITHOUT naming specific columns.
// This matters because PostgREST reports missing columns differently depending on where they show
// up: a SELECT referencing an unknown column fails with raw Postgres error 42703 ("column ... does
// not exist"), while an INSERT/UPSERT body containing an unknown JSON key fails with PostgREST's
// own code PGRST204 ("Could not find the 'x' column of 'y' in the schema cache") — no "42703" or
// "does not exist" text at all. Matching only the SELECT-side signature silently breaks every
// payload-tier cascade (UPSERT_PAYLOAD_TIERS etc.) whenever the newest column hasn't been migrated
// yet: the first (widest) tier throws an error this function fails to recognize, so it's rethrown
// instead of falling back. Match both signatures here so a single check covers reads and writes.
function isMissingColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("42703") || message.includes("does not exist") || message.includes("PGRST204") || message.includes("schema cache");
}

function removePasswordHashFromBody(body: BodyInit | null | undefined) {
  if (!body || typeof body !== "string" || !body.includes("password_hash")) return body;
  try {
    const parsed = JSON.parse(body);
    const strip = (row: Record<string, unknown>) => {
      const next = { ...row };
      delete next.password_hash;
      return next;
    };
    if (Array.isArray(parsed)) return JSON.stringify(parsed.map((row) => (row && typeof row === "object" ? strip(row as Record<string, unknown>) : row)));
    if (parsed && typeof parsed === "object") return JSON.stringify(strip(parsed as Record<string, unknown>));
  } catch {
    return body;
  }
  return body;
}

function removeCompanyWorkspaceFieldsFromBody(body: BodyInit | null | undefined) {
  if (!body || typeof body !== "string" || (!body.includes("workspace_type") && !body.includes("owner_user_id"))) return body;
  try {
    const parsed = JSON.parse(body);
    const strip = (row: Record<string, unknown>) => {
      const next = { ...row };
      delete next.workspace_type;
      delete next.owner_user_id;
      return next;
    };
    if (Array.isArray(parsed)) return JSON.stringify(parsed.map((row) => (row && typeof row === "object" ? strip(row as Record<string, unknown>) : row)));
    if (parsed && typeof parsed === "object") return JSON.stringify(strip(parsed as Record<string, unknown>));
  } catch {
    return body;
  }
  return body;
}

async function appUsersRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await supabaseRequest<T>(path, init);
  } catch (error) {
    const bodyWithoutPasswordHash = removePasswordHashFromBody(init.body);
    if (!isMissingColumnError(error) || bodyWithoutPasswordHash === init.body) throw error;
    return supabaseRequest<T>(path, { ...init, body: bodyWithoutPasswordHash });
  }
}

async function companiesRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await supabaseRequest<T>(path, init);
  } catch (error) {
    const bodyWithoutWorkspaceFields = removeCompanyWorkspaceFieldsFromBody(init.body);
    if (!isMissingColumnError(error) || bodyWithoutWorkspaceFields === init.body) throw error;
    return supabaseRequest<T>(path, { ...init, body: bodyWithoutWorkspaceFields });
  }
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

/**
 * 2026-08-26 보안 수정: 관리자 계정 설정 화면은 항상 현재 값(이미 해시되어 있을 수 있음)을 폼에
 * 채워서 그대로 다시 제출하므로, 실제로 값이 바뀐 경우에만 새 비밀번호를 해시합니다. 값이 그대로면
 * 해시를 또 해시하는 사고를 막기 위해 기존 저장값을 그대로 유지합니다.
 */
async function resolvePasswordForStorage(nextValue: string | undefined, currentStoredValue: string): Promise<string> {
  if (!nextValue || nextValue === currentStoredValue) return currentStoredValue;
  return hashPassword(nextValue);
}

export async function upsertAuthCredentials(input: Partial<AuthCredentials>, auditContext: AuditActorContext = {}): Promise<{ credentials: AuthCredentials; persisted: boolean }> {
  const fallback = await getAuthCredentials();
  const credentials: AuthCredentials = {
    adminEmail: input.adminEmail?.trim() || fallback.adminEmail,
    adminPassword: await resolvePasswordForStorage(input.adminPassword, fallback.adminPassword),
    customerEmail: input.customerEmail?.trim() || fallback.customerEmail,
    customerPassword: await resolvePasswordForStorage(input.customerPassword, fallback.customerPassword),
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
  const fallback = getFallbackAuthCredentials();

  function fallbackCustomerCredentials(): CustomerLoginCredentials | null {
    if (fallback.customerEmail.toLowerCase() !== normalizedEmail) return null;
    return {
      ...fallback,
      companyStatus: "fallback",
      companyName: "마주식자재",
      credentialSource: "fallback",
      ownerName: "정두영"
    };
  }

  if (!isProductionStoreConfigured()) {
    return fallbackCustomerCredentials();
  }

  try {
    const userRows = await supabaseRequest<
      Array<{
        email: string | null;
        id: string;
        name: string | null;
        password_hash: string | null;
        status: string | null;
      }>
    >(`app_users?select=id,email,name,password_hash,status&email=eq.${encodeURIComponent(normalizedEmail)}&limit=1`).catch((error) => {
      if (isMissingColumnError(error)) return [];
      throw error;
    });

    const user = userRows[0];
    if (user?.password_hash && user.status !== "inactive") {
      const memberRows = await supabaseRequest<
        Array<{
          company_id: string;
          role: StaffInvitation["role"] | "owner" | "member";
          status: string | null;
        }>
      >(
        `company_members?select=company_id,role,status&user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&order=created_at.asc&limit=1`
      ).catch(() => []);
      const member = memberRows[0];
      if (member?.company_id) {
        const company = await getCompanySettings(member.company_id, "고객사").catch(() => null);
        return {
          adminEmail: fallback.adminEmail,
          adminPassword: fallback.adminPassword,
          customerEmail: user.email || normalizedEmail,
          customerPassword: user.password_hash,
          customerCompanyId: member.company_id,
          companyStatus: company?.status,
          companyName: company?.name || "고객사",
          credentialSource: "app_users",
          ownerName: user.name || company?.ownerName,
          userId: user.id,
          userStatus: user.status || "active",
          workspaceRole: member.role || "member"
        };
      }
    }

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
    if (!row?.customer_email || !row.customer_company_id) return fallbackCustomerCredentials();

    const company = await getCompanySettings(row.customer_company_id, "고객사").catch(() => null);

    return {
      adminEmail: row.admin_email || fallback.adminEmail,
      adminPassword: row.admin_password || fallback.adminPassword,
      customerEmail: row.customer_email,
      customerPassword: row.customer_password || fallback.customerPassword,
      customerCompanyId: row.customer_company_id,
      updatedAt: row.updated_at || undefined,
      companyStatus: company?.status,
      companyName: company?.name || "고객사",
      credentialSource: "auth_credentials",
      ownerName: company?.ownerName
    };
  } catch (error) {
    console.error("Customer credential lookup fallback:", error);
    return fallbackCustomerCredentials();
  }
}

export async function updateCustomerUserLastLogin(userId: string, provider = "password"): Promise<void> {
  if (!userId || !isProductionStoreConfigured()) return;
  await supabaseRequest(`app_users?id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      last_auth_provider: provider,
      last_login_at: new Date().toISOString()
    })
  }).catch(() => null);
}

export type CustomerWorkspaceSummary = {
  companyId: string;
  companyName: string;
  memberId: string;
  role: StaffInvitation["role"] | "owner" | "member";
  status: string;
  workspaceType: "personal" | "company";
};

export async function getCustomerWorkspaces(input: { email?: string; userId?: string }): Promise<CustomerWorkspaceSummary[]> {
  if (!isProductionStoreConfigured()) return [];

  let userId = input.userId || "";
  const email = input.email?.trim().toLowerCase() || "";
  if (!userId && email) {
    const userRows = await supabaseRequest<Array<{ id: string }>>(
      `app_users?select=id&email=eq.${encodeURIComponent(email)}&limit=1`
    ).catch(() => []);
    userId = userRows[0]?.id || "";
  }
  if (!userId) return [];

  const memberRows = await supabaseRequest<
    Array<{
      company_id: string;
      id: string;
      role: StaffInvitation["role"] | "owner" | "member";
      status: string | null;
    }>
  >(`company_members?select=id,company_id,role,status&user_id=eq.${encodeURIComponent(userId)}&status=eq.active&order=created_at.asc`).catch(() => []);

  const workspaces = await Promise.all(
    memberRows.map(async (member) => {
      const company = await getCompanySettings(member.company_id, "워크스페이스").catch(() => null);
      return {
        companyId: member.company_id,
        companyName: company?.name || "워크스페이스",
        memberId: member.id,
        role: member.role || "member",
        status: member.status || "active",
        workspaceType: company?.workspaceType || (company?.businessType === "personal" ? ("personal" as const) : ("company" as const))
      };
    })
  );

  return workspaces.filter((workspace) => workspace.status === "active");
}

/**
 * 2026-08-26 보안 수정: 로그인 시점에 평문으로 저장돼 있던 비밀번호를 해시로 즉시 전환(레이지
 * 마이그레이션)하기 위한 전용 함수입니다. lib/auth.ts의 validateAdminCredentials에서만 호출합니다.
 */
export async function updateAdminPasswordHash(passwordHash: string): Promise<void> {
  if (!isProductionStoreConfigured()) return;
  await supabaseRequest(`auth_credentials?id=eq.${encodeURIComponent(AUTH_CREDENTIALS_ID)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ admin_password: passwordHash, updated_at: new Date().toISOString() })
  }).catch(() => null);
}

/** 위와 동일한 목적으로, lib/auth.ts의 validateCustomerCredentials에서만 호출합니다. */
export async function updateCustomerPasswordHash(email: string, passwordHash: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !isProductionStoreConfigured()) return;
  await supabaseRequest(`auth_credentials?customer_email=eq.${encodeURIComponent(normalizedEmail)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ customer_password: passwordHash, updated_at: new Date().toISOString() })
  }).catch(() => null);
}

const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type PasswordResetRequestResult = {
  token: string;
  companyName: string;
  ownerName: string;
  // 2026-09-02 피드백: "이메일 발송 말고 더 쉬운 방법 없어?" — Resend 이메일 발송은 별도 가입이
  // 필요해 관리자가 고객 비밀번호를 직접 입력해주는 방법을 대안으로 제안했더니 "보안 문제가
  // 있어서" 반려됨(본인 확인 없이 관리자가 비밀번호를 알게 되는 구조라 타당한 지적). 대신 이미
  // 붙어 있는 텔레그램 알림 인프라(회사 설정의 telegram_chat_id, lib/telegram.ts)를 재사용해
  // 재설정 링크를 보낼 수 있도록 회사의 telegram_chat_id를 함께 반환합니다 — 새 서비스 가입 없이,
  // 그리고 여전히 "그 채널에 접근 가능한 사람만 재설정 가능"한 본인확인 구조를 유지합니다.
  telegramChatId?: string;
} | null;

/**
 * 2026-08-26(P1 "비밀번호 찾기"): 이메일로 가입된 고객 계정을 찾아 재설정 토큰을 발급합니다.
 * 실제 이메일 발송은 호출부(app/api/auth/forgot-password)의 역할이고, 여기서는 토큰 발급·저장까지만
 * 담당합니다. 이메일이 가입되어 있지 않아도 호출부는 항상 같은 안내 문구를 보여줘야 하므로,
 * 이 함수는 존재 여부를 그대로 반환합니다 — null이면 "가입된 계정 없음"이지 오류가 아닙니다.
 */
export async function createPasswordResetRequest(email: string): Promise<PasswordResetRequestResult> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !isProductionStoreConfigured()) return null;

  const rows = await supabaseRequest<Array<{ id: string; customer_company_id: string | null }>>(
    `auth_credentials?select=id,customer_company_id&customer_email=eq.${encodeURIComponent(normalizedEmail)}&limit=1`
  ).catch(() => []);
  const row = rows[0];
  if (!row) return null;

  const company = row.customer_company_id ? await getCompanySettings(row.customer_company_id).catch(() => null) : null;
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS).toISOString();

  await supabaseRequest(`auth_credentials?id=eq.${encodeURIComponent(row.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      reset_token_hash: hashResetToken(token),
      reset_token_expires_at: expiresAt,
      updated_at: new Date().toISOString()
    })
  });

  return {
    token,
    companyName: company?.name || "고객사",
    ownerName: company?.ownerName || "",
    telegramChatId: company?.telegramChatId
  };
}

export type PasswordResetConsumeResult = { ok: boolean; message?: string };

/** 재설정 토큰을 검증하고, 유효하면 새 비밀번호를 해시로 저장한 뒤 토큰을 즉시 무효화합니다. */
export async function consumePasswordReset(token: string, newPassword: string): Promise<PasswordResetConsumeResult> {
  const trimmedToken = token.trim();
  if (!trimmedToken) return { ok: false, message: "재설정 링크가 올바르지 않습니다." };
  if (!newPassword || newPassword.length < 8) return { ok: false, message: "비밀번호는 8자 이상이어야 합니다." };
  if (!isProductionStoreConfigured()) return { ok: false, message: "데이터베이스가 연결되어 있지 않습니다." };

  const tokenHash = hashResetToken(trimmedToken);
  const rows = await supabaseRequest<Array<{ id: string; reset_token_hash: string | null; reset_token_expires_at: string | null }>>(
    `auth_credentials?select=id,reset_token_hash,reset_token_expires_at&reset_token_hash=eq.${encodeURIComponent(tokenHash)}&limit=1`
  ).catch(() => []);
  const row = rows[0];
  if (!row?.reset_token_hash) return { ok: false, message: "재설정 링크가 만료되었거나 이미 사용되었습니다." };

  const storedBuffer = Buffer.from(row.reset_token_hash);
  const providedBuffer = Buffer.from(tokenHash);
  if (storedBuffer.length !== providedBuffer.length || !timingSafeEqual(storedBuffer, providedBuffer)) {
    return { ok: false, message: "재설정 링크가 올바르지 않습니다." };
  }

  if (!row.reset_token_expires_at || new Date(row.reset_token_expires_at).getTime() < Date.now()) {
    return { ok: false, message: "재설정 링크가 만료되었습니다. 비밀번호 찾기를 다시 요청해주세요." };
  }

  const passwordHash = await hashPassword(newPassword);
  await supabaseRequest(`auth_credentials?id=eq.${encodeURIComponent(row.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      customer_password: passwordHash,
      reset_token_hash: null,
      reset_token_expires_at: null,
      updated_at: new Date().toISOString()
    })
  });

  return { ok: true };
}

export async function getManagedCompanyAccounts(): Promise<{ companies: ManagedCompanyAccount[]; source: "empty" | "supabase" }> {
  if (!isProductionStoreConfigured()) {
    return {
      source: "empty",
      companies: []
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
      source: "empty",
      companies: []
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

  const duplicateCredentialRows = await supabaseRequest<Array<{ customer_company_id: string | null }>>(
    `auth_credentials?select=customer_company_id&customer_email=eq.${encodeURIComponent(customerEmail)}`
  ).catch(() => []);
  if (duplicateCredentialRows.some((row) => row.customer_company_id && row.customer_company_id !== companyId)) {
    throw new Error("이미 다른 고객사에서 사용 중인 이메일입니다.");
  }

  // 2026-08-26 보안 수정: 고객사 관리 화면은 항상 현재 비밀번호(해시일 수 있음)를 폼에 채워 그대로
  // 다시 제출하므로, getManagedCompanyAccounts()와 동일하게 customer_company_id로 기존 값을 찾아
  // 실제로 값이 바뀐 경우에만 새 비밀번호를 해시합니다.
  const existingCredentialRows = !isNewCompany
    ? await supabaseRequest<Array<{ customer_password: string | null }>>(
        `auth_credentials?select=customer_password&customer_company_id=eq.${encodeURIComponent(companyId)}&limit=1`
      ).catch(() => [])
    : [];
  const customerPasswordToStore = await resolvePasswordForStorage(input.customerPassword, existingCredentialRows[0]?.customer_password || "");

  const companyRows = await companiesRequest<
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
        workspace_type: "company",
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
        customer_password: customerPasswordToStore,
        updated_at: now
      }
    ])
  });

  const existingUserRows = await supabaseRequest<Array<{ id: string }>>(
    `app_users?select=id&email=eq.${encodeURIComponent(customerEmail)}&limit=1`
  ).catch(() => []);
  const ownerUserId = existingUserRows[0]?.id || globalThis.crypto.randomUUID();
  if (existingUserRows[0]?.id) {
    await appUsersRequest(`app_users?id=eq.${encodeURIComponent(ownerUserId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        name: input.ownerName?.trim() || companyName,
        password_hash: customerPasswordToStore,
        role: "customer_owner",
        auth_provider: "password",
        status: input.status || "active"
      })
    });
  } else {
    await appUsersRequest("app_users", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([
        {
          id: ownerUserId,
          email: customerEmail,
          name: input.ownerName?.trim() || companyName,
          password_hash: customerPasswordToStore,
          role: "customer_owner",
          auth_provider: "password",
          status: input.status || "active"
        }
      ])
    });
  }

  const existingMemberRows = await supabaseRequest<Array<{ id: string }>>(
    `company_members?select=id&company_id=eq.${encodeURIComponent(companyId)}&user_id=eq.${encodeURIComponent(ownerUserId)}&limit=1`
  ).catch(() => []);
  if (existingMemberRows[0]?.id) {
    await supabaseRequest(`company_members?id=eq.${encodeURIComponent(existingMemberRows[0].id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        role: "owner",
        status: "active",
        invited_email: customerEmail,
        updated_at: now
      })
    });
  } else {
    await supabaseRequest("company_members", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([
        {
          company_id: companyId,
          user_id: ownerUserId,
          role: "owner",
          status: "active",
          invited_email: customerEmail,
          updated_at: now
        }
      ])
    });
  }

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

export type CompanySignupInput = {
  companyName: string;
  businessRegistrationNumber: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  termsAgreed: boolean;
  privacyAgreed: boolean;
};
export type CompanySignupResult = {
  companyId: string;
  companyName: string;
  email: string;
  name: string;
  userId?: string;
};

// 2026-08-26: 회사가 관리자 도움 없이 스스로 가입하는 플로우(P0-3)입니다. 사업자등록번호로
// 중복 가입을 막고(P0-4), 약관·개인정보처리방침 동의를 서버에서도 강제합니다(P0-5). 관리자용
// upsertManagedCompanyAccount와는 의도적으로 분리했습니다 — 그쪽은 MAJU 운영자가 이미 신뢰된
// 값을 입력하는 화면이라 사업자번호·약관 동의가 필수가 아니고, 여기서 필수 검증을 새로 걸면
// 기존 관리자 화면에 회귀 위험이 생깁니다.
export async function createCompanySignup(input: CompanySignupInput): Promise<CompanySignupResult> {
  const companyName = input.companyName.trim();
  const businessRegistrationNumber = normalizeBusinessNumber(input.businessRegistrationNumber || "");
  const ownerName = input.ownerName.trim();
  const ownerEmail = input.ownerEmail.trim().toLowerCase();

  if (!companyName) throw new Error("회사명을 입력해주세요.");
  if (businessRegistrationNumber.length !== 10) throw new Error("사업자등록번호 10자리를 정확히 입력해주세요.");
  if (!isValidBusinessRegistrationNumber(businessRegistrationNumber)) throw new Error("사업자등록번호가 올바르지 않습니다. 다시 확인해주세요.");
  if (!ownerName) throw new Error("담당자명을 입력해주세요.");
  if (!ownerEmail || !ownerEmail.includes("@")) throw new Error("올바른 이메일을 입력해주세요.");
  if (!input.ownerPassword || input.ownerPassword.length < 8) throw new Error("비밀번호는 8자 이상이어야 합니다.");
  if (!input.termsAgreed || !input.privacyAgreed) throw new Error("이용약관과 개인정보처리방침에 모두 동의해야 가입할 수 있습니다.");

  if (!isProductionStoreConfigured()) {
    return {
      companyId: globalThis.crypto.randomUUID(),
      companyName,
      email: ownerEmail,
      name: ownerName,
      userId: undefined
    };
  }

  const existingByNumber = await supabaseRequest<Array<{ id: string }>>(
    `companies?select=id&business_registration_number=eq.${encodeURIComponent(businessRegistrationNumber)}&limit=1`
  ).catch(() => []);
  if (existingByNumber.length > 0) {
    throw new Error("이미 가입된 사업자등록번호입니다. 회사 관리자에게 직원 초대를 요청해주세요.");
  }

  const existingByEmail = await supabaseRequest<Array<{ id: string }>>(
    `auth_credentials?select=id&customer_email=eq.${encodeURIComponent(ownerEmail)}&limit=1`
  ).catch(() => []);
  if (existingByEmail.length > 0) {
    throw new Error("이미 사용 중인 이메일입니다.");
  }
  const existingUserByEmail = await supabaseRequest<Array<{ id: string }>>(
    `app_users?select=id&email=eq.${encodeURIComponent(ownerEmail)}&limit=1`
  ).catch(() => []);
  if (existingUserByEmail.length > 0) {
    throw new Error("이미 사용 중인 이메일입니다.");
  }

  const companyId = globalThis.crypto.randomUUID();
  const ownerUserId = globalThis.crypto.randomUUID();
  const now = new Date().toISOString();
  const adminCredentials = await getAuthCredentials();

  let companyRows: Array<{ id: string; name: string }>;
  try {
    companyRows = await companiesRequest<Array<{ id: string; name: string }>>("companies", {
      method: "POST",
      body: JSON.stringify([
        {
          id: companyId,
          name: companyName,
          business_registration_number: businessRegistrationNumber,
          owner_name: ownerName,
          status: "active",
          terms_agreed_at: now,
          privacy_agreed_at: now,
          workspace_type: "company",
          updated_at: now
        }
      ])
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("companies_business_registration_number_unique") || message.includes("duplicate key")) {
      throw new Error("이미 가입된 사업자등록번호입니다. 회사 관리자에게 직원 초대를 요청해주세요.");
    }
    throw error;
  }

  const company = companyRows[0];
  const customerPasswordHash = await hashPassword(input.ownerPassword);

  await supabaseRequest("auth_credentials", {
    method: "POST",
    headers: {
      Prefer: "return=minimal"
    },
    body: JSON.stringify([
      {
        id: companyId,
        admin_email: adminCredentials.adminEmail,
        admin_password: adminCredentials.adminPassword,
        customer_company_id: companyId,
        customer_email: ownerEmail,
        customer_password: customerPasswordHash,
        updated_at: now
      }
    ])
  });

  await appUsersRequest("app_users", {
    method: "POST",
    headers: {
      Prefer: "return=minimal"
    },
    body: JSON.stringify([
      {
        id: ownerUserId,
        email: ownerEmail,
        name: ownerName,
        password_hash: customerPasswordHash,
        role: "customer_owner",
        auth_provider: "password",
        status: "active",
        last_login_at: now
      }
    ])
  });

  await supabaseRequest("company_members", {
    method: "POST",
    headers: {
      Prefer: "return=minimal"
    },
    body: JSON.stringify([
      {
        company_id: company.id,
        user_id: ownerUserId,
        role: "owner",
        status: "active",
        invited_email: ownerEmail,
        updated_at: now
      }
    ])
  });

  await writeAdminAuditLog({
    companyId: company.id,
    action: "company_self_signup",
    targetType: "company",
    targetId: company.id,
    metadata: {
      actorName: ownerName,
      actorRole: "self_signup",
      companyName: company.name
    }
  }).catch(() => null);

  return {
    companyId: company.id,
    companyName: company.name,
    email: ownerEmail,
    name: ownerName,
    userId: ownerUserId
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

/** 초대 코드 없이도 바로 로그인 가능한 임시 비밀번호를 생성합니다(사람이 옮겨 적기 쉬운 문자만 사용). */
function generateTemporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  let password = "";
  for (let i = 0; i < bytes.length; i += 1) {
    password += alphabet[bytes[i] % alphabet.length];
  }
  return password;
}

/**
 * 2026-08-30: MAJU 대표(관리자)가 고객사 직원의 카카오 가입 완료를 기다리지 않고, 그 자리에서
 * 바로 로그인 가능한 이메일+임시 비밀번호 계정을 만들어줄 수 있도록 합니다. createStaffInvitation과
 * 달리 app_users/company_members 행을 즉시 생성하며, 반환된 temporaryPassword는 이 응답에만
 * 평문으로 담기고 저장소에는 해시로만 남습니다 — 관리자가 화면에서 복사해 직원에게 안전하게
 * 전달해야 합니다.
 */
export async function createStaffAccountDirect(input: DirectStaffAccountInput, auditContext: AuditActorContext = {}): Promise<DirectStaffAccountResult> {
  const companyId = input.companyId;
  const employeeName = input.employeeName?.trim();
  const employeePhone = input.employeePhone?.trim() || "";
  const role = input.role || "driver";
  const temporaryPassword = generateTemporaryPassword();

  if (!companyId) throw new Error("고객사 ID가 필요합니다.");
  if (!employeeName) throw new Error("직원 이름을 입력해주세요.");

  const requestedEmail = input.employeeEmail?.trim().toLowerCase();
  if (requestedEmail && !requestedEmail.includes("@")) throw new Error("올바른 이메일을 입력해주세요.");
  const email = requestedEmail || `staff-${randomBytes(4).toString("hex")}@maju.local`;

  if (!isProductionStoreConfigured()) {
    return {
      persisted: false,
      companyId,
      companyName: "고객사",
      name: employeeName,
      email,
      temporaryPassword,
      role
    };
  }

  const existingByEmail = await supabaseRequest<Array<{ id: string }>>(
    `app_users?select=id&email=eq.${encodeURIComponent(email)}&limit=1`
  ).catch(() => []);
  if (existingByEmail.length > 0) {
    throw new Error("이미 사용 중인 이메일입니다. 다른 이메일을 입력해주세요.");
  }

  const company = await getCompanySettings(companyId, "고객사").catch(() => null);
  const passwordHash = await hashPassword(temporaryPassword);
  const userId = globalThis.crypto.randomUUID();
  const now = new Date().toISOString();

  await appUsersRequest("app_users", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([
      {
        id: userId,
        email,
        name: employeeName,
        phone: employeePhone || null,
        password_hash: passwordHash,
        role: "customer_member",
        auth_provider: "password",
        status: "active",
        last_login_at: null
      }
    ])
  });

  await supabaseRequest("company_members", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([
      {
        company_id: companyId,
        user_id: userId,
        role,
        status: "active",
        invited_email: email,
        updated_at: now
      }
    ])
  });

  await writeAdminAuditLog({
    companyId,
    action: "staff_account_created_direct",
    targetType: "staff_account",
    targetId: userId,
    metadata: {
      actorName: auditContext.actorName || "시스템",
      actorRole: auditContext.actorRole || "unknown",
      employeeName,
      hasEmployeePhone: Boolean(employeePhone),
      role,
      usedProvidedEmail: Boolean(requestedEmail)
    }
  }).catch(() => null);

  return {
    persisted: true,
    userId,
    companyId,
    companyName: company?.name || "고객사",
    name: employeeName,
    email,
    temporaryPassword,
    role
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
      userId: undefined,
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
  await upsertAuthIdentity({ email: user.email || loginEmail, provider: "kakao", providerUserId: kakaoUserId, userId: user.id });
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
    userId: user.id,
    workspaceRole: invitation.role || "member"
  };
}

export async function getStaffInvitationPreview(inviteCode: string): Promise<StaffInvitationPreview | null> {
  const normalizedInviteCode = inviteCode.trim();
  if (!normalizedInviteCode) return null;

  if (!isProductionStoreConfigured()) {
    const companyId = getDefaultCompanyId();
    const company = await getCompanySettings(companyId).catch(() => null);
    return {
      companyId,
      companyName: company?.name || "마주식자재",
      employeeName: "모바일 직원",
      role: "driver",
      status: "pending"
    };
  }

  const rows = await staffStoreRequest(supabaseRequest<
    Array<{
      company_id: string;
      employee_name: string | null;
      role: StaffInvitation["role"];
      status: StaffInvitation["status"];
    }>
  >(`staff_invitations?select=company_id,employee_name,role,status&invite_code=eq.${encodeURIComponent(normalizedInviteCode)}&limit=1`));

  const invitation = rows[0];
  if (!invitation) return null;
  const company = await getCompanySettings(invitation.company_id).catch(() => null);
  return {
    companyId: invitation.company_id,
    companyName: company?.name || "회사 워크스페이스",
    employeeName: invitation.employee_name || "모바일 직원",
    role: invitation.role || "member",
    status: invitation.status
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
      userId: undefined,
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
  await upsertAuthIdentity({ email: user.email || loginEmail, provider: "kakao", providerUserId: kakaoUserId, userId: user.id });
  const existingMemberships = await supabaseRequest<
    Array<{
      company_id: string;
      role: StaffInvitation["role"] | "owner" | "member";
      companies: { business_type: string | null; name: string } | null;
    }>
  >(`company_members?select=company_id,role,companies(name,business_type)&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.asc&limit=1`).catch(() => []);

  const existing = existingMemberships[0];
  if (existing?.company_id) {
    // 이미 초대를 수락해 회사에 소속된 직원이 재로그인하는 경우입니다.
    // 초대 코드 없이 다시 로그인해도 실제 직책(배송기사/영업직원 등)을 유지해야
    // PC 대시보드에서도 올바른 역할로 표시되고, 향후 역할별 권한 제한을 켜도 안전합니다.
    return {
      companyId: existing.company_id,
      companyName: existing.companies?.name || `${displayName} 워크스페이스`,
      email: user.email || loginEmail,
      name: user.name || displayName,
      persisted: true,
      userId: user.id,
      workspaceRole: existing.role || "owner"
    };
  }

  const companyRows = await companiesRequest<Array<{ id: string; name: string }>>("companies", {
    method: "POST",
    body: JSON.stringify([
      {
        business_type: "personal",
        name: `${displayName} 워크스페이스`,
        owner_name: displayName,
        status: "active",
        workspace_type: "personal",
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
    userId: user.id,
    workspaceRole: "owner"
  };
}

// 네이버/구글 로그인은 카카오와 동일한 초대 수락 절차를 따르므로, 컬럼명(예: naver_user_id)만
// 프로바이더별로 바꿔가며 같은 로직을 공유합니다. 카카오 전용 함수는 이미 검증되어 운영 중이라
// 회귀 위험을 피하기 위해 그대로 두고, 신규 프로바이더만 이 공용 함수를 사용합니다.
export async function acceptStaffOAuthInvitation(input: StaffOAuthAcceptInput): Promise<StaffKakaoAcceptResult> {
  const inviteCode = input.inviteCode.trim();
  const providerUserId = input.providerUserId.trim();
  const providerColumn = `${input.provider}_user_id`;
  if (!inviteCode) throw new Error("초대 코드가 필요합니다.");
  if (!providerUserId) throw new Error("소셜 계정 확인이 필요합니다.");

  if (!isProductionStoreConfigured()) {
    const companyId = getDefaultCompanyId();
    const company = await getCompanySettings(companyId).catch(() => null);
    return {
      companyId,
      companyName: company?.name || "마주식자재",
      email: input.email || `${input.provider}-${providerUserId}@maju.local`,
      name: input.name || "모바일 직원",
      persisted: false,
      userId: undefined,
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
  const loginEmail = input.email || `${input.provider}-${providerUserId}@maju.local`;
  const now = new Date().toISOString();

  const userRows = await supabaseRequest<Array<{ id: string; email: string | null; name: string }>>(`app_users?on_conflict=${providerColumn}`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([
      {
        auth_provider: input.provider,
        avatar_url: input.avatarUrl || null,
        email: loginEmail,
        [providerColumn]: providerUserId,
        last_login_at: now,
        name: displayName,
        phone: invitation.employee_phone || null,
        role: "customer_member",
        status: "active"
      }
    ])
  });

  const user = userRows[0];
  await upsertAuthIdentity({ email: user.email || loginEmail, provider: input.provider, providerUserId, userId: user.id });
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
    userId: user.id,
    workspaceRole: invitation.role || "member"
  };
}

export async function createPersonalOAuthWorkspace(input: PersonalOAuthWorkspaceInput): Promise<PersonalKakaoWorkspaceResult> {
  const providerUserId = input.providerUserId.trim();
  const providerColumn = `${input.provider}_user_id`;
  if (!providerUserId) throw new Error("소셜 계정 확인이 필요합니다.");

  const displayName = input.name || "개인 사용자";
  const loginEmail = input.email || `${input.provider}-${providerUserId}@maju.local`;

  if (!isProductionStoreConfigured()) {
    const companyId = getDefaultCompanyId();
    return {
      companyId,
      companyName: `${displayName} 워크스페이스`,
      email: loginEmail,
      name: displayName,
      persisted: false,
      userId: undefined,
      workspaceRole: "owner"
    };
  }

  const now = new Date().toISOString();
  const userRows = await supabaseRequest<Array<{ id: string; email: string | null; name: string }>>(`app_users?on_conflict=${providerColumn}`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([
      {
        auth_provider: input.provider,
        avatar_url: input.avatarUrl || null,
        email: loginEmail,
        [providerColumn]: providerUserId,
        last_login_at: now,
        name: displayName,
        role: "customer_user",
        status: "active"
      }
    ])
  });

  const user = userRows[0];
  await upsertAuthIdentity({ email: user.email || loginEmail, provider: input.provider, providerUserId, userId: user.id });
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
      userId: user.id,
      workspaceRole: existing.role || "owner"
    };
  }

  const companyRows = await companiesRequest<Array<{ id: string; name: string }>>("companies", {
    method: "POST",
    body: JSON.stringify([
      {
        business_type: "personal",
        name: `${displayName} 워크스페이스`,
        owner_name: displayName,
        status: "active",
        workspace_type: "personal",
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
    userId: user.id,
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

function toStaffVehicleLocation(row: {
  current_customer_id?: string | null;
  delivery_vehicle?: string | null;
  driver_name?: string | null;
  id: string;
  last_accuracy_m?: number | string | null;
  last_lat?: number | string | null;
  last_lng?: number | string | null;
  last_location_at?: string | null;
  last_seen_at?: string | null;
  location_status?: string | null;
  user_id: string;
}): StaffVehicleLocation | null {
  const lat = Number(row.last_lat);
  const lng = Number(row.last_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const lastLocationAt = row.last_location_at || undefined;
  const staleMs = lastLocationAt ? Date.now() - new Date(lastLocationAt).getTime() : Number.POSITIVE_INFINITY;
  const isStale = staleMs > 5 * 60 * 1000;
  return {
    accuracyMeters: row.last_accuracy_m === null || row.last_accuracy_m === undefined ? undefined : Number(row.last_accuracy_m),
    currentCustomerId: row.current_customer_id || undefined,
    deliveryVehicle: row.delivery_vehicle || undefined,
    driverName: row.driver_name || "배송기사",
    id: row.id,
    isStale,
    lastLocationAt,
    lastSeenAt: row.last_seen_at || undefined,
    lat,
    lng,
    status: isStale ? "stale" : ((row.location_status || "active") as StaffVehicleLocation["status"]),
    userId: row.user_id
  };
}

export async function upsertStaffMobileLocation(input: StaffMobileLocationInput): Promise<{ location: StaffVehicleLocation | null; persisted: boolean }> {
  if (!input.companyId) throw new Error("고객사 ID가 필요합니다.");
  if (!input.userId) throw new Error("실제 직원 계정으로 로그인해야 위치를 저장할 수 있습니다.");
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) throw new Error("유효한 위치 좌표가 필요합니다.");

  if (!isProductionStoreConfigured()) {
    return {
      location: {
        accuracyMeters: input.accuracyMeters,
        currentCustomerId: input.currentCustomerId,
        deliveryVehicle: input.deliveryVehicle,
        driverName: input.driverName || "배송기사",
        id: input.userId,
        isStale: false,
        lastLocationAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        lat: input.lat,
        lng: input.lng,
        status: input.status || "active",
        userId: input.userId
      },
      persisted: false
    };
  }

  const now = new Date().toISOString();
  try {
    const rows = await supabaseRequest<
      Array<{
        current_customer_id: string | null;
        delivery_vehicle: string | null;
        driver_name: string | null;
        id: string;
        last_accuracy_m: number | string | null;
        last_lat: number | string | null;
        last_lng: number | string | null;
        last_location_at: string | null;
        last_seen_at: string | null;
        location_status: string | null;
        user_id: string;
      }>
    >("staff_mobile_devices?on_conflict=company_id,user_id,platform", {
      method: "POST",
      body: JSON.stringify([
        {
          company_id: input.companyId,
          current_customer_id: input.currentCustomerId || null,
          delivery_vehicle: input.deliveryVehicle || null,
          device_label: input.driverName || "모바일 웹",
          driver_name: input.driverName || null,
          last_accuracy_m: Number.isFinite(input.accuracyMeters) ? input.accuracyMeters : null,
          last_lat: input.lat,
          last_lng: input.lng,
          last_location_at: now,
          last_seen_at: now,
          location_status: input.status || "active",
          platform: "mobile_web",
          user_agent: input.userAgent || null,
          user_id: input.userId
        }
      ])
    });
    const location = toStaffVehicleLocation(rows[0]) || null;
    if (location) {
      await supabaseRequest("staff_location_events", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify([
          {
            accuracy_m: Number.isFinite(input.accuracyMeters) ? input.accuracyMeters : null,
            company_id: input.companyId,
            current_customer_id: input.currentCustomerId || null,
            delivery_vehicle: input.deliveryVehicle || null,
            device_id: location.id,
            driver_name: input.driverName || null,
            latitude: input.lat,
            longitude: input.lng,
            recorded_at: now,
            user_id: input.userId
          }
        ])
      }).catch((eventError) => {
        if (isMissingStaffMobileLocationSchemaError(eventError)) return null;
        throw eventError;
      });
    }
    return { location, persisted: true };
  } catch (error) {
    if (isMissingStaffMobileLocationSchemaError(error)) {
      throw new Error("모바일 위치 저장 컬럼이 없습니다. Supabase SQL Editor에서 supabase/migrations/20260901_staff_mobile_location.sql 파일 내용을 실행한 뒤 다시 시도하세요.");
    }
    throw error;
  }
}

export async function getStaffVehicleLocations(companyId?: string): Promise<StaffVehicleLocation[]> {
  if (!companyId || !isProductionStoreConfigured()) return [];
  try {
    const rows = await supabaseRequest<
      Array<{
        current_customer_id: string | null;
        delivery_vehicle: string | null;
        driver_name: string | null;
        id: string;
        last_accuracy_m: number | string | null;
        last_lat: number | string | null;
        last_lng: number | string | null;
        last_location_at: string | null;
        last_seen_at: string | null;
        location_status: string | null;
        user_id: string;
      }>
    >(
      `staff_mobile_devices?select=id,user_id,driver_name,delivery_vehicle,last_lat,last_lng,last_accuracy_m,last_location_at,last_seen_at,location_status,current_customer_id&company_id=eq.${encodeURIComponent(
        companyId
      )}&not.last_lat=is.null&not.last_lng=is.null&order=last_location_at.desc&limit=100`
    );
    return rows.map(toStaffVehicleLocation).filter((location): location is StaffVehicleLocation => Boolean(location));
  } catch (error) {
    if (isMissingStaffMobileLocationSchemaError(error)) return [];
    throw error;
  }
}

export async function getStaffLocationEvents(companyId?: string, options: { hours?: number; userId?: string } = {}): Promise<StaffLocationEvent[]> {
  if (!companyId || !isProductionStoreConfigured()) return [];
  const since = new Date(Date.now() - Math.max(1, options.hours || 12) * 60 * 60 * 1000).toISOString();
  const userFilter = options.userId ? `&user_id=eq.${encodeURIComponent(options.userId)}` : "";
  try {
    const rows = await supabaseRequest<
      Array<{
        accuracy_m: number | string | null;
        current_customer_id: string | null;
        delivery_vehicle: string | null;
        driver_name: string | null;
        id: string;
        latitude: number | string;
        longitude: number | string;
        recorded_at: string;
        user_id: string;
      }>
    >(
      `staff_location_events?select=id,user_id,driver_name,delivery_vehicle,latitude,longitude,accuracy_m,recorded_at,current_customer_id&company_id=eq.${encodeURIComponent(
        companyId
      )}&recorded_at=gte.${encodeURIComponent(since)}${userFilter}&order=recorded_at.asc&limit=3000`
    );
    return rows
      .map((row) => ({
        accuracyMeters: row.accuracy_m === null || row.accuracy_m === undefined ? undefined : Number(row.accuracy_m),
        currentCustomerId: row.current_customer_id || undefined,
        deliveryVehicle: row.delivery_vehicle || undefined,
        driverName: row.driver_name || "배송기사",
        id: row.id,
        lat: Number(row.latitude),
        lng: Number(row.longitude),
        recordedAt: row.recorded_at,
        userId: row.user_id
      }))
      .filter((event) => Number.isFinite(event.lat) && Number.isFinite(event.lng));
  } catch (error) {
    if (isMissingStaffMobileLocationSchemaError(error)) return [];
    throw error;
  }
}

export async function getDeliveryCompletionEvents(
  companyId?: string,
  options: { deliveryVehicle?: string; driverName?: string; hours?: number } = {}
): Promise<DeliveryCompletionEvent[]> {
  if (!companyId || !isProductionStoreConfigured()) return [];
  const since = new Date(Date.now() - Math.max(1, options.hours || 12) * 60 * 60 * 1000).toISOString();
  try {
    const rows = await supabaseRequest<
      Array<{
        created_at: string;
        customer_id: string;
        id: string;
        memo: string;
        next_action: string | null;
      }>
    >(
      `customer_notes?select=id,customer_id,memo,next_action,created_at&company_id=eq.${encodeURIComponent(
        companyId
      )}&note_type=eq.delivery&created_at=gte.${encodeURIComponent(since)}&order=created_at.asc&limit=500`
    );
    if (!rows.length) return [];

    const routePlan = await getTodayRoutePlan(companyId).catch(() => null);
    const routeStops = (routePlan?.groups || []).flatMap((group) => group.stops);
    const stopByCustomerId = new Map(routeStops.map((stop) => [stop.id, stop]));
    const driverName = normalizeComparableText(options.driverName);
    const deliveryVehicle = normalizeComparableText(options.deliveryVehicle);
    const filtered = rows.filter((row) => {
      const stop = stopByCustomerId.get(row.customer_id);
      if (!stop) return !driverName && !deliveryVehicle;
      const stopDriver = normalizeComparableText(stop.deliveryDriver);
      const stopVehicle = normalizeComparableText(stop.deliveryVehicle);
      if (deliveryVehicle && stopVehicle && stopVehicle !== deliveryVehicle) return false;
      if (!deliveryVehicle && driverName && stopDriver && stopDriver !== driverName) return false;
      return true;
    });

    return filtered.map((row, index) => {
      const stop = stopByCustomerId.get(row.customer_id);
      return {
        actualOrder: index + 1,
        completedAt: row.created_at,
        customerId: row.customer_id,
        customerName: stop?.name || "거래처",
        deliveryDriver: stop?.deliveryDriver,
        deliveryVehicle: stop?.deliveryVehicle,
        id: row.id,
        memoSnippet: summarizeDeliveryMemo(row.memo),
        plannedOrder: stop?.order && stop.order < 10000 ? stop.order : undefined,
        statusLabel: extractDeliveryStatus(row.memo)
      };
    });
  } catch {
    return [];
  }
}

function summarizeDeliveryMemo(memo: string) {
  return memo
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => !line.startsWith("배송 상태:") && !line.startsWith("알림 방식:"))
    ?.slice(0, 60);
}

function extractDeliveryStatus(memo: string) {
  const match = memo.match(/배송 상태:\s*([^\n\r]+)/);
  return match?.[1]?.trim();
}

function normalizeComparableText(value?: string | null) {
  return (value || "").trim().replace(/\s+/g, " ").toLowerCase();
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
      { key: "CLOVA_OCR_INVOKE_URL + CLOVA_OCR_SECRET 또는 UPSTAGE_API_KEY", present: ocrConfigured, required: false, scope: "server" },
      { key: "GOV_RESTAURANT_API_KEY", present: isGovRestaurantApiConfigured(), required: false, scope: "server" },
      { key: "SEOUL_OPENDATA_API_KEY", present: isSeoulOpenDataConfigured(), required: false, scope: "server" }
    ],
    services: [
      {
        name: "Supabase Postgres",
        status: supabaseConfigured ? "ready" : "fallback",
        description: supabaseConfigured ? "실서버 저장 모드입니다." : "환경변수가 없어 서버 저장을 확인할 수 없습니다."
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
          description: "환경변수가 없어 서버 조회를 건너뛰었습니다. 서버 환경변수를 등록한 뒤 다시 확인하세요."
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
    countTableRows("ai_reports", "운영 리포트", "회사 운영 리포트 수입니다."),
    countTableRows("lead_recommendations", "추천 리드", "AI Lead Recommendation 결과입니다."),
    countTableRows("visit_results", "방문 결과", "영업 방문/상담 기록입니다."),
    countTableRows("admin_audit_logs", "감사 로그", "데이터 등록/수정 시 남는 관리자 감사 로그입니다."),
    countTableRows("column_mappings", "엑셀 헤더 매핑 이력", "대량 등록 시 저장되는 헤더-필드 매핑 이력입니다."),
    countTableRows("raw_customer_rows", "엑셀 원본 행", "대량 등록 원본 엑셀 행 백업입니다."),
    countTableRows("health_score_snapshots", "건강도 스냅샷", "리포트별 건강도 점수 스냅샷입니다."),
    countTableRows("auth_credentials", "로그인 저장 정보", "관리자/고객 로그인 정보를 관리할 때 사용하는 테이블입니다."),
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
): Promise<{ customers: CustomerMasterItem[]; source: "empty" | "supabase"; truncated: boolean }> {
  const id = companyId || getDefaultCompanyId();
  const offset = Math.max(0, Math.floor(options?.offset || 0));

  if (!isProductionStoreConfigured()) {
    return {
      customers: [],
      source: "empty",
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
    delivery_vehicle?: string | null;
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
    access_method_type?: string | null;
    access_note?: string | null;
    access_password?: string | null;
    business_hours?: string | null;
    menu_summary?: string | null;
    relationship_status?: string | null;
    relationship_status_updated_at?: string | null;
    relationship_status_note?: string | null;
    review_summary?: string | null;
    review_keywords?: string[] | null;
    review_source?: string | null;
    reviews_updated_at?: string | null;
    updated_at?: string | null;
  };
  let rows: CustomerMasterRow[];

  // 가장 완전한 select부터 시도하고, 컬럼이 없다는 에러(42703/does not exist)를 만나면 더 좁은
  // select로 재시도합니다. 어떤 컬럼 이름을 특정해서 매칭하지 않고 "컬럼 없음" 에러 자체를 generic하게
  // 판별하는 이유: PostgREST는 select= 목록을 검증할 때 처음 걸리는 컬럼 하나만 에러 메시지에 담기
  // 때문에, 특정 컬럼 이름으로 좁게 매칭하면 select에 함께 들어있는 다른(더 오래된) 누락 컬럼을
  // 놓치고 상위로 다시 던져버려 정상 동작하던 하위 fallback까지 깨뜨릴 수 있습니다.
  const CUSTOMER_MASTER_SELECT_TIERS = [
    CUSTOMER_MASTER_SELECT_WITH_CONCURRENCY,
    CUSTOMER_MASTER_SELECT_WITH_ACCESS_METHOD,
    CUSTOMER_MASTER_SELECT_WITH_REVIEWS,
    CUSTOMER_MASTER_SELECT_WITH_DELIVERY_VEHICLE,
    CUSTOMER_MASTER_SELECT_WITH_RELATIONSHIP_STATUS,
    CUSTOMER_MASTER_SELECT_WITH_PLACE_LINKS_AND_HOURS_MENU,
    CUSTOMER_MASTER_SELECT_WITH_PLACE_LINKS,
    CUSTOMER_MASTER_SELECT
  ];
  let lastFetchError: unknown;
  let fetched: CustomerMasterRow[] | null = null;
  for (const select of CUSTOMER_MASTER_SELECT_TIERS) {
    try {
      fetched = await supabaseRequest<Array<CustomerMasterRow>>(
        `normalized_customers?select=${select}&company_id=eq.${encodeURIComponent(id)}&order=created_at.desc&limit=${CUSTOMER_MASTER_FETCH_LIMIT}&offset=${offset}`
      );
      break;
    } catch (error) {
      if (!isMissingColumnError(error)) throw error;
      lastFetchError = error;
    }
  }
  if (!fetched) throw lastFetchError instanceof Error ? lastFetchError : new Error(String(lastFetchError));
  rows = fetched;

  return {
    customers: rows.map((row, index) => toCustomerMasterItem(row, offset + index)),
    source: "supabase",
    truncated: rows.length >= CUSTOMER_MASTER_FETCH_LIMIT
  };
}

export type PossibleDuplicateCustomer = { id: string; customerName: string; address: string };

export async function upsertCustomerMaster(
  input: CustomerMasterInput,
  companyId?: string,
  auditContext: CustomerMasterAuditContext = {},
  options: { confirmDuplicate?: boolean } = {}
) {
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
      business_status: input.businessStatus || "확인 필요",
      business_status_checked_at: null,
      customer_name: customerName,
      delivery_km: input.deliveryKm || 0,
      delivery_manager: input.deliveryManager || null,
      delivery_minutes: input.deliveryMinutes || null,
      delivery_vehicle: input.deliveryVehicle || null,
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
      loading_position: input.loadingPosition || null,
      access_method_type: input.accessMethodType || null,
      access_note: input.accessNote || null,
      access_password: input.accessPassword || null,
      business_hours: input.businessHours || null,
      menu_summary: input.menuSummary || null,
      review_summary: input.reviewSummary || null,
      review_keywords: input.reviewKeywords || [],
      review_source: input.reviewSource || null
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
  const rawBusinessNumber = normalizeBusinessNumber(input.businessNumber || "");
  // 2026-08-27 피드백("거래처가 중복되어 있는게 있어") 원인 수정: 사업자번호를 몰라 "0000000000"
  // 같은 자리채움 값을 넣는 경우가 흔한데, 이런 값도 그대로 병합 키로 쓰면 두 가지 문제가 생깁니다.
  // (1) 같은 자리채움 값을 쓴 서로 다른 실제 거래처가 하나의 행으로 잘못 병합되어 데이터가 덮어써지고,
  // (2) 같은 거래처를 한 번은 이 값으로, 한 번은 빈 값(상호명+주소 키)으로 저장하면 서로 다른 키가 되어
  // 중복 행이 생깁니다(실제로 "스타벅스 더북한산점"이 이렇게 두 행으로 나뉘어 있던 것을 확인했습니다).
  // 같은 숫자가 반복되는 값("0000000000", "1111111111" 등)은 실제 사업자번호로 보기 어려우므로,
  // 병합 키 계산에서는 빈 값과 동일하게 취급해 항상 상호명+주소 키로 통일합니다(DB에는 원래 입력값을
  // 그대로 저장하므로 사용자가 나중에 실제 번호로 고칠 수 있습니다).
  const isPlaceholderBusinessNumber = /^(\d)\1{9}$/.test(rawBusinessNumber);
  const businessNumber = isPlaceholderBusinessNumber ? "" : rawBusinessNumber;
  // import 생성과 예외 사업자번호 조회는 서로 의존하지 않으므로 병렬 실행합니다.
  const [importId, exemptBusinessNumbers] = await Promise.all([
    createManualCustomerImport(id),
    businessNumber ? getExemptBusinessNumberSet(id) : Promise.resolve(new Set<string>())
  ]);
  // 종사업자번호 등 중복 허용 목록에 등록된 사업자번호는 상호명+주소 기준 key를 사용해,
  // 같은 사업자번호를 쓰는 다른 거래처가 하나의 레코드로 병합되지 않도록 합니다.
  const normalizedKey =
    businessNumber && !exemptBusinessNumbers.has(businessNumber) ? businessNumber : makeCustomerKey(customerName, input.address || "");
  // updated_at도 함께 읽어 아래 동시 편집 감지(낙관적 동시성 제어)에 사용합니다. 이 컬럼이 아직
  // 없는 환경(마이그레이션 미적용)에서도 나머지 저장 로직이 깨지지 않도록 실패 시 컬럼 없이 재시도합니다.
  const existingRows = await supabaseRequest<Array<{ id: string; updated_at?: string | null }>>(
    `normalized_customers?select=id,updated_at&company_id=eq.${encodeURIComponent(id)}&normalized_key=eq.${encodeURIComponent(normalizedKey)}&limit=1`
  ).catch(() =>
    supabaseRequest<Array<{ id: string; updated_at?: string | null }>>(
      `normalized_customers?select=id&company_id=eq.${encodeURIComponent(id)}&normalized_key=eq.${encodeURIComponent(normalizedKey)}&limit=1`
    ).catch(() => [])
  );
  // 2026-08-27 피드백("중복값 입력되지 않게 만들어줘") 대응: 위 normalized_key가 정확히 일치할 때는
  // 같은 거래처로 보고 그대로 업데이트하면 되지만, 키가 달라 "신규 등록"으로 처리될 상황에서도 상호명이
  // 이미 등록된 다른 거래처와 완전히 같다면(주소 표기가 살짝 달라 키만 갈린 경우 등) 사용자에게 먼저
  // 확인을 받습니다. 확인 없이 그대로 저장하면 같은 거래처가 또 하나 생겨 매출·거래내역이 나뉘어
  // 집계되는 문제가 재발하기 때문입니다. options.confirmDuplicate가 true면(사용자가 이미 확인하고
  // "그래도 등록" 을 선택한 경우) 이 검사를 건너뜁니다.
  if (!existingRows.length && !options.confirmDuplicate) {
    const possibleDuplicates = await supabaseRequest<Array<{ id: string; customer_name: string; address: string | null }>>(
      `normalized_customers?select=id,customer_name,address&company_id=eq.${encodeURIComponent(id)}&customer_name=ilike.${encodeURIComponent(customerName)}&limit=5`
    ).catch(() => []);
    if (possibleDuplicates.length) {
      return {
        customer: fallbackItem,
        persisted: false,
        possibleDuplicate: true,
        duplicateMatches: possibleDuplicates.map((row) => ({ id: row.id, customerName: row.customer_name, address: row.address || "" }))
      };
    }
  }
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
    // 병합 키에는 자리채움 값을 빈 값으로 취급하지만(위 businessNumber 계산 참고), 실제 DB 컬럼에는
    // 사용자가 입력한 원래 값을 그대로 저장합니다 — 나중에 진짜 번호로 고칠 수 있어야 하기 때문입니다.
    business_registration_number: rawBusinessNumber || null,
    business_status: input.businessStatus || "확인 필요",
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
  const hoursMenuFields = {
    business_hours: input.businessHours || null,
    menu_summary: input.menuSummary || null
  };
  const deliveryVehicleField = {
    delivery_vehicle: input.deliveryVehicle || null
  };
  // 리뷰 요약/키워드는 아직 자동 수집 파이프라인이 없어 수동 입력값만 반영합니다.
  // undefined면(즉 이 저장 요청에서 손대지 않은 값이면) 기존 값을 덮어쓰지 않도록 payload에서 뺍니다.
  const reviewFields: Record<string, unknown> = {};
  if (input.reviewSummary !== undefined) reviewFields.review_summary = input.reviewSummary || null;
  if (input.reviewKeywords !== undefined) reviewFields.review_keywords = input.reviewKeywords || [];
  if (input.reviewSource !== undefined) reviewFields.review_source = input.reviewSource || null;
  if (Object.keys(reviewFields).length) reviewFields.reviews_updated_at = new Date().toISOString();
  // 거래처 출입방법/비밀번호(2026-08-24 피드백). undefined면 이 저장 요청에서 손대지 않은 값이므로
  // 기존 값을 덮어쓰지 않도록 payload에서 뺍니다.
  const accessMethodFields: Record<string, unknown> = {};
  if (input.accessMethodType !== undefined) accessMethodFields.access_method_type = input.accessMethodType || null;
  if (input.accessNote !== undefined) accessMethodFields.access_note = input.accessNote || null;
  if (input.accessPassword !== undefined) accessMethodFields.access_password = input.accessPassword || null;
  // 2026-08-31 에러 처리/복원력 감사 후속(동시 편집 감지): 저장할 때마다 updated_at을 현재
  // 시각으로 갱신합니다. updated_at 컬럼이 아직 없는 환경(마이그레이션 미적용)에서도 나머지 저장이
  // 깨지지 않도록, 다른 선택 컬럼들과 마찬가지로 가장 넓은 티어에만 포함시켜 컬럼 없음 에러를
  // 만나면 자동으로 빠지도록 합니다.
  const concurrencyFields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  // 편집 화면이 마지막으로 읽은 updated_at을 함께 보냈고(input.expectedUpdatedAt), 서버가 방금
  // 조회한 기존 행에도 updated_at이 있다면(= 컬럼이 존재하는 환경) 그 사이 다른 사람이 먼저
  // 저장했는지 확인합니다. 둘 중 하나라도 없으면(신규 등록, 레거시 호출부, 마이그레이션 미적용
  // 환경) 검사를 건너뛰고 기존처럼 동작합니다.
  const concurrencyCheck =
    existingRows.length && input.expectedUpdatedAt && existingRows[0].updated_at
      ? { id: existingRows[0].id, expectedUpdatedAt: input.expectedUpdatedAt }
      : undefined;
  // 가장 넓은 페이로드(모든 선택 컬럼 포함)부터 시도하고, "컬럼 없음" 에러를 만나면 그 선택 컬럼
  // 묶음만 제외한 다음 티어로 재시도합니다. 위 getCustomerMaster()의 select 캐스케이드와 동일한
  // 원칙(특정 컬럼 이름을 매칭하지 않고 generic한 42703/does not exist 판별만 사용)을 씁니다.
  const UPSERT_PAYLOAD_TIERS = [
    {
      ...customerPayload,
      ...placeLinks,
      ...hoursMenuFields,
      ...deliveryVehicleField,
      ...reviewFields,
      ...accessMethodFields,
      ...concurrencyFields
    },
    { ...customerPayload, ...placeLinks, ...hoursMenuFields, ...deliveryVehicleField, ...reviewFields, ...accessMethodFields },
    { ...customerPayload, ...placeLinks, ...hoursMenuFields, ...deliveryVehicleField, ...reviewFields },
    { ...customerPayload, ...placeLinks, ...hoursMenuFields, ...deliveryVehicleField },
    { ...customerPayload, ...placeLinks, ...hoursMenuFields },
    { ...customerPayload, ...placeLinks },
    customerPayload
  ];
  let lastUpsertError: unknown;
  let rows: Array<Record<string, unknown>> | null = null;
  for (const payload of UPSERT_PAYLOAD_TIERS) {
    try {
      rows = await upsertNormalizedCustomerWithOptionalPlaceLinks(payload, concurrencyCheck);
      break;
    } catch (error) {
      if (!isMissingColumnError(error)) throw error;
      lastUpsertError = error;
    }
  }
  if (!rows) throw lastUpsertError instanceof Error ? lastUpsertError : new Error(String(lastUpsertError));
  // PATCH가 조건(updated_at=eq.expected)에 맞는 행을 찾지 못했다면(=그 사이 다른 사람이 먼저
  // 저장했다면) rows가 빈 배열로 돌아옵니다. 예외가 아니라 정상 응답이므로 위 컬럼-없음 재시도
  // 루프는 그대로 통과하지만, 저장은 실제로 반영되지 않았으므로 충돌로 보고합니다.
  if (concurrencyCheck && rows.length === 0) {
    return {
      customer: fallbackItem,
      persisted: false,
      conflict: true as const
    };
  }
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

  // 신규 거래처 등록 시 구글 리뷰를 즉시 자동 수집하던 로직은 제거했습니다(2026-08-18) — Places
  // API는 호출당 비용이 발생하는데, 등록만 해두고 한동안 열어보지 않는 거래처까지 전부 미리
  // 조회하면 실제로 쓰이지 않는 호출이 쌓여 비용만 늘어납니다. 대신 담당자가 지도에서 해당
  // 거래처 카드를 실제로 열었을 때만(리뷰가 아직 없는 경우) 그 자리에서 수집합니다 — 사용한
  // 만큼만 비용이 발생하도록 sales-route-map-workspace.tsx의 카드 오픈 시점에서 호출합니다.

  return {
    customer: savedCustomer,
    persisted: true
  };
}

async function upsertNormalizedCustomerWithOptionalPlaceLinks(
  payload: Record<string, unknown>,
  concurrency?: { id: string; expectedUpdatedAt: string }
) {
  // 동시 편집 감지가 걸려 있으면(기존 행을 수정하는 요청이고, 클라이언트가 마지막으로 읽은
  // updated_at을 보냈다면) on_conflict 업서트 대신 조건부 PATCH로 바꿔, WHERE 절의
  // updated_at=eq.<expected>가 그 사이 바뀌었으면 아무 행도 갱신되지 않도록 합니다(0행 응답 =
  // 충돌, 위 호출부에서 판별). on_conflict 업서트는 PostgREST 특성상 이런 조건부 갱신을 표현할
  // 수 없어 이 경우에만 별도 경로를 씁니다.
  if (concurrency) {
    return supabaseRequest<Array<Record<string, unknown>>>(
      `normalized_customers?id=eq.${encodeURIComponent(concurrency.id)}&updated_at=eq.${encodeURIComponent(concurrency.expectedUpdatedAt)}`,
      {
        method: "PATCH",
        headers: {
          Prefer: "return=representation"
        },
        body: JSON.stringify(payload)
      }
    );
  }
  return supabaseRequest<Array<Record<string, unknown>>>("normalized_customers?on_conflict=company_id,normalized_key", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([payload])
  });
}

// 거래처 하나에 대표/실장/부장/매니저 등 여러 연락처를 등록·관리합니다. 대표 연락처 한 명(기존
// representative_name/phone)과 별개로, 실무에서 자주 마주치는 다른 담당자들을 추가로 남길 수 있습니다.
export type CustomerContactItem = {
  id: string;
  customerId: string;
  birthDate?: string;
  isPrimary: boolean;
  memo?: string;
  name: string;
  phone?: string;
  role: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type CustomerContactRow = {
  id: string;
  customer_id: string;
  role: string;
  name: string;
  phone: string | null;
  memo: string | null;
  birth_date?: string | null;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

function toCustomerContactItem(row: CustomerContactRow): CustomerContactItem {
  return {
    id: row.id,
    customerId: row.customer_id,
    birthDate: row.birth_date || undefined,
    isPrimary: row.is_primary,
    memo: row.memo || undefined,
    name: row.name,
    phone: row.phone || undefined,
    role: row.role,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function isMissingCustomerContactsTableError(error: unknown) {
  return error instanceof Error && error.message.includes("customer_contacts");
}

export async function listCustomerContacts(companyId: string, customerId: string): Promise<CustomerContactItem[]> {
  if (!isProductionStoreConfigured()) return [];
  try {
    const rows = await supabaseRequest<CustomerContactRow[]>(
      `customer_contacts?select=*&company_id=eq.${encodeURIComponent(companyId)}&customer_id=eq.${encodeURIComponent(customerId)}&order=sort_order.asc,created_at.asc`
    );
    return rows.map(toCustomerContactItem);
  } catch (error) {
    if (isMissingCustomerContactsTableError(error)) return [];
    throw error;
  }
}

export type CustomerContactInput = {
  id?: string;
  birthDate?: string;
  isPrimary?: boolean;
  memo?: string;
  name: string;
  phone?: string;
  role: string;
};

export async function upsertCustomerContact(
  companyId: string,
  customerId: string,
  input: CustomerContactInput
): Promise<{ contact: CustomerContactItem | null; ok: boolean; message?: string }> {
  if (!isProductionStoreConfigured()) return { contact: null, ok: false, message: "데이터베이스가 연결되어 있지 않습니다." };
  if (!input.name.trim()) return { contact: null, ok: false, message: "담당자 이름은 필수입니다." };

  const basePayload = {
    company_id: companyId,
    customer_id: customerId,
    role: input.role.trim() || "담당자",
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    memo: input.memo?.trim() || null,
    is_primary: Boolean(input.isPrimary),
    updated_at: new Date().toISOString()
  };
  // birth_date는 20260818c 마이그레이션으로 추가된 컬럼입니다. 아직 마이그레이션을 실행하지 않은
  // 환경에서도 나머지 연락처 저장 기능(이름/직책/전화/메모)이 함께 깨지지 않도록, 컬럼이 없다는
  // 오류(PGRST204/schema cache)를 만나면 이 필드만 빼고 한 번 더 시도합니다.
  const payloadWithBirthDate = { ...basePayload, birth_date: input.birthDate?.trim() || null };

  async function runUpsert(payload: Record<string, unknown>) {
    if (input.id) {
      return supabaseRequest<CustomerContactRow[]>(
        `customer_contacts?id=eq.${encodeURIComponent(input.id!)}&company_id=eq.${encodeURIComponent(companyId)}`,
        { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) }
      );
    }
    return supabaseRequest<CustomerContactRow[]>("customer_contacts", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([payload])
    });
  }

  try {
    let rows: CustomerContactRow[];
    let birthDateSaved = true;
    try {
      rows = await runUpsert(payloadWithBirthDate);
    } catch (error) {
      if (!isMissingColumnError(error) || !input.birthDate?.trim()) throw error;
      birthDateSaved = false;
      rows = await runUpsert(basePayload);
    }
    return {
      contact: rows[0] ? toCustomerContactItem(rows[0]) : null,
      ok: true,
      message: birthDateSaved ? undefined : "생일 항목은 아직 저장되지 않았습니다 — 관리자가 마이그레이션을 실행해야 합니다."
    };
  } catch (error) {
    if (isMissingCustomerContactsTableError(error)) {
      return { contact: null, ok: false, message: "연락처 저장소가 아직 준비되지 않았습니다. 마이그레이션을 먼저 실행해주세요." };
    }
    throw error;
  }
}

export async function deleteCustomerContact(companyId: string, contactId: string): Promise<{ ok: boolean }> {
  if (!isProductionStoreConfigured()) return { ok: false };
  await supabaseRequest(`customer_contacts?id=eq.${encodeURIComponent(contactId)}&company_id=eq.${encodeURIComponent(companyId)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  }).catch((error) => {
    if (!isMissingCustomerContactsTableError(error)) throw error;
  });
  return { ok: true };
}

// 구글 리뷰 자동 수집 (리뷰_자동수집_파이프라인_설계.md "옵션 B"). GOOGLE_PLACES_API_KEY가 없는
// 환경에서도 항상 안전하게 "설정 안 됨" 메시지를 돌려주고, 있는 환경에서는 거래처명+주소로 구글
// Place를 찾아 리뷰를 가져와 review_summary/review_keywords/review_source/reviews_updated_at을
// 갱신합니다. 사업자 상태 자동조회(refreshCustomerBusinessStatuses)와 동일한 graceful-degradation
// 구조를 그대로 따릅니다.
export type GoogleReviewSyncOutcome = {
  ok: boolean;
  updated: boolean;
  message?: string;
  result?: GoogleReviewSyncResult;
};

export async function syncCustomerGoogleReviews(companyId: string, customerId: string): Promise<GoogleReviewSyncOutcome> {
  if (!isGoogleReviewsApiConfigured()) {
    return { ok: false, updated: false, message: "GOOGLE_PLACES_API_KEY가 설정되지 않아 구글 리뷰 자동 수집을 사용할 수 없습니다." };
  }
  if (!isProductionStoreConfigured()) {
    return { ok: false, updated: false, message: "저장소가 준비되지 않았습니다." };
  }

  const rows = await supabaseRequest<Array<{ id: string; customer_name: string; address: string | null }>>(
    `normalized_customers?select=id,customer_name,address&company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(
      customerId
    )}&limit=1`
  ).catch(() => []);
  const customer = rows[0];
  if (!customer) return { ok: false, updated: false, message: "거래처를 찾을 수 없습니다." };

  const result = await syncGoogleReviewsForCustomer({ customerName: customer.customer_name, address: customer.address || undefined });
  if (!result) {
    return { ok: true, updated: false, message: "구글에서 이 거래처의 리뷰를 찾지 못했습니다." };
  }

  await supabaseRequest(`normalized_customers?id=eq.${encodeURIComponent(customerId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      review_summary: result.summary,
      review_keywords: result.keywords,
      review_source: result.source,
      reviews_updated_at: new Date().toISOString()
    })
  });

  return { ok: true, updated: true, result };
}

// 네이버플레이스·카카오맵은 공식 리뷰 API가 없고, 자동으로 페이지를 읽어오는 것(스크래핑)은
// 하지 않기로 했습니다(리뷰_자동수집_파이프라인_설계.md 참고 — map.naver.com 등은 자동 접근 대상이
// 아닙니다). 대신 담당자가 링크를 열어 리뷰를 직접 읽고 텍스트를 복사해서 붙여넣으면, 그 텍스트를
// AI(규칙 기반 요약기, 별도 API 키 불필요)가 즉시 요약·키워드화합니다. 어떤 URL도 이 함수 내부에서
// 가져오지 않습니다 — 오직 사람이 이미 붙여넣은 텍스트만 다룹니다.
export type ManualReviewSummaryOutcome = {
  ok: boolean;
  message?: string;
  result?: { summary: string; keywords: string[]; source: string };
};

export async function summarizeCustomerReviewText(
  companyId: string,
  customerId: string,
  input: { rawText: string; source: string }
): Promise<ManualReviewSummaryOutcome> {
  if (!isProductionStoreConfigured()) return { ok: false, message: "저장소가 준비되지 않았습니다." };

  const rawText = (input.rawText || "").trim();
  if (!rawText) return { ok: false, message: "붙여넣은 리뷰 텍스트가 없습니다." };
  const source = (input.source || "").trim() || "직접 입력";

  const summarized = summarizePastedReviewText(rawText);
  if (!summarized) return { ok: false, message: "텍스트에서 요약할 내용을 찾지 못했습니다." };

  const rows = await supabaseRequest<Array<{ id: string }>>(
    `normalized_customers?select=id&company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(customerId)}&limit=1`
  ).catch(() => []);
  if (!rows.length) return { ok: false, message: "거래처를 찾을 수 없습니다." };

  await supabaseRequest(`normalized_customers?id=eq.${encodeURIComponent(customerId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      review_summary: summarized.summary,
      review_keywords: summarized.keywords,
      review_source: source,
      reviews_updated_at: new Date().toISOString()
    })
  });

  return { ok: true, result: { ...summarized, source } };
}

// 2026-08-26 정리: 이 회사 전체 대상 자동 구글 리뷰 새로고침 배치(refreshCustomerGoogleReviews /
// refreshAllCompaniesGoogleReviews)는 이를 호출하던 cron이 제거된 뒤 어디서도 호출되지 않는 죽은
// 코드였습니다("전반적인 흐름을 위해 필요없는건 걷어내" 조치). 특정 거래처를 수동으로 새로고침하는
// syncGoogleReviewsForCustomer()/syncCustomerGoogleReviews()는 "리뷰 새로고침" 버튼에서 계속 사용되므로 그대로 둡니다.

export type BusinessNumberException = {
  id: string;
  businessRegistrationNumber: string;
  memo: string;
  createdAt: string;
};

function isMissingBusinessNumberExceptionsTableError(error: unknown) {
  return error instanceof Error && error.message.includes("business_number_exceptions");
}

/**
 * 하나의 사업자등록번호(종사업자번호 등)로 여러 거래처를 운영하는 회사를 위한 예외 목록입니다.
 * 이 목록에 등록된 사업자번호는 데이터 등록/업로드 시 normalized_key를 사업자번호 대신
 * 상호명+주소 기준으로 계산해, 서로 다른 거래처가 같은 레코드로 병합되거나 중복으로
 * 잘못 경고되지 않도록 합니다. getExemptBusinessNumberSet()과 함께 사용하세요.
 */
export async function getBusinessNumberExceptions(companyId: string): Promise<{ exceptions: BusinessNumberException[]; persisted: boolean }> {
  if (!companyId) throw new Error("고객사 ID가 필요합니다.");
  if (!isProductionStoreConfigured()) return { exceptions: [], persisted: false };

  try {
    const rows = await supabaseRequest<Array<{ id: string; business_registration_number: string; memo: string | null; created_at: string }>>(
      `business_number_exceptions?select=id,business_registration_number,memo,created_at&company_id=eq.${encodeURIComponent(
        companyId
      )}&order=created_at.desc`
    );
    return {
      persisted: true,
      exceptions: rows.map((row) => ({
        id: row.id,
        businessRegistrationNumber: row.business_registration_number,
        memo: row.memo || "",
        createdAt: new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
      }))
    };
  } catch (error) {
    if (isMissingBusinessNumberExceptionsTableError(error)) return { exceptions: [], persisted: false };
    throw error;
  }
}

/** normalized_key 계산에서 businessNumber || ... 폴백을 우회해야 할 사업자번호 집합만 가볍게 가져옵니다. */
export async function getExemptBusinessNumberSet(companyId?: string): Promise<Set<string>> {
  const id = companyId || getDefaultCompanyId();
  if (!isProductionStoreConfigured()) return new Set();

  try {
    const rows = await supabaseRequest<Array<{ business_registration_number: string }>>(
      `business_number_exceptions?select=business_registration_number&company_id=eq.${encodeURIComponent(id)}`
    );
    return new Set(rows.map((row) => normalizeBusinessNumber(row.business_registration_number)));
  } catch (error) {
    if (isMissingBusinessNumberExceptionsTableError(error)) return new Set();
    throw error;
  }
}

export async function addBusinessNumberException(
  companyId: string,
  businessRegistrationNumber: string,
  memo: string,
  auditContext: AuditActorContext = {}
): Promise<{ exception: BusinessNumberException; persisted: boolean }> {
  if (!companyId) throw new Error("고객사 ID가 필요합니다.");
  const businessNumber = normalizeBusinessNumber(businessRegistrationNumber || "");
  if (!businessNumber) throw new Error("사업자등록번호를 입력하세요.");

  if (!isProductionStoreConfigured()) {
    return {
      persisted: false,
      exception: {
        id: globalThis.crypto.randomUUID(),
        businessRegistrationNumber: businessNumber,
        memo: memo.trim(),
        createdAt: "서버 저장 미확인"
      }
    };
  }

  try {
    const rows = await supabaseRequest<Array<{ id: string; business_registration_number: string; memo: string | null; created_at: string }>>(
      "business_number_exceptions?on_conflict=company_id,business_registration_number",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify([
          {
            company_id: companyId,
            business_registration_number: businessNumber,
            memo: memo.trim() || null,
            created_by: auditContext.actorName || "시스템"
          }
        ])
      }
    );
    const row = rows[0];
    const exception: BusinessNumberException = {
      id: row.id,
      businessRegistrationNumber: row.business_registration_number,
      memo: row.memo || "",
      createdAt: new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    };

    await writeAdminAuditLog({
      companyId,
      action: "business_number_exception_created",
      targetType: "business_number_exception",
      targetId: exception.id,
      metadata: {
        actorName: auditContext.actorName || "시스템",
        actorRole: auditContext.actorRole || "unknown",
        businessRegistrationNumber: exception.businessRegistrationNumber
      }
    }).catch(() => null);

    return { persisted: true, exception };
  } catch (error) {
    if (isMissingBusinessNumberExceptionsTableError(error)) {
      throw new Error(
        "중복 허용 사업자번호를 저장할 수 없습니다. Supabase에 business_number_exceptions 테이블이 아직 없습니다. supabase/migrations/20260814_business_number_exceptions.sql을 먼저 실행하세요."
      );
    }
    throw error;
  }
}

export async function removeBusinessNumberException(companyId: string, exceptionId: string, auditContext: AuditActorContext = {}): Promise<void> {
  if (!companyId) throw new Error("고객사 ID가 필요합니다.");
  if (!exceptionId) throw new Error("삭제할 항목 ID가 필요합니다.");
  if (!isProductionStoreConfigured()) return;

  await supabaseRequest(`business_number_exceptions?company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(exceptionId)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });

  await writeAdminAuditLog({
    companyId,
    action: "business_number_exception_removed",
    targetType: "business_number_exception",
    targetId: exceptionId,
    metadata: {
      actorName: auditContext.actorName || "시스템",
      actorRole: auditContext.actorRole || "unknown"
    }
  }).catch(() => null);
}

export async function getCustomerOperations(customerId: string, companyId?: string) {
  const id = companyId || getDefaultCompanyId();

  if (!isProductionStoreConfigured() || customerId.startsWith("sample-") || customerId.startsWith("local-")) {
    return {
      attachments: [],
      notes: [],
      source: "empty" as const
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

export type CustomerOperationsSummaryEntry = {
  memoCount: number;
  latestMemo?: string;
  loadingPositionPhotoUrl?: string;
};

/**
 * 배치 버전 getCustomerOperations: 거래처별로 한 번씩 호출하는 대신(N+1), 전체 거래처 ID를
 * 한 번의 in() 조회로 묶어 실제 메모 건수/최신 메모, 적재위치 사진 존재 여부를 반환합니다.
 * "거래처 전체 현황" 표에서 memoCount 같은 임의 placeholder 값을 쓰지 않기 위한 용도입니다.
 */
export async function getCustomerOperationsSummary(
  customerIds: string[],
  companyId?: string
): Promise<Record<string, CustomerOperationsSummaryEntry>> {
  const id = companyId || getDefaultCompanyId();
  const summary: Record<string, CustomerOperationsSummaryEntry> = {};

  if (!isProductionStoreConfigured()) return summary;

  const idList = customerIds.filter((customerId) => !customerId.startsWith("sample-") && !customerId.startsWith("local-"));
  if (!idList.length) return summary;

  const idsParam = idList.map(encodeURIComponent).join(",");

  const [notes, attachments] = await Promise.all([
    supabaseRequest<Array<{ customer_id: string; memo: string; created_at: string }>>(
      `customer_notes?select=customer_id,memo,created_at&company_id=eq.${encodeURIComponent(id)}&customer_id=in.(${idsParam})&order=created_at.desc`
    ),
    supabaseRequest<Array<{ customer_id: string; attachment_type: string; file_url: string | null; storage_path: string | null }>>(
      `customer_attachments?select=customer_id,attachment_type,file_url,storage_path&company_id=eq.${encodeURIComponent(
        id
      )}&customer_id=in.(${idsParam})&attachment_type=eq.loading_position&order=created_at.desc`
    )
  ]);

  for (const note of notes) {
    const entry = summary[note.customer_id] || { memoCount: 0 };
    summary[note.customer_id] = {
      ...entry,
      latestMemo: entry.latestMemo || note.memo,
      memoCount: entry.memoCount + 1
    };
  }

  for (const attachment of attachments) {
    const entry = summary[attachment.customer_id] || { memoCount: 0 };
    if (entry.loadingPositionPhotoUrl) continue;
    summary[attachment.customer_id] = {
      ...entry,
      loadingPositionPhotoUrl:
        attachment.file_url || (attachment.storage_path ? `/api/customer-attachments/file?path=${encodeURIComponent(attachment.storage_path)}` : undefined)
    };
  }

  return summary;
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

export type CustomerMessageLogItem = {
  id: string;
  channel: string;
  createdAt: string;
  errorMessage?: string;
  messageBody: string;
  provider?: string;
  recipientName?: string;
  recipientPhone?: string;
  sentAt?: string;
  status: "failed" | "queued" | "sent";
  triggerType: string;
};

type CustomerMessageLogRow = {
  id: string;
  channel: string;
  created_at: string;
  error_message: string | null;
  message_body: string;
  provider: string | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  sent_at: string | null;
  status: "failed" | "queued" | "sent";
  trigger_type: string;
};

function isMissingCustomerMessageLogsTableError(error: unknown) {
  return error instanceof Error && error.message.includes("customer_message_logs");
}

function toCustomerMessageLogItem(row: CustomerMessageLogRow): CustomerMessageLogItem {
  return {
    id: row.id,
    channel: row.channel,
    createdAt: new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
    errorMessage: row.error_message || undefined,
    messageBody: row.message_body,
    provider: row.provider || undefined,
    recipientName: row.recipient_name || undefined,
    recipientPhone: row.recipient_phone || undefined,
    sentAt: row.sent_at ? new Date(row.sent_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : undefined,
    status: row.status,
    triggerType: row.trigger_type
  };
}

export async function sendCustomerDeliveryMessage(
  input: {
    attachmentId?: string;
    channel: CustomerMessageChannel;
    customerId: string;
    message: string;
    noteId?: string;
    triggerType?: "delivery_complete" | "delivery_issue" | "manual";
    triggeredByName?: string;
  },
  companyId?: string
) {
  const id = companyId || getDefaultCompanyId();
  const message = input.message.trim();
  if (!message) throw new Error("발송할 메시지가 없습니다.");

  if (!isProductionStoreConfigured() || input.customerId.startsWith("sample-") || input.customerId.startsWith("local-")) {
    return {
      log: {
        id: `local-message-${Date.now()}`,
        channel: input.channel,
        createdAt: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
        errorMessage: "데이터베이스 미연결 상태라 실제 발송하지 않고 대기 기록만 만들었습니다.",
        messageBody: message,
        provider: "manual",
        status: "queued" as const,
        triggerType: input.triggerType || "delivery_complete"
      },
      ok: true,
      sent: false
    };
  }

  const customerRows = await supabaseRequest<
    Array<{
      customer_name: string;
      phone: string | null;
      representative_name: string | null;
    }>
  >(
    `normalized_customers?select=customer_name,phone,representative_name&company_id=eq.${encodeURIComponent(id)}&id=eq.${encodeURIComponent(
      input.customerId
    )}&limit=1`
  );
  const customer = customerRows[0];
  if (!customer) throw new Error("거래처를 찾을 수 없습니다.");

  const contacts = await listCustomerContacts(id, input.customerId).catch(() => []);
  const primaryContact = contacts.find((contact) => contact.isPrimary && contact.phone) || contacts.find((contact) => contact.phone);
  const recipientName = primaryContact?.name || customer.representative_name || customer.customer_name;
  const recipientPhone = primaryContact?.phone || customer.phone || "";
  const sendResult = await sendCustomerMessage({ channel: input.channel, message, phone: recipientPhone });
  const normalizedRecipientPhone = sendResult.recipientPhone || recipientPhone;

  try {
    const rows = await supabaseRequest<CustomerMessageLogRow[]>("customer_message_logs", {
      method: "POST",
      body: JSON.stringify([
        {
          attachment_id: input.attachmentId || null,
          channel: input.channel,
          company_id: id,
          contact_id: primaryContact?.id || null,
          customer_id: input.customerId,
          error_message: sendResult.reason || null,
          message_body: message,
          note_id: input.noteId || null,
          provider: sendResult.provider,
          provider_message_id: sendResult.providerMessageId || null,
          recipient_name: recipientName || null,
          recipient_phone: normalizedRecipientPhone || null,
          sent_at: sendResult.status === "sent" ? new Date().toISOString() : null,
          status: sendResult.status,
          trigger_type: input.triggerType || "delivery_complete",
          triggered_by_name: input.triggeredByName || "현장 사용자"
        }
      ])
    });
    const log = toCustomerMessageLogItem(rows[0]);

    await addCustomerNote(
      {
        customerId: input.customerId,
        createdByName: input.triggeredByName || "현장 사용자",
        memo:
          sendResult.status === "sent"
            ? `[알림 발송 완료]\n${message}`
            : `[알림 발송 대기]\n${message}\n${sendResult.reason || "발송 설정 확인 필요"}`,
        nextAction: sendResult.status === "sent" ? "거래처 알림 발송 완료" : "거래처 알림 수동 확인",
        noteType: "delivery_message"
      },
      id
    ).catch(() => null);

    return {
      log,
      ok: true,
      sent: log.status === "sent"
    };
  } catch (error) {
    if (!isMissingCustomerMessageLogsTableError(error)) throw error;
    await addCustomerNote(
      {
        customerId: input.customerId,
        createdByName: input.triggeredByName || "현장 사용자",
        memo: `[알림 발송 대기]\n${message}\n메시지 로그 테이블이 없어 거래처 메모로만 저장했습니다.`,
        nextAction: "customer_message_logs 마이그레이션 적용",
        noteType: "delivery_message"
      },
      id
    ).catch(() => null);
    return {
      log: {
        id: `fallback-message-${Date.now()}`,
        channel: input.channel,
        createdAt: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
        errorMessage: "메시지 로그 테이블이 아직 준비되지 않았습니다.",
        messageBody: message,
        provider: sendResult.provider,
        recipientName,
        recipientPhone: normalizedRecipientPhone,
        status: "queued" as const,
        triggerType: input.triggerType || "delivery_complete"
      },
      ok: true,
      sent: false
    };
  }
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
        ? "20260725_customer_place_links.sql 마이그레이션을 Supabase SQL Editor에서 실행해야 링크가 서버에 저장됩니다."
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
  // 2026-08-28 피드백 대응(엑셀 한 줄만 잘못돼도 전체 업로드 실패): 상호명이 비어 있는 행은
  // normalized_customers.customer_name NOT NULL 제약에 걸려 배치 삽입 전체를 실패시킵니다.
  // 저장 전에 미리 걸러내고, 몇 번째 행을 건너뛰었는지 결과에 담아 사용자에게 알려줍니다.
  const skippedRowNumbers: number[] = [];
  if (options.rawRows?.length) {
    const filteredRows: CustomerRow[] = [];
    const filteredRawRows: RawUploadRow[] = [];
    rows.forEach((row, index) => {
      if (!row.customerName || !row.customerName.trim()) {
        skippedRowNumbers.push(index + 1);
        return;
      }
      filteredRows.push(row);
      const rawRow = options.rawRows?.[index];
      if (rawRow) filteredRawRows.push(rawRow);
    });
    rows = filteredRows;
    options = { ...options, rawRows: filteredRawRows };
  } else {
    const filteredRows: CustomerRow[] = [];
    rows.forEach((row, index) => {
      if (!row.customerName || !row.customerName.trim()) {
        skippedRowNumbers.push(index + 1);
        return;
      }
      filteredRows.push(row);
    });
    rows = filteredRows;
  }

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
        qualityScore,
        skippedRowNumbers
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
  // 2026-08-28 피드백 대응(엑셀 대량등록이 중복방지 로직을 우회함): upsertCustomerMaster의 수기
  // 등록 흐름에는 "이름이 같은 다른 거래처가 이미 있으면 확인을 받는다" 로직이 있지만, 엑셀 대량
  // 저장 경로(saveAnalysis)는 이 확인 없이 normalized_key가 다르면 그냥 새 행으로 병합-삽입해
  // 왔습니다. 기존 거래처 목록을 한 번에 가져와 이름이 겹치는 행을 사전에 걸러내기 위해 함께
  // 조회합니다(회사당 최대 5000곳까지).
  const [, , , exemptBusinessNumbers, existingCustomersForDuplicateCheck] = await Promise.all([
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
      : Promise.resolve(),
    getExemptBusinessNumberSet(companyId).catch(() => new Set<string>()),
    // 매출 데이터 업로드(sales-analysis)는 기존 거래처의 매출을 갱신하는 용도라 이름 중복
    // 경고 대상이 아니므로, 신규 거래처 등록 업로드일 때만 기존 거래처 목록을 조회합니다.
    options.uploadType !== "sales-analysis"
      ? supabaseRequest<Array<{ id: string; customer_name: string; address: string | null; normalized_key: string }>>(
          `normalized_customers?select=id,customer_name,address,normalized_key&company_id=eq.${encodeURIComponent(companyId)}&limit=5000`
        ).catch(() => [])
      : Promise.resolve([] as Array<{ id: string; customer_name: string; address: string | null; normalized_key: string }>)
  ]);

  const existingByNameLower = new Map<string, Array<{ id: string; customerName: string; address: string; normalizedKey: string }>>();
  for (const row of existingCustomersForDuplicateCheck) {
    const nameKey = (row.customer_name || "").trim().toLowerCase();
    if (!nameKey) continue;
    const list = existingByNameLower.get(nameKey) || [];
    list.push({ id: row.id, customerName: row.customer_name, address: row.address || "", normalizedKey: row.normalized_key });
    existingByNameLower.set(nameKey, list);
  }
  // 2026-08-28 피드백 대응: normalized_key가 기존 거래처와 정확히 일치하면(사업자번호 동일 등)
  // 그대로 업데이트로 처리하지만, key가 달라 "신규 등록"으로 처리될 상황에서 상호명이 이미 등록된
  // 다른 거래처와 같다면 그대로 병합-삽입하지 않고 건너뛴 뒤 사용자에게 보고합니다. 수기 등록의
  // upsertCustomerMaster에 있는 것과 같은 안전장치를 대량 등록 경로에도 적용하는 것입니다.
  const duplicateWarnings: Array<{ rowNumber: number; customerName: string; address: string; matches: Array<{ customerName: string; address: string }> }> = [];

  const normalizedRows = rows
    .map((row, index) => {
      const rawRow = options.rawRows?.[index];
      const businessRegistrationNumber = rawRow ? normalizeBusinessNumber(getRawCell(rawRow, options.columnMapping?.businessRegistrationNumber)) : "";
      // 중복 허용 목록에 등록된 사업자번호(종사업자번호 등)는 상호명+주소 기준 key를 사용해,
      // 같은 사업자번호를 쓰는 다른 거래처가 하나의 레코드로 덮어써지지 않도록 합니다.
      const normalizedKey =
        businessRegistrationNumber && !exemptBusinessNumbers.has(businessRegistrationNumber) ? businessRegistrationNumber : makeNormalizedKey(row);

      const nameKey = row.customerName.trim().toLowerCase();
      const existingMatches = existingByNameLower.get(nameKey) || [];
      const isExactUpdate = existingMatches.some((match) => match.normalizedKey === normalizedKey);
      if (!isExactUpdate && existingMatches.length) {
        duplicateWarnings.push({
          rowNumber: index + 1,
          customerName: row.customerName,
          address: row.address,
          matches: existingMatches.map((match) => ({ customerName: match.customerName, address: match.address }))
        });
        return null;
      }

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
    })
    .filter((row): row is Record<string, unknown> => row !== null);

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
      qualityScore,
      skippedRowNumbers,
      duplicateWarnings
    }
  };
}

export async function getLatestReport(companyId?: string): Promise<AnalysisResult> {
  if (!isProductionStoreConfigured()) return analyzeCompany([]);
  // 2026-08-26 멀티테넌시 방어(P0-1): companyId가 없으면 전체 회사를 대상으로 조회하는 대신 빈
  // 결과를 돌려줍니다. 지금은 모든 호출부가 인증된 companyId를 넘기지만, 앞으로 실수로 그 검증을
  // 빼먹은 호출부가 생겨도 다른 회사 데이터가 새어나가지 않도록 하는 안전장치입니다.
  if (!companyId) return analyzeCompany([]);

  try {
    const reports = await supabaseRequest<Array<{ report: AnalysisResult }>>(
      `ai_reports?select=report&company_id=eq.${encodeURIComponent(companyId)}&order=created_at.desc&limit=1`
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
  // 2026-08-26 멀티테넌시 방어(P0-1): companyId 없이는 다른 회사의 리포트를 반환하지 않습니다.
  if (!companyId) return null;

  const reports = await supabaseRequest<Array<{ report: AnalysisResult }>>(
    `ai_reports?select=report&id=eq.${encodeURIComponent(reportId)}&company_id=eq.${encodeURIComponent(companyId)}&limit=1`
  );

  return reports[0]?.report || null;
}

export async function getLatestBriefing(companyId?: string) {
  const [report, customerMaster] = await Promise.all([
    getLatestReport(companyId),
    getCustomerMaster(companyId).catch(() => ({ customers: [], source: "empty" as const }))
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
    source: customerMaster.source
  };
}

function getEmptyBriefing(source: "empty" | "supabase" = "supabase") {
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
  // 2026-08-26 멀티테넌시 방어(P0-1): companyId 없이는 전체 회사의 리드를 섞어 반환하지 않습니다.
  if (!companyId) return { total: 0, leads: [] };

  try {
    const rows = await supabaseRequest<
      Array<{ id: string; name: string; region: string; score: number; reasons: string[]; status: LeadStatus | string }>
    >(`lead_recommendations?select=id,name,region,score,reasons,status&company_id=eq.${encodeURIComponent(companyId)}&order=score.desc&limit=50`);

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
  // 2026-08-26 멀티테넌시 방어(P0-1): companyId 없이는 어떤 회사의 리드인지 확인할 수 없으므로
  // 쓰기(PATCH)를 실행하지 않습니다 — 다른 회사의 리드를 잘못 수정하는 사고를 막기 위함입니다.
  if (!companyId) return { persisted: false, id: leadId, status };

  const rows = await supabaseRequest<Array<{ id: string; status: LeadStatus }>>(
    `lead_recommendations?id=eq.${encodeURIComponent(leadId)}&company_id=eq.${encodeURIComponent(companyId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status })
    }
  );

  return { persisted: true, id: rows[0]?.id || leadId, status: rows[0]?.status || status };
}

// ── 신규 영업 리드(사업자 인허가 기반) ──────────────────────────────────────────
// lead_recommendations(위 getLatestLeads)는 AI 리포트가 만드는 기존 거래처 기반 기회 리드이고,
// 아래는 완전히 별개인 "사업자 인허가 신규 데이터"를 원천으로 하는 신규 영업 후보입니다.
// 지도 홈에서 "오늘 새로 문 연 곳"을 찾아 전화/DM/방문으로 이어가는 용도입니다.

export type PermitLeadPeriod = "today" | "week" | "month" | "recent";

export type PermitLeadIngestRow = {
  businessName: string;
  businessNumber?: string;
  representativeName?: string;
  permitStatus?: string;
  permitDate?: string;
  openDate?: string;
  address?: string;
  phone?: string;
  jurisdiction?: string;
  industry?: string;
  latitude?: number;
  longitude?: number;
};

export type PermitLeadItem = {
  id: string;
  businessName: string;
  businessNumber?: string;
  representativeName?: string;
  permitStatus?: string;
  isActive: boolean;
  permitDate?: string;
  openDate?: string;
  address?: string;
  phone?: string;
  jurisdiction?: string;
  latitude?: number;
  longitude?: number;
  leadPeriod: PermitLeadPeriod;
  industryPrimary: string;
  industryTags: string[];
  isTargetIndustry: boolean;
  isDuplicate: boolean;
  matchedCustomerId?: string;
  status: string;
  nextAction?: string;
  nextActionReasons: string[];
  excludeReason?: string;
  scoreTotal: number;
  scoreBreakdown: Record<string, number>;
  grade: "A" | "B" | "C" | null;
  naverPlaceUrl?: string;
  kakaoPlaceUrl?: string;
  googlePlaceUrl?: string;
  instagramUrl?: string;
  reviewCount?: number;
  rating?: number;
  keywordVolume?: number;
  source?: string;
  createdAt: string;
  updatedAt: string;
};

export type PermitLeadActionItem = {
  id: string;
  actionType: string;
  result?: string;
  memo?: string;
  actorName?: string;
  createdAt: string;
};

type PermitLeadActionRow = {
  id: string;
  action_type: string;
  result: string | null;
  memo: string | null;
  actor_name: string | null;
  created_at: string;
};

type PermitLeadRow = {
  id: string;
  business_name: string;
  business_number: string | null;
  representative_name: string | null;
  permit_status: string | null;
  is_active: boolean;
  permit_date: string | null;
  open_date: string | null;
  address: string | null;
  phone: string | null;
  jurisdiction: string | null;
  latitude: number | null;
  longitude: number | null;
  lead_period: PermitLeadPeriod;
  industry_raw: string | null;
  industry_primary: string | null;
  industry_tags: string[] | null;
  is_target_industry: boolean;
  matched_customer_id: string | null;
  is_duplicate: boolean;
  status: string;
  next_action: string | null;
  next_action_reasons: string[] | null;
  exclude_reason: string | null;
  score_total: number;
  score_breakdown: Record<string, number> | null;
  grade: string | null;
  naver_place_url: string | null;
  kakao_place_url: string | null;
  google_place_url: string | null;
  instagram_url: string | null;
  review_count: number | null;
  rating: number | null;
  keyword_volume: number | null;
  source: string | null;
  created_at: string;
  updated_at: string;
};

// 유통사가 취급하는 식자재와 무관해 영업 대상에서 자동 제외할 업종 키워드입니다.
const PERMIT_EXCLUDED_INDUSTRY_KEYWORDS = [
  "미용실", "이용원", "네일", "피부관리", "학원", "교습소", "공인중개사", "부동산중개",
  "병원", "의원", "약국", "한의원", "동물병원", "세탁", "정비", "카센터", "숙박업", "모텔",
  "여관", "고시원", "PC방", "노래연습장", "당구장", "골프연습장", "체육시설", "독서실", "안경"
];

// 업종 원문/상호명에서 대표 업종을 분류하는 규칙입니다. 필요에 따라 계속 추가할 수 있습니다.
export const PERMIT_INDUSTRY_RULES: ReadonlyArray<{ primary: string; keywords: string[] }> = [
  { primary: "한식", keywords: ["한식", "국밥", "해장국", "백반", "찌개", "곰탕", "설렁탕", "분식"] },
  { primary: "카페/디저트", keywords: ["카페", "커피", "디저트", "베이커리", "제과", "빵집"] },
  { primary: "일식", keywords: ["일식", "이자카야", "스시", "라멘", "돈카츠", "우동"] },
  { primary: "중식", keywords: ["중식", "마라탕", "양꼬치", "짬뽕", "짜장"] },
  { primary: "프랜차이즈/배달", keywords: ["치킨", "피자", "버거", "패스트푸드"] },
  { primary: "주점", keywords: ["주점", "포차", "호프", "술집"] },
  { primary: "양식", keywords: ["양식", "파스타", "스테이크", "브런치"] },
  { primary: "뷔페/단체급식", keywords: ["뷔페", "단체급식", "구내식당", "케이터링"] }
];

/**
 * 인허가 원본 업종명/상호명에서 대표 업종과 보조 키워드 태그를 뽑고, 식자재 유통 영업 대상
 * 업종인지 판단합니다. 명확히 비대상인 키워드가 있으면 즉시 제외하고, 규칙에 없는 일반
 * 음식점류는 "미분류(확인 필요)"로 남겨 영업자가 직접 판단하게 합니다(무리하게 제외하지 않음).
 */
export function classifyPermitLeadIndustry(rawIndustryText: string, businessName: string) {
  const haystack = `${rawIndustryText || ""} ${businessName || ""}`;

  for (const excluded of PERMIT_EXCLUDED_INDUSTRY_KEYWORDS) {
    if (haystack.includes(excluded)) {
      return { primary: rawIndustryText?.trim() || "비대상 업종", tags: [] as string[], isTarget: false };
    }
  }

  for (const rule of PERMIT_INDUSTRY_RULES) {
    const matchedTags = rule.keywords.filter((keyword) => haystack.includes(keyword));
    if (matchedTags.length) return { primary: rule.primary, tags: matchedTags, isTarget: true };
  }

  const looksLikeFoodService = /음식점|식당|분식|급식|주점|카페|제과|호프|포차/.test(rawIndustryText || "");
  return {
    primary: rawIndustryText?.trim() || "미분류",
    tags: [] as string[],
    isTarget: looksLikeFoodService || !rawIndustryText?.trim()
  };
}

/**
 * 기준 날짜(호출하는 쪽에서 개업일 우선, 없으면 인허가일을 넘겨줌)로 오늘/이번 주(월요일 시작)/
 * 이번 달/최근 90일 중 어느 구간에 속하는지 계산합니다.
 */
export function computePermitLeadPeriod(permitDateText: string | null | undefined, referenceDate: Date = new Date()): PermitLeadPeriod {
  if (!permitDateText) return "recent";
  const permitDate = new Date(permitDateText);
  if (Number.isNaN(permitDate.getTime())) return "recent";

  const startOfToday = new Date(referenceDate);
  startOfToday.setHours(0, 0, 0, 0);
  const dayOfWeek = startOfToday.getDay() || 7; // 일요일(0)을 7로 취급해 월요일 시작 주간을 계산
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - (dayOfWeek - 1));
  const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);

  if (permitDate >= startOfToday) return "today";
  if (permitDate >= startOfWeek) return "week";
  if (permitDate >= startOfMonth) return "month";
  return "recent";
}

function isPermitStatusActive(statusText?: string) {
  if (!statusText) return true;
  const inactiveKeywords = ["폐업", "말소", "취소", "영업정지", "직권말소", "휴업"];
  return !inactiveKeywords.some((keyword) => statusText.includes(keyword));
}

/**
 * v1 점수 산식입니다. 설계 문서의 6개 축 중 5개를 계산합니다: 인허가(개업일 우선) 신선도,
 * 업종 적합도, 연락처/주소 기반 영업 접근성은 실데이터로 바로 계산하고, 키워드 검색량·리뷰
 * 활성도는 외부 보강(네이버 데이터랩 검색량, 구글 리뷰) 값이 들어온 뒤부터 채워집니다
 * (2026-08-24, "영업리드는 영업이 잘되는지·리뷰가 좋은지가 중요하다" 피드백 반영).
 * 나머지 1개(동선 적합도)는 아직 계산 기반이 없어 0점으로 둡니다.
 * 보강 전 리드는 A등급(85점 이상)에 도달하기 어렵지만, 화면은 등급보다 "다음 액션"을
 * 우선 노출하므로(computePermitLeadNextAction 참고) 보강 전이라도 오늘 전화할 곳은 놓치지 않습니다.
 */
function computePermitLeadScoreBreakdown(input: {
  leadPeriod: PermitLeadPeriod;
  isTarget: boolean;
  industryKnown: boolean;
  hasPhone: boolean;
  hasAddress: boolean;
  keywordVolume?: number;
  reviewCount?: number;
  rating?: number;
}) {
  const freshness = input.leadPeriod === "today" ? 30 : input.leadPeriod === "week" ? 22 : input.leadPeriod === "month" ? 14 : 6;
  const industryFit = !input.isTarget ? 0 : input.industryKnown ? 20 : 10;
  const outreachFit = (input.hasPhone ? 6 : 0) + (input.hasAddress ? 2 : 0);

  // 검색량 지수(앵커 "커피"=100 기준 상대값)를 0~15점으로 환산합니다. 대부분의 개별 매장명은
  // 지수가 한 자릿수~수십 대라 15점 만점을 받는 경우는 드물고, 온라인에서 화제가 되는 매장만
  // 높은 점수를 받습니다.
  const keywordDemand =
    typeof input.keywordVolume === "number" && input.keywordVolume > 0 ? Math.min(15, Math.round(input.keywordVolume / 5)) : 0;

  // 리뷰 활성도는 평점(최대 8점)과 리뷰 수(최대 7점, 로그 스케일 — 리뷰 10개와 100개의 차이가
  // 100개와 1000개의 차이보다 체감상 크다고 보고 완만하게 늘어나도록 함)를 합산합니다.
  const ratingPoints = typeof input.rating === "number" && input.rating > 0 ? Math.round((Math.min(input.rating, 5) / 5) * 8) : 0;
  const reviewCountPoints =
    typeof input.reviewCount === "number" && input.reviewCount > 0 ? Math.min(7, Math.round(Math.log10(input.reviewCount + 1) * 3)) : 0;
  const placeActivity = ratingPoints + reviewCountPoints;

  return {
    license_freshness_score: freshness,
    industry_fit_score: industryFit,
    keyword_demand_score: keywordDemand,
    place_activity_score: placeActivity,
    route_fit_score: 0,
    outreach_fit_score: outreachFit
  };
}

function permitLeadGradeFromScore(scoreTotal: number): "A" | "B" | "C" | null {
  if (scoreTotal >= 85) return "A";
  if (scoreTotal >= 70) return "B";
  if (scoreTotal >= 55) return "C";
  return null;
}

/** 화면에 점수 대신 먼저 보여줄 "다음 액션"과 근거 3줄 이내를 계산합니다. */
function computePermitLeadNextAction(input: {
  isActive: boolean;
  isDuplicate: boolean;
  isTarget: boolean;
  industryKnown: boolean;
  leadPeriod: PermitLeadPeriod;
  hasPhone: boolean;
  hasAddress: boolean;
  industryPrimary: string;
}): { action: string; reasons: string[] } {
  if (!input.isActive) return { action: "제외 검토", reasons: ["사업장 상태가 폐업·휴업·영업정지 등 비활성"] };
  if (input.isDuplicate) return { action: "제외 검토", reasons: ["이미 등록된 거래처와 사업자번호 일치"] };
  if (!input.isTarget) return { action: "제외 검토", reasons: ["식자재 유통 영업 대상 업종이 아님"] };

  if (!input.hasAddress || !input.industryKnown) {
    const reasons: string[] = [];
    if (!input.hasAddress) reasons.push("주소 정보 부족");
    if (!input.industryKnown) reasons.push("업종 분류 확인 필요");
    if (!input.hasPhone) reasons.push("전화번호 없음");
    return { action: "정보 보강", reasons };
  }

  const periodLabel =
    input.leadPeriod === "today"
      ? "오늘 신규 인허가"
      : input.leadPeriod === "week"
        ? "이번 주 신규 인허가"
        : input.leadPeriod === "month"
          ? "이번 달 신규 인허가"
          : "최근 90일 신규 인허가";

  if (input.leadPeriod === "today" && input.hasPhone) {
    return { action: "오늘 바로 전화", reasons: [periodLabel, `${input.industryPrimary} 업종`, "전화번호 확인됨"] };
  }
  if (!input.hasPhone) {
    return { action: "오늘 DM 발송", reasons: [periodLabel, `${input.industryPrimary} 업종`, "전화번호 미확인 · 온라인 채널 확인 필요"] };
  }
  return { action: "전화·DM 검토", reasons: [periodLabel, `${input.industryPrimary} 업종`, "전화번호 확인됨"] };
}

function toPermitLeadItem(row: PermitLeadRow): PermitLeadItem {
  return {
    id: row.id,
    businessName: row.business_name,
    businessNumber: row.business_number || undefined,
    representativeName: row.representative_name || undefined,
    permitStatus: row.permit_status || undefined,
    isActive: row.is_active,
    permitDate: row.permit_date || undefined,
    openDate: row.open_date || undefined,
    address: row.address || undefined,
    phone: row.phone || undefined,
    jurisdiction: row.jurisdiction || undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    leadPeriod: row.lead_period,
    industryPrimary: row.industry_primary || "미분류",
    industryTags: row.industry_tags || [],
    isTargetIndustry: row.is_target_industry,
    isDuplicate: row.is_duplicate,
    matchedCustomerId: row.matched_customer_id || undefined,
    status: row.status,
    nextAction: row.next_action || undefined,
    nextActionReasons: row.next_action_reasons || [],
    excludeReason: row.exclude_reason || undefined,
    scoreTotal: row.score_total,
    scoreBreakdown: row.score_breakdown || {},
    grade: (row.grade as "A" | "B" | "C" | null) || null,
    naverPlaceUrl: row.naver_place_url || undefined,
    kakaoPlaceUrl: row.kakao_place_url || undefined,
    googlePlaceUrl: row.google_place_url || undefined,
    instagramUrl: row.instagram_url || undefined,
    reviewCount: row.review_count ?? undefined,
    rating: row.rating ?? undefined,
    keywordVolume: row.keyword_volume ?? undefined,
    source: row.source || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export type PermitLeadIngestResult = {
  total: number;
  inserted: number;
  updated: number;
  duplicates: number;
  excludedInactive: number;
  excludedNonTarget: number;
  skippedNoName: number;
};

const PERMIT_LEAD_UPDATE_CONCURRENCY = 8;

/**
 * 사업자 인허가 데이터 업로드(엑셀/CSV) 결과를 일괄 적재합니다. 이미 저장된 사업자번호는
 * 최신 인허가 상태로 갱신(upsert)하고, 처음 보는 사업자번호는 새 리드로 추가합니다.
 * 기존 거래처(normalized_customers)와 사업자번호가 일치하면 중복으로 표시하되 삭제하지 않고
 * "제외" 상태로 남겨 왜 제외됐는지 추적할 수 있게 합니다.
 */
export async function ingestPermitLeadRows(
  companyId: string,
  rows: PermitLeadIngestRow[],
  options: { source?: string } = {}
): Promise<PermitLeadIngestResult> {
  const result: PermitLeadIngestResult = {
    total: rows.length,
    inserted: 0,
    updated: 0,
    duplicates: 0,
    excludedInactive: 0,
    excludedNonTarget: 0,
    skippedNoName: 0
  };
  if (!rows.length || !isProductionStoreConfigured()) return result;

  await upsertCompany(companyId, "마주식자재");

  const businessNumbers = Array.from(new Set(rows.map((row) => normalizeBusinessNumber(row.businessNumber || "")).filter(Boolean)));
  const [existingCustomersByBizNo, existingLeadsByBizNo] = await Promise.all([
    businessNumbers.length
      ? supabaseRequest<Array<{ id: string; business_registration_number: string }>>(
          `normalized_customers?select=id,business_registration_number&company_id=eq.${encodeURIComponent(companyId)}&business_registration_number=in.(${businessNumbers
            .map(encodeURIComponent)
            .join(",")})`
        ).catch(() => [])
      : Promise.resolve([]),
    businessNumbers.length
      ? supabaseRequest<Array<{ id: string; business_number: string; keyword_volume: number | null; review_count: number | null; rating: number | null }>>(
          `business_permit_leads?select=id,business_number,keyword_volume,review_count,rating&company_id=eq.${encodeURIComponent(companyId)}&business_number=in.(${businessNumbers
            .map(encodeURIComponent)
            .join(",")})`
        ).catch(() => [])
      : Promise.resolve([])
  ]);
  const customerBizNoSet = new Set(existingCustomersByBizNo.map((row) => row.business_registration_number));
  const leadBizNoToId = new Map(existingLeadsByBizNo.map((row) => [row.business_number, row.id]));
  // 재수집(업데이트) 시 이미 보강된 검색량/리뷰 값을 점수 계산에 계속 반영하기 위한 조회맵입니다.
  // 이게 없으면 크론이 매일 같은 리드를 재수집할 때마다 keyword_demand_score/place_activity_score가
  // 0으로 리셋되어, 어렵게 보강한 점수가 다음 날 사라지는 문제가 생깁니다.
  const leadEnrichmentByBizNo = new Map(
    existingLeadsByBizNo.map((row) => [
      row.business_number,
      { keywordVolume: row.keyword_volume ?? undefined, reviewCount: row.review_count ?? undefined, rating: row.rating ?? undefined }
    ])
  );

  const today = new Date();
  const inserts: Record<string, unknown>[] = [];
  const updates: Array<{ id: string; payload: Record<string, unknown> }> = [];

  for (const row of rows) {
    const businessName = (row.businessName || "").trim();
    if (!businessName) {
      result.skippedNoName += 1;
      continue;
    }

    const businessNumber = normalizeBusinessNumber(row.businessNumber || "");
    const isActive = isPermitStatusActive(row.permitStatus);
    if (!isActive) result.excludedInactive += 1;

    const classification = classifyPermitLeadIndustry(row.industry || "", businessName);
    if (!classification.isTarget) result.excludedNonTarget += 1;

    const isDuplicate = businessNumber ? customerBizNoSet.has(businessNumber) : false;
    if (isDuplicate) result.duplicates += 1;

    // 프레시니스는 인허가일보다 개업일을 우선 씁니다("신규 리드는 개업일자가 중요하다"는 피드백,
    // 2026-08-24) — 인허가를 미리 받고 나중에 문을 여는 경우가 흔해서, 개업일이 실제 "방금 생긴
    // 잠재고객"을 더 정확히 나타냅니다. 개업일이 아직 없으면 인허가일로 대체합니다.
    const leadPeriod = computePermitLeadPeriod(row.openDate || row.permitDate, today);
    const industryKnown = classification.primary !== "미분류";
    const hasPhone = Boolean(row.phone);
    const hasAddress = Boolean(row.address);
    const priorEnrichment = businessNumber ? leadEnrichmentByBizNo.get(businessNumber) : undefined;

    const scoreBreakdown = computePermitLeadScoreBreakdown({
      leadPeriod,
      isTarget: classification.isTarget,
      industryKnown,
      hasPhone,
      hasAddress,
      keywordVolume: priorEnrichment?.keywordVolume,
      reviewCount: priorEnrichment?.reviewCount,
      rating: priorEnrichment?.rating
    });
    const scoreTotal = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);
    const grade = permitLeadGradeFromScore(scoreTotal);
    const nextAction = computePermitLeadNextAction({
      isActive,
      isDuplicate,
      isTarget: classification.isTarget,
      industryKnown,
      leadPeriod,
      hasPhone,
      hasAddress,
      industryPrimary: classification.primary
    });
    const excluded = !isActive || !classification.isTarget || isDuplicate;

    const payload = {
      company_id: companyId,
      business_name: businessName,
      business_number: businessNumber || null,
      representative_name: row.representativeName || null,
      permit_status: row.permitStatus || null,
      is_active: isActive,
      permit_date: toPostgresDate(row.permitDate),
      open_date: toPostgresDate(row.openDate) || toPostgresDate(row.permitDate),
      address: row.address || null,
      phone: row.phone || null,
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      jurisdiction: row.jurisdiction || null,
      source: options.source || "manual_upload",
      lead_period: leadPeriod,
      industry_raw: row.industry || null,
      industry_primary: classification.primary,
      industry_tags: classification.tags,
      is_target_industry: classification.isTarget,
      is_duplicate: isDuplicate,
      exclude_reason: !isActive
        ? "폐업·휴업 등 비활성 상태"
        : !classification.isTarget
          ? "영업 대상 업종 아님"
          : isDuplicate
            ? "이미 등록된 거래처(사업자번호 일치)"
            : null,
      status: excluded ? "제외" : "신규 수집",
      next_action: nextAction.action,
      next_action_reasons: nextAction.reasons,
      score_total: scoreTotal,
      score_breakdown: scoreBreakdown,
      grade,
      raw_payload: row,
      updated_at: new Date().toISOString()
    };

    const existingId = businessNumber ? leadBizNoToId.get(businessNumber) : undefined;
    if (existingId) updates.push({ id: existingId, payload });
    else inserts.push(payload);
  }

  if (inserts.length) {
    await supabaseRequest("business_permit_leads", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(inserts)
    });
    result.inserted = inserts.length;
  }
  // 2026-08-26 효율화: 기존 리드 갱신을 한 건씩 순차 PATCH하던 것을 mapWithConcurrency로 묶어
  // 동시에 처리합니다(각 요청 자체는 그대로 개별 PATCH라 동작은 동일, 왕복 대기 시간만 줄어듭니다).
  if (updates.length) {
    await mapWithConcurrency(updates, PERMIT_LEAD_UPDATE_CONCURRENCY, (update) =>
      supabaseRequest(`business_permit_leads?id=eq.${encodeURIComponent(update.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(update.payload)
      })
    );
  }
  result.updated = updates.length;

  return result;
}

const EMPTY_PERMIT_INGEST_RESULT: PermitLeadIngestResult = {
  total: 0,
  inserted: 0,
  updated: 0,
  duplicates: 0,
  excludedInactive: 0,
  excludedNonTarget: 0,
  skippedNoName: 0
};

export type GovRestaurantSyncResult = {
  configured: boolean;
  fetched: number;
  ingest: PermitLeadIngestResult;
};

/**
 * 행정안전부_식품_일반음식점 조회서비스(공공데이터포털, 전국 약 229만 건)에서 최근 변경분을
 * 가져와 ingestPermitLeadRows()로 흘려보냅니다. 수동 업로드와 완전히
 * 같은 파이프라인을 타며, GOV_RESTAURANT_API_KEY가 없으면 configured: false를 반환합니다.
 */
// 2026-08-28 피드백 대응(리드 야간 동기화가 실패해도 아무 표시가 없음): 성공·실패 여부와 시각을
// companies 테이블에 기록해, 신규 리드 화면에서 "마지막 동기화가 언제, 성공했는지"를 보여줄 수
// 있게 합니다. 기록 자체가 실패해도(컬럼 미존재 등) 조용히 무시해 본 동기화 로직에는 영향을
// 주지 않습니다.
async function recordLeadSyncStatus(companyId: string, source: "gov" | "seoul" | "kakao_keyword", status: "success" | "error", message?: string) {
  if (!isProductionStoreConfigured()) return;
  const prefix = source === "gov" ? "gov_restaurant_sync" : source === "seoul" ? "seoul_restaurant_sync" : "kakao_keyword_lead_sync";
  await supabaseRequest(`companies?id=eq.${encodeURIComponent(companyId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      [`${prefix}_last_at`]: new Date().toISOString(),
      [`${prefix}_last_status`]: status,
      [`${prefix}_last_message`]: message ? message.slice(0, 500) : null
    })
  }).catch(() => null);
}

export type LeadSyncStatus = {
  gov: { lastAt: string | null; status: string | null; message: string | null };
  seoul: { lastAt: string | null; status: string | null; message: string | null };
  kakaoKeyword: { lastAt: string | null; status: string | null; message: string | null };
};

export async function getLeadSyncStatus(companyId: string): Promise<LeadSyncStatus> {
  const empty: LeadSyncStatus = {
    gov: { lastAt: null, status: null, message: null },
    seoul: { lastAt: null, status: null, message: null },
    kakaoKeyword: { lastAt: null, status: null, message: null }
  };
  if (!isProductionStoreConfigured()) return empty;

  const rows = await supabaseRequest<
    Array<{
      gov_restaurant_sync_last_at: string | null;
      gov_restaurant_sync_last_status: string | null;
      gov_restaurant_sync_last_message: string | null;
      seoul_restaurant_sync_last_at: string | null;
      seoul_restaurant_sync_last_status: string | null;
      seoul_restaurant_sync_last_message: string | null;
      kakao_keyword_lead_sync_last_at: string | null;
      kakao_keyword_lead_sync_last_status: string | null;
      kakao_keyword_lead_sync_last_message: string | null;
    }>
  >(
    `companies?select=gov_restaurant_sync_last_at,gov_restaurant_sync_last_status,gov_restaurant_sync_last_message,seoul_restaurant_sync_last_at,seoul_restaurant_sync_last_status,seoul_restaurant_sync_last_message,kakao_keyword_lead_sync_last_at,kakao_keyword_lead_sync_last_status,kakao_keyword_lead_sync_last_message&id=eq.${encodeURIComponent(companyId)}&limit=1`
  ).catch(() => []);
  const row = rows[0];
  if (!row) return empty;

  return {
    gov: { lastAt: row.gov_restaurant_sync_last_at, status: row.gov_restaurant_sync_last_status, message: row.gov_restaurant_sync_last_message },
    seoul: { lastAt: row.seoul_restaurant_sync_last_at, status: row.seoul_restaurant_sync_last_status, message: row.seoul_restaurant_sync_last_message },
    kakaoKeyword: {
      lastAt: row.kakao_keyword_lead_sync_last_at,
      status: row.kakao_keyword_lead_sync_last_status,
      message: row.kakao_keyword_lead_sync_last_message
    }
  };
}

export async function syncGovRestaurantLeads(companyId: string, days = 3): Promise<GovRestaurantSyncResult> {
  if (!isGovRestaurantApiConfigured()) {
    return { configured: false, fetched: 0, ingest: EMPTY_PERMIT_INGEST_RESULT };
  }

  try {
    const rows = await fetchRecentGovRestaurantRows(days);
    const ingest = await ingestPermitLeadRows(companyId, rows, { source: "gov_restaurant_api" });
    await recordLeadSyncStatus(companyId, "gov", "success");
    return { configured: true, fetched: rows.length, ingest };
  } catch (error) {
    await recordLeadSyncStatus(companyId, "gov", "error", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export type GovRestaurantDailySyncResult = {
  configured: boolean;
  companiesProcessed: number;
  totalFetched: number;
  totalInserted: number;
  totalUpdated: number;
};

/** 일일 cron에서 모든 회사에 대해 전국 음식점 공공데이터 자동 수집을 실행합니다. */
export async function syncAllCompaniesGovRestaurantLeads(): Promise<GovRestaurantDailySyncResult> {
  const empty: GovRestaurantDailySyncResult = {
    configured: isGovRestaurantApiConfigured(),
    companiesProcessed: 0,
    totalFetched: 0,
    totalInserted: 0,
    totalUpdated: 0
  };
  if (!empty.configured || !isProductionStoreConfigured()) return empty;

  const companies = await supabaseRequest<Array<{ id: string }>>("companies?select=id").catch(() => []);
  // days=14(이 소스의 최대 조회 범위) — 스캔하는 구간(페이지 수)은 그대로고 그 안에서 걸러내는
  // 날짜 필터만 넓어지므로 비용 증가 없이 회수율만 올라갑니다(2026-08-23 피드백 대응).
  // 2026-08-28 피드백 대응: 회사 하나가 실패해도(네트워크 오류 등) Promise.all 전체가 reject되어
  // 나머지 회사까지 동기화를 건너뛰지 않도록 개별적으로 catch합니다(실패 상태는 recordLeadSyncStatus로
  // 이미 기록됨).
  const results = await Promise.all(
    companies.map((company) =>
      syncGovRestaurantLeads(company.id, 14).catch((): GovRestaurantSyncResult => ({ configured: true, fetched: 0, ingest: EMPTY_PERMIT_INGEST_RESULT }))
    )
  );

  return results.reduce<GovRestaurantDailySyncResult>(
    (total, result) => ({
      configured: true,
      companiesProcessed: total.companiesProcessed + 1,
      totalFetched: total.totalFetched + result.fetched,
      totalInserted: total.totalInserted + result.ingest.inserted,
      totalUpdated: total.totalUpdated + result.ingest.updated
    }),
    { ...empty, configured: true }
  );
}

export type SeoulRestaurantSyncResult = {
  configured: boolean;
  fetched: number;
  ingest: PermitLeadIngestResult;
};

/**
 * 서울 열린데이터광장(openapi.seoul.go.kr) "서울시 일반음식점 인허가 정보"에서 최근 변경분을
 * 가져와 ingestPermitLeadRows()로 흘려보냅니다. 좌표(X/Y)를 EPSG:5174→WGS84로 직접 변환해
 * 채우므로(lib/seoul-restaurant.ts) 카카오 지오코더를 다시 타지 않고 바로 지도에 표시됩니다.
 * SEOUL_OPENDATA_API_KEY가 없으면 configured: false를 반환합니다.
 */
export async function syncSeoulRestaurantLeads(companyId: string, days = 3): Promise<SeoulRestaurantSyncResult> {
  if (!isSeoulOpenDataConfigured()) {
    return { configured: false, fetched: 0, ingest: EMPTY_PERMIT_INGEST_RESULT };
  }

  try {
    const rows = await fetchRecentSeoulRestaurantRows(days);
    const ingest = await ingestPermitLeadRows(companyId, rows, { source: "seoul_opendata_api" });
    await recordLeadSyncStatus(companyId, "seoul", "success");
    return { configured: true, fetched: rows.length, ingest };
  } catch (error) {
    await recordLeadSyncStatus(companyId, "seoul", "error", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export type SeoulRestaurantDailySyncResult = {
  configured: boolean;
  companiesProcessed: number;
  totalFetched: number;
  totalInserted: number;
  totalUpdated: number;
};

/** 일일 cron에서 모든 회사에 대해 서울시 음식점 공공데이터 자동 수집을 실행합니다. */
export async function syncAllCompaniesSeoulRestaurantLeads(): Promise<SeoulRestaurantDailySyncResult> {
  const empty: SeoulRestaurantDailySyncResult = {
    configured: isSeoulOpenDataConfigured(),
    companiesProcessed: 0,
    totalFetched: 0,
    totalInserted: 0,
    totalUpdated: 0
  };
  if (!empty.configured || !isProductionStoreConfigured()) return empty;

  const companies = await supabaseRequest<Array<{ id: string }>>("companies?select=id").catch(() => []);
  // days=14(이 소스의 최대 조회 범위) — 행정안전부 소스와 같은 이유로 비용 증가 없이 회수율만
  // 올라갑니다(2026-08-23 피드백 대응).
  // 2026-08-28 피드백 대응: 회사 하나가 실패해도 나머지 회사 동기화를 건너뛰지 않도록 개별적으로
  // catch합니다(실패 상태는 recordLeadSyncStatus로 이미 기록됨).
  const results = await Promise.all(
    companies.map((company) =>
      syncSeoulRestaurantLeads(company.id, 14).catch((): SeoulRestaurantSyncResult => ({ configured: true, fetched: 0, ingest: EMPTY_PERMIT_INGEST_RESULT }))
    )
  );

  return results.reduce<SeoulRestaurantDailySyncResult>(
    (total, result) => ({
      configured: true,
      companiesProcessed: total.companiesProcessed + 1,
      totalFetched: total.totalFetched + result.fetched,
      totalInserted: total.totalInserted + result.ingest.inserted,
      totalUpdated: total.totalUpdated + result.ingest.updated
    }),
    { ...empty, configured: true }
  );
}

export type CompanyLeadSearchRegion = {
  id: string;
  companyId: string;
  label: string;
  latitude?: number;
  longitude?: number;
  createdAt: string;
};

export async function getCompanyLeadSearchRegions(companyId: string): Promise<CompanyLeadSearchRegion[]> {
  if (!isProductionStoreConfigured()) return [];
  const rows = await supabaseRequest<
    Array<{ id: string; company_id: string; label: string; latitude: number | null; longitude: number | null; created_at: string }>
  >(`company_lead_search_regions?select=*&company_id=eq.${encodeURIComponent(companyId)}&order=created_at.desc`).catch(() => []);
  return rows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    label: row.label,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    createdAt: row.created_at
  }));
}

/**
 * 고객사가 직접 입력한 확장 탐색 지역(예: "서울 마포구 합정동")을 저장합니다. 좌표는 저장 시점에
 * 한 번만 geocodeRegionLabel로 확정해두고(재탐색마다 다시 지오코딩하지 않음), 좌표를 못 찾아도
 * 지역명은 저장합니다 — 화면에서 "좌표 확인 필요"로 표시하고, 탐색 시에는 좌표 없는 지역은 건너뜁니다.
 */
export async function addCompanyLeadSearchRegion(companyId: string, label: string): Promise<CompanyLeadSearchRegion> {
  const trimmed = label.trim();
  if (!trimmed) throw new Error("지역명을 입력해주세요.");
  if (!isProductionStoreConfigured()) {
    return { id: globalThis.crypto.randomUUID(), companyId, label: trimmed, createdAt: new Date().toISOString() };
  }

  const point = await geocodeRegionLabel(trimmed).catch(() => null);
  const rows = await supabaseRequest<
    Array<{ id: string; company_id: string; label: string; latitude: number | null; longitude: number | null; created_at: string }>
  >("company_lead_search_regions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([
      {
        company_id: companyId,
        label: trimmed,
        latitude: point?.lat ?? null,
        longitude: point?.lng ?? null
      }
    ])
  });
  const row = rows[0];
  return {
    id: row.id,
    companyId: row.company_id,
    label: row.label,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    createdAt: row.created_at
  };
}

export async function removeCompanyLeadSearchRegion(companyId: string, regionId: string): Promise<void> {
  if (!isProductionStoreConfigured()) return;
  await supabaseRequest(`company_lead_search_regions?id=eq.${encodeURIComponent(regionId)}&company_id=eq.${encodeURIComponent(companyId)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  }).catch(() => null);
}

export type KakaoKeywordLeadSweepResult = {
  configured: boolean;
  anchorsUsed: number;
  callsMade: number;
  candidatesFound: number;
  ingest: PermitLeadIngestResult;
};

const EMPTY_KEYWORD_SWEEP_INGEST: PermitLeadIngestResult = {
  total: 0,
  inserted: 0,
  updated: 0,
  duplicates: 0,
  excludedInactive: 0,
  excludedNonTarget: 0,
  skippedNoName: 0
};

function normalizeLeadNameForDedupe(value: string) {
  return value.toLowerCase().replace(/\s/g, "").replace(/[^0-9a-z가-힣]/g, "");
}

/**
 * "영업리드(신규리드, 개업일자 아님)" — 2026-08-31 피드백: 개업일자와 무관하게 이미 운영 중인
 * 매장까지 카카오 로컬 키워드 검색으로 찾아 business_permit_leads에 채워 넣습니다.
 *
 * 기준점(anchor)은 (1) 반경 자동 — 등록된 거래처 좌표, (2) 고객사가 직접 등록한 확장 탐색 지역
 * 두 종류를 합쳐서 씁니다("둘 다 지원" 피드백). 다만 (1)은 매번 TMAP 지오코딩이 필요해 비용이
 * 드는데, 기존 코드도 같은 이유로 "추천 점수 갱신"(전체 거래처 반경 지오코딩)을 자동 실행하지
 * 않고 버튼으로만 제공합니다 — 같은 원칙으로:
 *   - mode="manual"(화면의 "영업리드 추가 탐색" 버튼): 거래처 반경 지오코딩 + 저장된 지역을 모두 씁니다.
 *   - mode="auto"(야간 cron): 이미 좌표가 확정된 저장 지역만 씁니다(추가 지오코딩 비용 없음).
 *     저장된 지역이 없으면 그날은 조용히 건너뜁니다 — 고객사가 지역을 등록해두면 그때부터
 *     야간 자동 탐색이 시작됩니다.
 *
 * 카카오 키워드 검색은 사업자등록번호를 주지 않아 기존 ingestPermitLeadRows의 사업자번호 기준
 * 중복 방지를 탈 수 없으므로, 이름 정규화 기준으로(기존 거래처, 기존 리드 전체, 이번 탐색 배치
 * 내부) 3중 중복 제거를 이 함수에서 직접 합니다.
 */
export async function runKakaoKeywordLeadSweep(
  companyId: string,
  options: { mode: "manual" | "auto"; radiusMeters?: number } = { mode: "manual" }
): Promise<KakaoKeywordLeadSweepResult> {
  const empty: KakaoKeywordLeadSweepResult = {
    configured: isKakaoKeywordLeadSearchConfigured(),
    anchorsUsed: 0,
    callsMade: 0,
    candidatesFound: 0,
    ingest: EMPTY_KEYWORD_SWEEP_INGEST
  };
  if (!empty.configured || !isProductionStoreConfigured()) return empty;

  try {
    // 1) 기준점 후보를 모읍니다.
    const savedRegions = await getCompanyLeadSearchRegions(companyId);
    const regionAnchors: Array<{ label: string; point: GeoPoint }> = savedRegions
      .filter((region) => typeof region.latitude === "number" && typeof region.longitude === "number")
      .map((region) => ({ label: region.label, point: { lat: region.latitude as number, lng: region.longitude as number } }));

    const customerAnchors: Array<{ label: string; point: GeoPoint }> = [];
    if (options.mode === "manual") {
      // 반경 자동(등록 거래처)은 수동 버튼에서만 지오코딩합니다(TMAP 호출 비용 때문에 야간 자동
      // 실행에서는 제외 — handleRecommendationRefresh와 같은 원칙).
      const customerMaster = await getCustomerMaster(companyId);
      const activeCustomers = customerMaster.customers.filter(
        (customer) => customer.address?.trim() && customer.businessStatus !== "closed" && customer.relationshipStatus !== "거래종료"
      );
      const customerAnchorCandidates = activeCustomers.slice(0, 30);
      const customerPoints = await mapWithConcurrency(customerAnchorCandidates, NEARBY_LEAD_GEOCODE_CONCURRENCY, (customer) =>
        resolveAddressPoint(customer.address!)
      );
      customerAnchorCandidates.forEach((customer, index) => {
        const point = customerPoints[index];
        if (point) customerAnchors.push({ label: customer.customerName, point });
      });
    }

    const allAnchors = [...customerAnchors, ...regionAnchors];
    if (!allAnchors.length) return { ...empty, configured: true };

    // 2) 기준점 개수를 상한선 안으로 자릅니다. 자동(야간 cron) 모드는 회전 커서로 매일 다른
    // 저장 지역 묶음을 훑어(gov-restaurant/seoul-restaurant와 같은 회전 패턴) 하루 호출량을 억제합니다.
    const MANUAL_MAX_ANCHORS = 20;
    const AUTO_ANCHORS_PER_RUN = 3;
    let anchorsToUse: Array<{ label: string; point: GeoPoint }>;
    let nextCursor = 0;

    if (options.mode === "manual") {
      anchorsToUse = allAnchors.slice(0, MANUAL_MAX_ANCHORS);
    } else {
      const cursorRows = await supabaseRequest<Array<{ kakao_keyword_lead_sweep_cursor: number | null }>>(
        `companies?select=kakao_keyword_lead_sweep_cursor&id=eq.${encodeURIComponent(companyId)}&limit=1`
      ).catch(() => []);
      const cursor = cursorRows[0]?.kakao_keyword_lead_sweep_cursor || 0;
      const start = cursor % allAnchors.length;
      anchorsToUse = [];
      for (let i = 0; i < Math.min(AUTO_ANCHORS_PER_RUN, allAnchors.length); i += 1) {
        anchorsToUse.push(allAnchors[(start + i) % allAnchors.length]);
      }
      nextCursor = (start + AUTO_ANCHORS_PER_RUN) % allAnchors.length;
    }

    // 3) 기존 거래처/기존 리드 이름을 미리 조회해 중복 후보를 걸러낼 준비를 합니다.
    const [existingCustomerRows, existingLeadRows] = await Promise.all([
      supabaseRequest<Array<{ customer_name: string }>>(
        `normalized_customers?select=customer_name&company_id=eq.${encodeURIComponent(companyId)}`
      ).catch(() => []),
      supabaseRequest<Array<{ business_name: string }>>(
        `business_permit_leads?select=business_name&company_id=eq.${encodeURIComponent(companyId)}`
      ).catch(() => [])
    ]);
    const knownNames = new Set<string>([
      ...existingCustomerRows.map((row) => normalizeLeadNameForDedupe(row.customer_name)),
      ...existingLeadRows.map((row) => normalizeLeadNameForDedupe(row.business_name))
    ]);

    // 4) 기준점 × 업종 키워드로 카카오 로컬 키워드 검색을 돌립니다.
    const radiusMeters = options.radiusMeters || 2000;
    let callsMade = 0;
    const candidateRows: PermitLeadIngestRow[] = [];
    const seenInBatch = new Set<string>();

    for (const anchor of anchorsToUse) {
      for (const rule of PERMIT_INDUSTRY_RULES) {
        callsMade += 1;
        // eslint-disable-next-line no-await-in-loop
        const results = await searchKakaoKeywordLeads(anchor.point, rule.primary, radiusMeters);
        for (const candidate of results) {
          const normalizedName = normalizeLeadNameForDedupe(candidate.businessName);
          if (!normalizedName || knownNames.has(normalizedName) || seenInBatch.has(normalizedName)) continue;
          seenInBatch.add(normalizedName);
          candidateRows.push({
            businessName: candidate.businessName,
            address: candidate.address,
            phone: candidate.phone || undefined,
            industry: rule.primary,
            latitude: candidate.latitude,
            longitude: candidate.longitude,
            jurisdiction: anchor.label
          });
        }
      }
    }

    const ingest = await ingestPermitLeadRows(companyId, candidateRows, { source: "kakao_keyword_search" });

    if (options.mode === "auto") {
      await supabaseRequest(`companies?id=eq.${encodeURIComponent(companyId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ kakao_keyword_lead_sweep_cursor: nextCursor })
      }).catch(() => null);
    }

    await recordLeadSyncStatus(companyId, "kakao_keyword", "success");

    return {
      configured: true,
      anchorsUsed: anchorsToUse.length,
      callsMade,
      candidatesFound: candidateRows.length,
      ingest
    };
  } catch (error) {
    await recordLeadSyncStatus(companyId, "kakao_keyword", "error", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export type KakaoKeywordLeadDailySyncResult = {
  configured: boolean;
  companiesProcessed: number;
  totalCandidates: number;
  totalInserted: number;
};

/** 일일 cron에서 모든 회사에 대해 영업리드(카카오 키워드 탐색) 자동 수집을 실행합니다(회전 방식, 회사당 소량). */
export async function syncAllCompaniesKakaoKeywordLeads(): Promise<KakaoKeywordLeadDailySyncResult> {
  const empty: KakaoKeywordLeadDailySyncResult = {
    configured: isKakaoKeywordLeadSearchConfigured(),
    companiesProcessed: 0,
    totalCandidates: 0,
    totalInserted: 0
  };
  if (!empty.configured || !isProductionStoreConfigured()) return empty;

  const companies = await supabaseRequest<Array<{ id: string }>>("companies?select=id").catch(() => []);
  const results = await Promise.all(
    companies.map((company) =>
      runKakaoKeywordLeadSweep(company.id, { mode: "auto" }).catch(
        (): KakaoKeywordLeadSweepResult => ({ configured: true, anchorsUsed: 0, callsMade: 0, candidatesFound: 0, ingest: EMPTY_KEYWORD_SWEEP_INGEST })
      )
    )
  );

  return results.reduce<KakaoKeywordLeadDailySyncResult>(
    (total, result) => ({
      configured: true,
      companiesProcessed: total.companiesProcessed + 1,
      totalCandidates: total.totalCandidates + result.candidatesFound,
      totalInserted: total.totalInserted + result.ingest.inserted
    }),
    { ...empty, configured: true }
  );
}

export type PermitLeadFilters = {
  action?: string;
  excludeExcluded?: boolean;
  grade?: string;
  hasPhone?: boolean;
  industry?: string;
  limit?: number;
  period?: PermitLeadPeriod | "all";
  status?: string;
};

export async function listPermitLeads(companyId: string, filters: PermitLeadFilters = {}): Promise<{ leads: PermitLeadItem[]; total: number }> {
  if (!isProductionStoreConfigured()) return { leads: [], total: 0 };

  const params = [`company_id=eq.${encodeURIComponent(companyId)}`];
  if (filters.period && filters.period !== "all") params.push(`lead_period=eq.${encodeURIComponent(filters.period)}`);
  if (filters.industry) params.push(`industry_primary=eq.${encodeURIComponent(filters.industry)}`);
  if (filters.action) params.push(`next_action=eq.${encodeURIComponent(filters.action)}`);
  if (filters.status) params.push(`status=eq.${encodeURIComponent(filters.status)}`);
  if (filters.grade) params.push(`grade=eq.${encodeURIComponent(filters.grade)}`);
  if (filters.excludeExcluded) params.push(`status=neq.제외`);
  const limit = Math.min(500, filters.limit || 300);

  const rows = await supabaseRequest<PermitLeadRow[]>(
    `business_permit_leads?select=*&${params.join("&")}&order=score_total.desc,permit_date.desc.nullslast&limit=${limit}`
  ).catch(() => []);

  let leads = rows.map(toPermitLeadItem);
  if (filters.hasPhone) leads = leads.filter((lead) => Boolean(lead.phone));

  return { leads, total: leads.length };
}

function extractPermitLeadRegionKey(address?: string) {
  if (!address) return null;
  const parts = address.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).join(" ") || null;
}

export type PermitLeadQueues = {
  callToday: PermitLeadItem[];
  dmCandidates: PermitLeadItem[];
  needsEnrichment: PermitLeadItem[];
  quoteFollowUps: PermitLeadItem[];
  quoteRequests: PermitLeadItem[];
  summary: {
    active: number;
    gradeA: number;
    hasPhone: number;
    quoteFollowUps: number;
    quoteRequests: number;
    todayNew: number;
    total: number;
  };
  visitThisWeek: PermitLeadItem[];
};

/**
 * 화면 첫 진입 시 보여줄 4개 액션 큐입니다. 점수 순이 아니라 "오늘 뭘 할지"로 먼저 나눕니다.
 * 방문 큐는 같은 동/구역(주소 앞 2단어 기준)에 리드가 3곳 이상 밀집된 경우만 넣어 코스로
 * 묶일 때만 방문을 권장합니다. 큐당 기본 20곳까지만 노출해 하루 작업량을 넘기지 않습니다.
 */
export async function getPermitLeadQueues(companyId: string, limitPerQueue = 20): Promise<PermitLeadQueues> {
  const { leads } = await listPermitLeads(companyId, { excludeExcluded: true, limit: 500 });
  const active = leads.filter((lead) => lead.status !== "제외" && lead.isActive);

  const regionCounts = new Map<string, number>();
  for (const lead of active) {
    const key = extractPermitLeadRegionKey(lead.address);
    if (key) regionCounts.set(key, (regionCounts.get(key) || 0) + 1);
  }

  const callToday = active.filter((lead) => lead.nextAction === "오늘 바로 전화").slice(0, limitPerQueue);
  const dmCandidates = active.filter((lead) => lead.nextAction === "오늘 DM 발송").slice(0, limitPerQueue);
  const needsEnrichment = active.filter((lead) => lead.nextAction === "정보 보강").slice(0, limitPerQueue);
  const quoteRequests = active.filter((lead) => lead.status === "견적 요청").slice(0, limitPerQueue);
  const quoteFollowUps = active.filter((lead) => lead.status === "견적 발송" || lead.status === "재연락 예정").slice(0, limitPerQueue);
  const visitThisWeek = active
    .filter((lead) => lead.nextAction !== "오늘 바로 전화" && lead.nextAction !== "오늘 DM 발송" && lead.nextAction !== "정보 보강")
    .filter((lead) => lead.status !== "견적 요청" && lead.status !== "견적 발송" && lead.status !== "재연락 예정")
    .filter((lead) => {
      const key = extractPermitLeadRegionKey(lead.address);
      return Boolean(key && (regionCounts.get(key) || 0) >= 3);
    })
    .slice(0, limitPerQueue);

  return {
    callToday,
    dmCandidates,
    needsEnrichment,
    quoteFollowUps,
    quoteRequests,
    visitThisWeek,
    summary: {
      total: leads.length,
      active: active.length,
      gradeA: active.filter((lead) => lead.grade === "A").length,
      todayNew: active.filter((lead) => lead.leadPeriod === "today").length,
      quoteFollowUps: quoteFollowUps.length,
      quoteRequests: quoteRequests.length,
      hasPhone: active.filter((lead) => Boolean(lead.phone)).length
    }
  };
}

export type PermitLeadActionType = "call" | "dm" | "visit" | "hold" | "exclude" | "quote";

const PERMIT_LEAD_ACTION_TO_STATUS: Record<PermitLeadActionType, string> = {
  call: "전화 대상",
  dm: "DM 대상",
  exclude: "제외",
  hold: "검토 필요",
  quote: "견적 요청",
  visit: "방문 대상"
};

const PERMIT_LEAD_RESULT_TO_STATUS: Record<string, string> = {
  "통화 성공": "연락 완료",
  부재중: "전화 대상",
  "DM 발송": "DM 발송",
  "관심 있음": "미팅 예정",
  "견적 요청": "견적 요청",
  "견적 발송": "견적 발송",
  "재연락 예정": "재연락 예정",
  "다음 방문": "방문 대상",
  보류: "검토 필요",
  거절: "제외",
  제외: "제외"
};

/** 전화/DM/방문/보류/제외 등 영업 행동을 기록하고, 그 결과로 리드 상태를 갱신합니다. */
export async function recordPermitLeadAction(
  companyId: string,
  leadId: string,
  input: { actionType: PermitLeadActionType; actorName?: string; memo?: string; result?: string }
): Promise<{ action?: PermitLeadActionItem; ok: boolean; status: string }> {
  if (!isProductionStoreConfigured()) return { ok: false, status: "" };

  const actionRows = await supabaseRequest<PermitLeadActionRow[]>("lead_actions?select=id,action_type,result,memo,actor_name,created_at", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: companyId,
      lead_id: leadId,
      action_type: input.actionType,
      result: input.result || null,
      memo: input.memo || null,
      actor_name: input.actorName || null
    })
  });

  const nextStatus = (input.result && PERMIT_LEAD_RESULT_TO_STATUS[input.result]) || PERMIT_LEAD_ACTION_TO_STATUS[input.actionType] || "검토 필요";
  await supabaseRequest(
    `business_permit_leads?id=eq.${encodeURIComponent(leadId)}&company_id=eq.${encodeURIComponent(companyId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: nextStatus, updated_at: new Date().toISOString() })
    }
  );

  return { action: actionRows?.[0] ? toPermitLeadActionItem(actionRows[0]) : undefined, ok: true, status: nextStatus };
}

export async function listPermitLeadActions(companyId: string, leadId: string, limit = 12): Promise<PermitLeadActionItem[]> {
  if (!isProductionStoreConfigured()) return [];

  const safeLimit = Math.max(1, Math.min(50, limit));
  const rows = await supabaseRequest<PermitLeadActionRow[]>(
    `lead_actions?select=id,action_type,result,memo,actor_name,created_at&company_id=eq.${encodeURIComponent(companyId)}&lead_id=eq.${encodeURIComponent(
      leadId
    )}&order=created_at.desc&limit=${safeLimit}`
  ).catch(() => []);

  return rows.map(toPermitLeadActionItem);
}

function toPermitLeadActionItem(row: PermitLeadActionRow): PermitLeadActionItem {
  return {
    id: row.id,
    actionType: row.action_type,
    result: row.result || undefined,
    memo: row.memo || undefined,
    actorName: row.actor_name || undefined,
    createdAt: new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
  };
}

/** 잘못 들어온 리드(테스트 데이터, 완전한 오탐 등)를 완전히 삭제합니다. 목록에서 숨기고 싶을 뿐이면
 * exclude 액션(recordPermitLeadAction)을 쓰고, 이 함수는 데이터 자체를 지워야 할 때만 씁니다. */
export async function deletePermitLead(companyId: string, leadId: string): Promise<{ ok: boolean }> {
  if (!isProductionStoreConfigured()) return { ok: false };

  await supabaseRequest(`business_permit_leads?id=eq.${encodeURIComponent(leadId)}&company_id=eq.${encodeURIComponent(companyId)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });

  return { ok: true };
}

export async function updatePermitLeadProfile(
  companyId: string,
  leadId: string,
  input: { instagramUrl?: string | null }
): Promise<{ lead?: PermitLeadItem; ok: boolean; message?: string }> {
  if (!isProductionStoreConfigured()) return { ok: false, message: "데이터베이스가 연결되어 있지 않습니다." };

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("instagramUrl" in input) payload.instagram_url = input.instagramUrl || null;

  const updatedRows = await supabaseRequest<PermitLeadRow[]>(
    `business_permit_leads?id=eq.${encodeURIComponent(leadId)}&company_id=eq.${encodeURIComponent(companyId)}&select=*`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload)
    }
  );

  await supabaseRequest("lead_actions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      company_id: companyId,
      lead_id: leadId,
      action_type: "hold",
      result: "인스타 정보 수정",
      memo: input.instagramUrl ? `인스타: ${input.instagramUrl}` : "인스타 정보 삭제",
      actor_name: "MAJU"
    })
  }).catch(() => null);

  return { lead: updatedRows?.[0] ? toPermitLeadItem(updatedRows[0]) : undefined, ok: true };
}

/**
 * "영업리드 > 키워드 검색량 순" 정렬(2026-08-20 피드백)을 위해, 지정한 리드들의 거래처명으로
 * 네이버 데이터랩 검색어 트렌드를 조회해 keyword_volume 컬럼을 채웁니다. 이미 채워진(0이 아닌)
 * 리드는 다시 조회하지 않아 API 호출을 아낍니다 — 화면에서 "검색량순" 정렬을 처음 켤 때만 비용이
 * 들고, 그다음부터는 DB에 저장된 값을 그대로 씁니다. 키가 없거나 조회에 실패해도 throw하지 않고
 * 빈 맵을 돌려주므로 호출하는 쪽(API 라우트)에서 항상 안전하게 호출할 수 있습니다.
 */
export async function enrichPermitLeadKeywordVolume(companyId: string, leadIds: string[]): Promise<Record<string, number>> {
  if (!isProductionStoreConfigured() || !leadIds.length) return {};
  if (!isNaverDatalabConfigured()) return {};

  const idsParam = leadIds.map((id) => encodeURIComponent(id)).join(",");
  const rows = await supabaseRequest<
    Array<{
      id: string;
      business_name: string;
      keyword_volume: number | null;
      review_count: number | null;
      rating: number | null;
      phone: string | null;
      address: string | null;
      lead_period: PermitLeadPeriod;
      is_target_industry: boolean;
      industry_primary: string | null;
    }>
  >(
    `business_permit_leads?select=id,business_name,keyword_volume,review_count,rating,phone,address,lead_period,is_target_industry,industry_primary&company_id=eq.${encodeURIComponent(companyId)}&id=in.(${idsParam})`
  ).catch(() => []);

  const alreadyScored: Record<string, number> = {};
  const needsScore = rows.filter((row) => {
    if (typeof row.keyword_volume === "number" && row.keyword_volume > 0) {
      alreadyScored[row.id] = row.keyword_volume;
      return false;
    }
    return true;
  });
  if (!needsScore.length) return alreadyScored;

  const nameToScore = await fetchKeywordVolumeScores(needsScore.map((row) => row.business_name));

  const updates: Array<{ id: string; score: number; row: (typeof needsScore)[number] }> = [];
  needsScore.forEach((row) => {
    const score = nameToScore[row.business_name];
    if (typeof score === "number") updates.push({ id: row.id, score, row });
  });

  // 검색량을 새로 채운 리드는 점수도 같이 다시 계산해 저장합니다(그래야 "영업리드" 정렬이 실제
  // 검색량순으로 반영되고, 인허가 목록의 등급·다음 액션에도 반영됨). 나머지 값(리뷰 등)은 그대로
  // 유지합니다.
  await Promise.all(
    updates.map((update) => {
      const scoreBreakdown = computePermitLeadScoreBreakdown({
        leadPeriod: update.row.lead_period,
        isTarget: update.row.is_target_industry,
        industryKnown: (update.row.industry_primary || "미분류") !== "미분류",
        hasPhone: Boolean(update.row.phone),
        hasAddress: Boolean(update.row.address),
        keywordVolume: update.score,
        reviewCount: update.row.review_count ?? undefined,
        rating: update.row.rating ?? undefined
      });
      const scoreTotal = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);
      return supabaseRequest(`business_permit_leads?id=eq.${encodeURIComponent(update.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          keyword_volume: update.score,
          score_total: scoreTotal,
          score_breakdown: scoreBreakdown,
          grade: permitLeadGradeFromScore(scoreTotal),
          updated_at: new Date().toISOString()
        })
      }).catch(() => null);
    })
  );

  const result: Record<string, number> = { ...alreadyScored };
  updates.forEach((update) => {
    result[update.id] = update.score;
  });
  return result;
}

export type PermitLeadExternalEnrichmentResult = {
  lead?: PermitLeadItem;
  message?: string;
  ok: boolean;
  persisted: boolean;
  skippedFields?: string[];
  sources: {
    googleReviews: boolean;
    keywordVolume: boolean;
    placeLinks: boolean;
  };
};

/**
 * 신규 리드의 영업 전 확인값을 외부 API로 보강합니다.
 * - 카카오/네이버/구글 검색 링크는 resolvePlaceLinks()의 graceful fallback을 그대로 사용합니다.
 * - Google Places API가 연결되어 있으면 리뷰 수/평점을 저장합니다.
 * - 네이버 검색량 API가 연결되어 있으면 keyword_volume을 저장합니다.
 * 어떤 API가 실패해도 나머지 값은 저장하고, DB 컬럼이 아직 없으면 실패 메시지만 돌려줍니다.
 */
export async function enrichPermitLeadExternalInfo(companyId: string, leadId: string): Promise<PermitLeadExternalEnrichmentResult> {
  const emptySources = { googleReviews: false, keywordVolume: false, placeLinks: false };
  if (!isProductionStoreConfigured()) {
    return { ok: false, persisted: false, sources: emptySources, message: "데이터베이스가 연결되어 있지 않습니다." };
  }

  const rows = await supabaseRequest<PermitLeadRow[]>(
    `business_permit_leads?select=*&id=eq.${encodeURIComponent(leadId)}&company_id=eq.${encodeURIComponent(companyId)}&limit=1`
  ).catch(() => []);
  const row = rows[0];
  if (!row) return { ok: false, persisted: false, sources: emptySources, message: "리드를 찾을 수 없습니다." };

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const sources = { ...emptySources };

  const placeLinks = await resolvePlaceLinks(
    { address: row.address || undefined, customerName: row.business_name },
    {
      googleMapUrl: row.google_place_url || undefined,
      kakaoPlaceUrl: row.kakao_place_url || undefined,
      naverPlaceUrl: row.naver_place_url || undefined
    }
  ).catch(() => null);

  if (placeLinks) {
    payload.naver_place_url = placeLinks.naverPlaceUrl || row.naver_place_url;
    payload.kakao_place_url = placeLinks.kakaoPlaceUrl || row.kakao_place_url;
    payload.google_place_url = placeLinks.googleMapUrl || row.google_place_url;
    if (!row.phone && placeLinks.enrichedPhone) payload.phone = placeLinks.enrichedPhone;
    if ((!row.industry_primary || row.industry_primary === "미분류") && placeLinks.enrichedIndustry) payload.industry_primary = placeLinks.enrichedIndustry;
    // 주소 미확인 리드 보강(2026-08-24 피드백: "영업리드들의 정보들이 비어져있는게 많네") — 인허가
    // 원본 데이터에 주소가 없을 때만 카카오 로컬 검색 결과의 도로명/지번 주소로 채웁니다.
    if (!row.address && placeLinks.enrichedAddress) payload.address = placeLinks.enrichedAddress;
    sources.placeLinks = Boolean(payload.naver_place_url || payload.kakao_place_url || payload.google_place_url);
  }

  const googleReviews = await syncGoogleReviewsForCustomer({ customerName: row.business_name, address: row.address || undefined }).catch(() => null);
  if (googleReviews) {
    payload.review_count = googleReviews.userRatingsTotal ?? googleReviews.reviewCount;
    payload.rating = googleReviews.rating;
    sources.googleReviews = Boolean(googleReviews.userRatingsTotal || googleReviews.reviewCount || googleReviews.rating);
  }

  if (isNaverDatalabConfigured()) {
    const scores = await fetchKeywordVolumeScores([row.business_name]).catch((): Record<string, number> => ({}));
    const score = scores[row.business_name];
    if (typeof score === "number") {
      payload.keyword_volume = score;
      sources.keywordVolume = true;
    }
  }

  // 방금 보강한 값(payload)을 기존 값(row)에 덮어써서 점수를 다시 계산합니다 — "영업리드는
  // 영업이 잘되는지·리뷰가 좋은지가 중요하다"는 피드백(2026-08-24)을 반영해 keyword_demand_score/
  // place_activity_score가 이 시점부터 실제 값을 반영하게 됩니다.
  {
    const industryKnown = (row.industry_primary || "미분류") !== "미분류";
    const scoreBreakdown = computePermitLeadScoreBreakdown({
      leadPeriod: row.lead_period,
      isTarget: row.is_target_industry,
      industryKnown,
      hasPhone: Boolean((payload.phone as string | undefined) ?? row.phone),
      hasAddress: Boolean((payload.address as string | undefined) ?? row.address),
      keywordVolume: (payload.keyword_volume as number | undefined) ?? row.keyword_volume ?? undefined,
      reviewCount: (payload.review_count as number | undefined) ?? row.review_count ?? undefined,
      rating: (payload.rating as number | undefined) ?? row.rating ?? undefined
    });
    payload.score_total = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);
    payload.score_breakdown = scoreBreakdown;
    payload.grade = permitLeadGradeFromScore(payload.score_total as number);
  }

  const externalFieldKeys = [
    "naver_place_url",
    "kakao_place_url",
    "google_place_url",
    "review_count",
    "rating",
    "keyword_volume"
  ];
  const profileFieldKeys = ["phone", "industry_primary", "address"];
  const payloadTiers = [
    Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined)),
    Object.fromEntries(Object.entries(payload).filter(([key, value]) => value !== undefined && !externalFieldKeys.includes(key))),
    Object.fromEntries(Object.entries(payload).filter(([key, value]) => value !== undefined && !externalFieldKeys.includes(key) && !profileFieldKeys.includes(key))),
    { updated_at: payload.updated_at }
  ];

  let updatedRows: PermitLeadRow[] | undefined;
  let persisted = false;
  let skippedFields: string[] = [];
  for (let index = 0; index < payloadTiers.length; index += 1) {
    const tier = payloadTiers[index];
    try {
      updatedRows = await supabaseRequest<PermitLeadRow[]>(
        `business_permit_leads?id=eq.${encodeURIComponent(leadId)}&company_id=eq.${encodeURIComponent(companyId)}&select=*`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(tier)
        }
      );
      persisted = true;
      if (index === 1) skippedFields = externalFieldKeys.filter((key) => key in payload);
      if (index === 2) skippedFields = [...externalFieldKeys, ...profileFieldKeys].filter((key) => key in payload);
      if (index === 3) skippedFields = [...externalFieldKeys, ...profileFieldKeys].filter((key) => key in payload);
      break;
    } catch (error) {
      if (!isMissingColumnError(error) || index === payloadTiers.length - 1) throw error;
    }
  }

  await supabaseRequest("lead_actions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      company_id: companyId,
      lead_id: leadId,
      action_type: "hold",
      result: "외부 정보 보강",
      memo: [
        sources.placeLinks ? "플레이스 링크 확인" : "",
        sources.googleReviews ? "구글 리뷰/평점 확인" : "",
        sources.keywordVolume ? "키워드 검색량 확인" : ""
      ].filter(Boolean).join("\n") || "외부 정보 확인 시도",
      actor_name: "MAJU"
    })
  }).catch(() => null);

  return {
    lead: updatedRows?.[0] ? toPermitLeadItem(updatedRows[0]) : undefined,
    ok: true,
    persisted,
    skippedFields,
    sources,
    message: skippedFields.length
      ? "외부 정보 일부는 DB 컬럼이 아직 반영되지 않아 저장하지 못했습니다. 링크 확인 이력은 남겼습니다."
      : undefined
  };
}

export type LeadContactInfoBackfillResult = {
  addressFilled: number;
  phoneFilled: number;
  processed: number;
};

const LEAD_CONTACT_BACKFILL_BATCH_SIZE = 30;
const LEAD_CONTACT_BACKFILL_CONCURRENCY = 5;

/**
 * 연락처/주소가 비어있는 리드를 찾아 enrichPermitLeadExternalInfo()로 한 건씩 보강합니다(2026-08-24
 * 피드백: "영업리드들의 정보들이 비어져있는게 많네, 기거래처 카드 참고해서 보충해야할 듯"). 인허가
 * 원본 데이터 자체에 없는 값이라 대표자명까지는 채울 수 없지만, 카카오 로컬 검색으로 연락처·주소는
 * 상당수 채울 수 있습니다. 한 번에 다 훑으면 리드 수(수천 건)만큼 외부 API를 호출하게 되어 크론
 * 시간 예산을 넘길 수 있으므로, 오래된 순으로 배치(기본 30건)만 처리하고 다음 날 이어서 훑습니다.
 */
export async function enrichLeadsMissingContactInfo(companyId: string, limit = LEAD_CONTACT_BACKFILL_BATCH_SIZE): Promise<LeadContactInfoBackfillResult> {
  const empty: LeadContactInfoBackfillResult = { addressFilled: 0, phoneFilled: 0, processed: 0 };
  if (!isProductionStoreConfigured()) return empty;

  const rows = await supabaseRequest<Array<{ id: string }>>(
    `business_permit_leads?select=id&company_id=eq.${encodeURIComponent(companyId)}&status=neq.제외&or=(phone.is.null,address.is.null)&order=updated_at.asc&limit=${limit}`
  ).catch(() => []);

  // 2026-08-26 효율화: 리드를 한 건씩 순차로 보강하던 것을 findNearbyPermitLeads와 동일한
  // mapWithConcurrency 패턴으로 묶어 동시에 처리합니다(카카오 로컬 검색 호출 자체는 그대로 유지).
  const outcomes = await mapWithConcurrency(rows, LEAD_CONTACT_BACKFILL_CONCURRENCY, (row) =>
    enrichPermitLeadExternalInfo(companyId, row.id).catch(() => null)
  );
  const phoneFilled = outcomes.filter((result) => result?.lead?.phone).length;
  const addressFilled = outcomes.filter((result) => result?.lead?.address).length;

  return { addressFilled, phoneFilled, processed: rows.length };
}

export type LeadContactInfoBackfillDailyResult = {
  companiesProcessed: number;
  totalAddressFilled: number;
  totalPhoneFilled: number;
  totalProcessed: number;
};

/** 일일 cron(app/api/cron/recommend-refresh)에서 모든 회사에 대해 리드 연락처/주소 보강을 실행합니다. */
export async function enrichAllCompaniesLeadsMissingContactInfo(): Promise<LeadContactInfoBackfillDailyResult> {
  const empty: LeadContactInfoBackfillDailyResult = { companiesProcessed: 0, totalAddressFilled: 0, totalPhoneFilled: 0, totalProcessed: 0 };
  if (!isProductionStoreConfigured()) return empty;

  const companies = await supabaseRequest<Array<{ id: string }>>("companies?select=id").catch(() => []);
  const results = await Promise.all(companies.map((company) => enrichLeadsMissingContactInfo(company.id).catch(() => ({ addressFilled: 0, phoneFilled: 0, processed: 0 }))));

  return results.reduce<LeadContactInfoBackfillDailyResult>(
    (total, result) => ({
      companiesProcessed: total.companiesProcessed + 1,
      totalAddressFilled: total.totalAddressFilled + result.addressFilled,
      totalPhoneFilled: total.totalPhoneFilled + result.phoneFilled,
      totalProcessed: total.totalProcessed + result.processed
    }),
    empty
  );
}

/** 신규 리드를 실제 거래처 원장(normalized_customers)으로 전환합니다. */
export async function convertPermitLeadToCustomer(
  companyId: string,
  leadId: string,
  auditContext: CustomerMasterAuditContext = {}
): Promise<{ ok: boolean; customerId?: string; message?: string }> {
  if (!isProductionStoreConfigured()) return { ok: false, message: "데이터베이스가 연결되어 있지 않습니다." };

  const rows = await supabaseRequest<PermitLeadRow[]>(
    `business_permit_leads?select=*&id=eq.${encodeURIComponent(leadId)}&company_id=eq.${encodeURIComponent(companyId)}&limit=1`
  ).catch(() => []);
  const lead = rows[0];
  if (!lead) return { ok: false, message: "리드를 찾을 수 없습니다." };

  const created = await upsertCustomerMaster(
    {
      customerName: lead.business_name,
      businessNumber: lead.business_number || undefined,
      representativeName: lead.representative_name || undefined,
      address: lead.address || undefined,
      phone: lead.phone || undefined,
      industry: lead.industry_primary || undefined,
      openingDate: lead.open_date || undefined,
      naverPlaceUrl: lead.naver_place_url || undefined,
      kakaoPlaceUrl: lead.kakao_place_url || undefined
    },
    companyId,
    auditContext
  );

  await supabaseRequest(
    `business_permit_leads?id=eq.${encodeURIComponent(leadId)}&company_id=eq.${encodeURIComponent(companyId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "거래처 전환", matched_customer_id: created.customer.id, updated_at: new Date().toISOString() })
    }
  );

  await supabaseRequest("lead_actions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      company_id: companyId,
      lead_id: leadId,
      action_type: "convert",
      result: "거래처 전환",
      actor_name: auditContext.actorName || null
    })
  }).catch(() => null);

  return { ok: true, customerId: created.customer.id };
}

export type PermitLeadAnchor = {
  address: string;
  distanceKm: number;
  id: string;
  name: string;
};

export type NearbyPermitLead = PermitLeadItem & {
  distanceKm: number;
  nearestAnchor: { id: string; name: string } | null;
};

export type FindNearbyPermitLeadsInput = {
  /**
   * "customer": 지정한 거래처 1곳 기준 반경 검색. "all": 활성 거래처 전체 합집합(각 리드에서 가장
   * 가까운 거래처까지 거리). "point": 지도 위 임의의 좌표(예: 우클릭으로 고른 지점) 기준 반경 검색 —
   * 거래처를 거치지 않고 좌표를 바로 씁니다.
   */
  anchorMode: "all" | "customer" | "point";
  /** anchorMode가 "customer"일 때 기준이 되는 거래처 id·이름·주소입니다. */
  anchorCustomer?: { address: string; id: string; name: string };
  /** anchorMode가 "point"일 때 기준이 되는 좌표입니다. */
  anchorPoint?: { lat: number; lng: number };
  radiusKm: number;
};

export type FindNearbyPermitLeadsResult = {
  anchorCount: number;
  leads: NearbyPermitLead[];
  radiusKm: number;
  unresolvedAnchorCount: number;
  unresolvedLeadCount: number;
};

const NEARBY_LEAD_GEOCODE_CONCURRENCY = 6;

/** 배열을 일정 크기로 나눠 지정한 동시성 안에서 처리합니다. Tmap 지오코딩 API를 한 번에 너무 많이 호출하지 않기 위한 용도입니다. */
export async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function runNext(): Promise<void> {
    const index = cursor;
    cursor += 1;
    if (index >= items.length) return;
    results[index] = await worker(items[index]);
    await runNext();
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runNext()));
  return results;
}

/**
 * "리드 탐색"(AI 영업 세일즈) 기능의 핵심입니다. 기존 거래처(1곳 또는 전체) 주변 반경 안에
 * 있는 신규 인허가 리드를 찾습니다. 거래처·리드 주소는 처음 조회될 때만 Tmap으로 지오코딩하고,
 * 리드 좌표는 business_permit_leads.latitude/longitude에 lazy backfill로 저장해 다음 조회부터는
 * 재지오코딩하지 않습니다(거래처 좌표는 캐시 테이블이 없어 매 요청 재지오코딩합니다 — 거래처 수가
 * 많아지면 route_distance_cache처럼 좌표 캐시 테이블을 추가하는 게 좋습니다).
 */
export async function findNearbyPermitLeads(companyId: string, input: FindNearbyPermitLeadsInput): Promise<FindNearbyPermitLeadsResult> {
  const radiusKm = Math.max(0.5, Math.min(50, input.radiusKm || 5));
  if (!isProductionStoreConfigured()) {
    return { anchorCount: 0, leads: [], radiusKm, unresolvedAnchorCount: 0, unresolvedLeadCount: 0 };
  }

  // 1) 기준점(들)을 지오코딩합니다. anchorPoints는 이후 거리 계산에 바로 쓸 수 있도록 좌표를 함께 들고 있습니다.
  const anchorPoints: Array<{ anchor: PermitLeadAnchor; point: GeoPoint }> = [];
  let unresolvedAnchorCount = 0;

  if (input.anchorMode === "point") {
    if (!input.anchorPoint || !Number.isFinite(input.anchorPoint.lat) || !Number.isFinite(input.anchorPoint.lng)) {
      return { anchorCount: 0, leads: [], radiusKm, unresolvedAnchorCount: 0, unresolvedLeadCount: 0 };
    }
    anchorPoints.push({
      anchor: { id: "", name: "지도 클릭 지점", address: "", distanceKm: 0 },
      point: input.anchorPoint
    });
  } else if (input.anchorMode === "customer") {
    if (!input.anchorCustomer?.address) return { anchorCount: 0, leads: [], radiusKm, unresolvedAnchorCount: 0, unresolvedLeadCount: 0 };
    const point = await resolveAddressPoint(input.anchorCustomer.address);
    if (!point) return { anchorCount: 0, leads: [], radiusKm, unresolvedAnchorCount: 1, unresolvedLeadCount: 0 };
    anchorPoints.push({
      anchor: { id: input.anchorCustomer.id, name: input.anchorCustomer.name, address: input.anchorCustomer.address, distanceKm: 0 },
      point
    });
  } else {
    const customerMaster = await getCustomerMaster(companyId);
    const activeCustomers = customerMaster.customers
      .filter((customer) => customer.address?.trim() && customer.businessStatus !== "closed" && customer.relationshipStatus !== "거래종료")
      .slice(0, 300); // v1 상한: 거래처가 매우 많은 회사는 좌표 캐시 테이블 도입 전까지 상위 300곳만 기준점으로 씁니다.

    const points = await mapWithConcurrency(activeCustomers, NEARBY_LEAD_GEOCODE_CONCURRENCY, (customer) => resolveAddressPoint(customer.address!));
    activeCustomers.forEach((customer, index) => {
      const point = points[index];
      if (!point) {
        unresolvedAnchorCount += 1;
        return;
      }
      anchorPoints.push({ anchor: { id: customer.id, name: customer.customerName, address: customer.address!, distanceKm: 0 }, point });
    });
  }
  if (!anchorPoints.length) return { anchorCount: 0, leads: [], radiusKm, unresolvedAnchorCount: unresolvedAnchorCount || 1, unresolvedLeadCount: 0 };

  // 2) 활성·비제외·비중복 리드 중 주소가 있는 것만 대상으로, 좌표가 없으면 지오코딩 후 DB에 백필합니다.
  const rows = await supabaseRequest<PermitLeadRow[]>(
    `business_permit_leads?select=*&company_id=eq.${encodeURIComponent(companyId)}&is_active=eq.true&is_duplicate=eq.false&status=neq.제외&address=not.is.null&limit=500`
  ).catch(() => []);

  let unresolvedLeadCount = 0;
  const leadPoints = await mapWithConcurrency(rows, NEARBY_LEAD_GEOCODE_CONCURRENCY, async (row) => {
    if (row.latitude != null && row.longitude != null) return { lat: row.latitude, lng: row.longitude } as GeoPoint;
    const point = await resolveAddressPoint(row.address || "");
    if (point) {
      await supabaseRequest(`business_permit_leads?id=eq.${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ latitude: point.lat, longitude: point.lng })
      }).catch(() => null);
    }
    return point;
  });

  const nearby: NearbyPermitLead[] = [];
  rows.forEach((row, index) => {
    const point = leadPoints[index];
    if (!point) {
      unresolvedLeadCount += 1;
      return;
    }
    let nearestDistanceKm = Infinity;
    let nearestAnchor: { id: string; name: string } | null = null;
    for (const { anchor, point: anchorPoint } of anchorPoints) {
      const distanceKm = haversineDistanceKm(anchorPoint, point);
      if (distanceKm < nearestDistanceKm) {
        nearestDistanceKm = distanceKm;
        nearestAnchor = { id: anchor.id, name: anchor.name };
      }
    }
    if (nearestDistanceKm <= radiusKm) {
      nearby.push({ ...toPermitLeadItem(row), distanceKm: nearestDistanceKm, nearestAnchor });
    }
  });

  nearby.sort((a, b) => a.distanceKm - b.distanceKm);

  return { anchorCount: anchorPoints.length, leads: nearby, radiusKm, unresolvedAnchorCount, unresolvedLeadCount };
}

/** 반경(km)을 route_fit_score(0~15)로 환산합니다. 가까울수록 기존 배송 동선에 얹기 쉬워 점수가 높습니다. */
function routeFitScoreFromDistanceKm(distanceKm: number): number {
  if (distanceKm <= 1) return 15;
  if (distanceKm <= 3) return 11;
  if (distanceKm <= 7) return 7;
  if (distanceKm <= 15) return 3;
  return 0;
}

export type RecommendationScoreRefreshResult = {
  ok: boolean;
  message?: string;
  updated: number;
  topIndustries: string[];
  unresolvedAnchorCount: number;
  unresolvedLeadCount: number;
};

/**
 * "기거래처 주변 리드 추천"과 "기존 거래처와 업종·메뉴가 비슷한 곳 추천"(2026-08-24 피드백)을
 * 점수에 반영합니다. 기존 findNearbyPermitLeads(anchorMode:"all")를 그대로 재사용해 거래처 반경
 * 지오코딩을 새로 만들지 않고, 반환된 거리값만 route_fit_score로 환산해 채웁니다. 업종 유사도는
 * 활성 거래처의 업종 분포에서 상위 업종을 뽑아, 리드의 업종이 여기 속하면 industry_fit_score에
 * 가산점을 줍니다(완전히 새로운 업종이라 이 회사가 잘 모르는 곳보다, 이미 잘 파는 업종의 새 매장이
 * 성사 확률이 높다고 봄). 두 축 모두 기존 keyword_demand_score/place_activity_score는 그대로
 * 보존하고 route_fit_score/industry_fit_score만 갱신한 뒤 등급을 다시 매깁니다.
 */
export async function refreshPermitLeadRecommendationScores(companyId: string, radiusKm = 30): Promise<RecommendationScoreRefreshResult> {
  if (!isProductionStoreConfigured()) {
    return { ok: false, message: "데이터베이스가 연결되어 있지 않습니다.", updated: 0, topIndustries: [], unresolvedAnchorCount: 0, unresolvedLeadCount: 0 };
  }

  const [nearbyResult, customerMaster] = await Promise.all([
    findNearbyPermitLeads(companyId, { anchorMode: "all", radiusKm: Math.max(1, Math.min(50, radiusKm)) }),
    getCustomerMaster(companyId)
  ]);

  // 활성 거래처 업종 분포에서 상위 3개를 "이 회사가 잘 파는 업종"으로 봅니다.
  const industryCounts = new Map<string, number>();
  customerMaster.customers.forEach((customer) => {
    const industry = customer.industry?.trim();
    if (!industry || customer.businessStatus === "closed") return;
    industryCounts.set(industry, (industryCounts.get(industry) || 0) + 1);
  });
  const topIndustries = Array.from(industryCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([industry]) => industry);

  const nowIso = new Date().toISOString();
  const updateRows = nearbyResult.leads.map((lead) => {
    const industryKnown = lead.industryPrimary !== "미분류";
    const industryMatchesTop = topIndustries.includes(lead.industryPrimary);
    const baseIndustryFit = !lead.isTargetIndustry ? 0 : industryKnown ? 20 : 10;
    // 상위 업종과 일치하면 20점 만점을 보장하고(이미 최고점이면 그대로), 아니면 기존 계산을 씁니다 —
    // "성사 확률이 높은 곳"을 상위 업종 일치 리드로 자연스럽게 끌어올리기 위함입니다.
    const industryFit = industryMatchesTop && lead.isTargetIndustry ? 20 : baseIndustryFit;

    const scoreBreakdown = computePermitLeadScoreBreakdown({
      leadPeriod: lead.leadPeriod,
      isTarget: lead.isTargetIndustry,
      industryKnown,
      hasPhone: Boolean(lead.phone),
      hasAddress: Boolean(lead.address),
      keywordVolume: lead.keywordVolume,
      reviewCount: lead.reviewCount,
      rating: lead.rating
    });
    scoreBreakdown.industry_fit_score = industryFit;
    scoreBreakdown.route_fit_score = routeFitScoreFromDistanceKm(lead.distanceKm);
    const scoreTotal = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);

    return {
      id: lead.id,
      // upsert는 내부적으로 "충돌 시 이 값으로 갱신"이지만 시도하는 INSERT 자체가 NOT NULL
      // 제약(company_id, business_name)을 만족해야 해서(PostgreSQL이 ON CONFLICT 판단 전에
      // 삽입 행을 먼저 구성함) 갱신하지 않는 값이라도 반드시 같이 보내야 합니다.
      company_id: companyId,
      business_name: lead.businessName,
      score_total: scoreTotal,
      score_breakdown: scoreBreakdown,
      grade: permitLeadGradeFromScore(scoreTotal),
      updated_at: nowIso
    };
  });

  // 2026-08-31 성능 감사 대응: 반경 안 리드가 수백 건이면 예전 코드는 리드마다 개별 PATCH를
  // 병렬로(그래도 수백 번의 개별 HTTP 왕복) 보냈습니다. id 충돌 시 병합하는 벌크 upsert(다른 곳의
  // on_conflict=id 패턴과 동일)로 한 번의 요청에 전부 담아 보냅니다. 500건 단위로만 나눠 보내
  // 요청 본문이 과도하게 커지는 것을 막습니다.
  const BULK_UPDATE_CHUNK_SIZE = 500;
  for (let i = 0; i < updateRows.length; i += BULK_UPDATE_CHUNK_SIZE) {
    const rowsChunk = updateRows.slice(i, i + BULK_UPDATE_CHUNK_SIZE);
    // eslint-disable-next-line no-await-in-loop
    await supabaseRequest("business_permit_leads?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rowsChunk)
    }).catch(() => null);
  }

  return {
    ok: true,
    updated: updateRows.length,
    topIndustries,
    unresolvedAnchorCount: nearbyResult.unresolvedAnchorCount,
    unresolvedLeadCount: nearbyResult.unresolvedLeadCount
  };
}

export type RecommendationRefreshAllResult = {
  companiesProcessed: number;
  totalUpdated: number;
};

/**
 * 매일 자동으로 "추천 점수"(기거래처 근접도 + 업종 유사도, 2026-08-24 피드백)를 다시 계산합니다.
 * app/api/cron/business-status와 같은 크론에 얹지 않고 별도 크론(app/api/cron/recommend-refresh)
 * 에서만 호출합니다 — business-status 크론은 이미 60초 예산을 거의 다 쓰고 있는데, 이 작업은
 * 거래처 지오코딩(Tmap 호출)이 들어가 시간이 걸릴 수 있어 같이 묶으면 타임아웃 위험이 있습니다.
 * 회사 하나가 실패해도(Tmap 오류 등) 나머지 회사는 계속 처리합니다.
 */
export async function refreshAllCompaniesRecommendationScores(): Promise<RecommendationRefreshAllResult> {
  if (!isProductionStoreConfigured()) return { companiesProcessed: 0, totalUpdated: 0 };

  const companies = await supabaseRequest<Array<{ id: string }>>("companies?select=id").catch(() => []);
  const results = await Promise.all(
    companies.map((company) =>
      refreshPermitLeadRecommendationScores(company.id).catch(
        (): RecommendationScoreRefreshResult => ({ ok: false, updated: 0, topIndustries: [], unresolvedAnchorCount: 0, unresolvedLeadCount: 0 })
      )
    )
  );

  return {
    companiesProcessed: companies.length,
    totalUpdated: results.reduce((sum, result) => sum + result.updated, 0)
  };
}

// 2026-08-28 피드백 대응(데스크톱에서 짠 배송 순서가 모바일에 반영 안 됨): 코스 탭에서 배송담당자
// 별로 확정한 오늘 방문 순서(route_plan_confirmations)를 오늘 날짜 기준으로 읽어와,
// { 담당자 이름 -> 확정된 거래처 id 순서 } 맵으로 돌려줍니다. 확정 기록이 없으면 빈 맵을 돌려주고,
// 이 경우 아래 getTodayRoutePlan은 예전과 동일하게 원장 순서를 그대로 씁니다(동작 변화 없음).
async function getRouteOrderConfirmationMap(companyId: string): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!isProductionStoreConfigured()) return map;
  const today = new Date().toISOString().slice(0, 10);
  const rows = await supabaseRequest<Array<{ driver_name: string; customer_ids: unknown }>>(
    `route_plan_confirmations?select=driver_name,customer_ids&company_id=eq.${encodeURIComponent(companyId)}&route_date=eq.${today}`
  ).catch(() => []);
  for (const row of rows) {
    if (Array.isArray(row.customer_ids)) map.set(row.driver_name, row.customer_ids as string[]);
  }
  return map;
}

export async function saveRouteOrderConfirmation(companyId: string | undefined, driverName: string, customerIds: string[], confirmedBy?: string) {
  const resolvedCompanyId = companyId || getDefaultCompanyId();
  if (!isProductionStoreConfigured()) return { persisted: false };
  const today = new Date().toISOString().slice(0, 10);
  await supabaseRequest("route_plan_confirmations?on_conflict=company_id,driver_name,route_date", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([
      {
        company_id: resolvedCompanyId,
        driver_name: driverName.trim(),
        route_date: today,
        customer_ids: customerIds,
        confirmed_by: confirmedBy || null,
        updated_at: new Date().toISOString()
      }
    ])
  });
  return { persisted: true };
}

export async function getTodayRoutePlan(companyId?: string): Promise<RoutePlan> {
  const resolvedCompanyId = companyId || getDefaultCompanyId();
  const [routeCache, customerMaster, routeOrderConfirmations] = await Promise.all([
    getRouteDistanceCacheMap(resolvedCompanyId),
    getCustomerMaster(companyId),
    getRouteOrderConfirmationMap(resolvedCompanyId)
  ]);
  const planned = customerMaster.customers
    .map((customer, index) => {
      const address = customer.address || `${customer.region || "미분류"} ${customer.customerName}`;
      const cached = routeCache.get(address);
      const distanceKm = cached?.distanceKm ?? customer.deliveryKm;
      const routeProvider: RoutePlanStop["routeProvider"] = cached ? "cached" : "estimated";
      // 배송담당자별로 확정된 순서가 있으면 그 위치(1부터)를 order로 쓰고, 확정 목록에 없는(예:
      // 확정 이후 새로 배정된) 거래처는 10000+index로 밀어 항상 확정된 거래처들 뒤에 오게 합니다.
      // 확정 기록이 아예 없는 담당자는 예전과 동일하게 원장 순서(index+1)를 그대로 씁니다.
      const driverKey = (customer.deliveryManager || "").trim();
      const confirmedIds = driverKey ? routeOrderConfirmations.get(driverKey) : undefined;
      let order = index + 1;
      if (confirmedIds) {
        const confirmedPosition = confirmedIds.indexOf(customer.id);
        order = confirmedPosition >= 0 ? confirmedPosition + 1 : 10000 + index;
      }

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
        accessMethodType: customer.accessMethodType,
        accessNote: customer.accessNote,
        accessPassword: customer.accessPassword,
        businessHours: customer.businessHours,
        menuSummary: customer.menuSummary,
        naverPlaceUrl: customer.naverPlaceUrl,
        kakaoPlaceUrl: customer.kakaoPlaceUrl,
        googleMapUrl: customer.googleMapUrl,
        openingDate: customer.openingDate,
        phone: customer.phone,
        relationshipStatus: customer.relationshipStatus,
        representativeName: customer.representativeName,
        reviewSummary: customer.reviewSummary,
        reviewKeywords: customer.reviewKeywords,
        reviewSource: customer.reviewSource,
        reviewsUpdatedAt: customer.reviewsUpdatedAt,
        deliveryArea: customer.deliveryZone || customer.region || "미분류",
        deliveryDriver: customer.deliveryManager,
        deliveryVehicle: customer.deliveryVehicle,
        order,
        routeCalculatedAt: cached?.calculatedAt,
        routeProvider,
        updatedAt: customer.updatedAt
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

/**
 * 거래처가 배정되지 않은(stops.length === 0) 담당자·배송차를 삭제할 때 delivery_vehicles의 연료
 * 타입 설정 행도 같이 지웁니다(2026-08-24 피드백: "새 담당자, 배송차 추가는 있는데 삭제가 없다").
 * 거래처가 이미 배정된 배송차는 호출부(components/sales-route-map-workspace.tsx)에서 애초에 이
 * 함수를 호출하지 않도록 막습니다 — 담당자를 지우면 해당 거래처들이 그룹을 잃기 때문입니다.
 */
export async function deleteDeliveryVehicleFuelType(companyId: string, driverName: string): Promise<{ deleted: boolean }> {
  if (!driverName.trim()) return { deleted: false };
  if (!isProductionStoreConfigured()) return { deleted: false };

  try {
    await supabaseRequest(
      `delivery_vehicles?company_id=eq.${encodeURIComponent(companyId)}&driver_name=eq.${encodeURIComponent(driverName.trim())}`,
      { method: "DELETE" }
    );
    return { deleted: true };
  } catch (error) {
    if (isMissingDeliveryVehiclesTableError(error)) return { deleted: false };
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
  // 2026-08-26 멀티테넌시 방어(P0-1): companyId 없이는 전체 회사의 방문 이력을 섞어 반환하지 않습니다.
  if (!companyId) return [];

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
    `visit_results?select=id,result,memo,next_action,expected_revenue,visited_at,lead_recommendations(name,region)&company_id=eq.${encodeURIComponent(companyId)}&order=visited_at.desc&limit=30`
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

  type ChurnRiskCustomerRow = {
    id: string;
    customer_name: string;
    region: string | null;
    address: string | null;
    monthly_revenue: number | string | null;
    normalized_key: string | null;
    business_status: string | null;
    relationship_status?: string | null;
  };
  const CHURN_RISK_SELECT_WITH_RELATIONSHIP_STATUS =
    "id,customer_name,region,address,monthly_revenue,normalized_key,business_status,relationship_status";
  const CHURN_RISK_SELECT_BASE = "id,customer_name,region,address,monthly_revenue,normalized_key,business_status";

  async function fetchChurnRiskCustomers(): Promise<ChurnRiskCustomerRow[]> {
    for (const select of [CHURN_RISK_SELECT_WITH_RELATIONSHIP_STATUS, CHURN_RISK_SELECT_BASE]) {
      try {
        return await supabaseRequest<Array<ChurnRiskCustomerRow>>(
          `normalized_customers?select=${select}&company_id=eq.${encodeURIComponent(id)}&limit=2000`
        );
      } catch (error) {
        if (!isMissingColumnError(error)) throw error;
      }
    }
    return [];
  }

  const [customers, transactions] = await Promise.all([
    fetchChurnRiskCustomers().catch(() => []),
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
    if (customer.relationship_status === RELATIONSHIP_STATUS_TERMINATED) continue;
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
  // 2026-08-28 피드백 대응: 국세청 API 장애로 조회 자체를 못한 건수. 0보다 크면 화면에서 "일부는
  // 장애로 확인하지 못했다"고 알려야 하며, 이 건수는 상태가 덮어써지지 않고 기존 값이 유지됩니다.
  apiFailures: number;
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

/**
 * 배송차 이름("냉동 1호차" 같은 호차명)을 여러 거래처에 한 번에 지정합니다. 지도 화면의 배송차
 * 편집 폼에서 "호차명"을 바꿀 때 쓰는데, 화면 표시값만 바꾸는 게 아니라 그 배송차에 실제로 배정된
 * 거래처들의 delivery_vehicle 값을 서버에 저장해야 새로고침 후에도, 코스 계산 그룹핑에도 새
 * 이름이 그대로 유지됩니다. bulkUpdateDeliveryManager와 동일한 패턴의 좁은 PATCH입니다.
 */
export async function bulkUpdateDeliveryVehicle(companyId: string, customerIds: string[], deliveryVehicle: string): Promise<{ updated: number }> {
  if (!customerIds.length) return { updated: 0 };
  if (!isProductionStoreConfigured()) return { updated: 0 };

  const trimmed = deliveryVehicle.trim();
  await supabaseRequest(
    `normalized_customers?company_id=eq.${encodeURIComponent(companyId)}&id=in.(${customerIds.map((id) => encodeURIComponent(id)).join(",")})`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ delivery_vehicle: trimmed || null })
    }
  );

  return { updated: customerIds.length };
}

// 담당자/배송차를 삭제할 때, 이미 거래처가 배정되어 있으면(2026-08-24 피드백: "배송 담당자 필터에서
// 배송차, 매니저 삭제해야하는데 개선이 안된것 같아" — 이전 라운드는 거래처가 하나도 없는 빈 배송차만
// 삭제할 수 있었는데, 실제로는 대부분의 배송차에 거래처가 배정돼 있어 사실상 아무것도 못 지우는
// 상태였습니다) 그 거래처들을 "담당자 미지정" 상태로 되돌려야 배송차 자체를 지울 수 있습니다.
// delivery_manager·delivery_vehicle을 함께 비워, 지도/코스 화면에서 다시 "미배정" 그룹으로 보이게 합니다.
export async function bulkClearDeliveryAssignment(companyId: string, customerIds: string[]): Promise<{ updated: number }> {
  if (!customerIds.length) return { updated: 0 };
  if (!isProductionStoreConfigured()) return { updated: 0 };

  await supabaseRequest(
    `normalized_customers?company_id=eq.${encodeURIComponent(companyId)}&id=in.(${customerIds.map((id) => encodeURIComponent(id)).join(",")})`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ delivery_manager: null, delivery_vehicle: null })
    }
  );

  return { updated: customerIds.length };
}

export const RELATIONSHIP_STATUS_ACTIVE = "거래중";
export const RELATIONSHIP_STATUS_TERMINATED = "거래종료";

/**
 * 사업자 휴폐업 상태(정부 API로 자동 조회하는 business_status)와는 별개로, "이 거래처와 더 이상
 * 거래하지 않기로 했다"는 판단은 사람이 직접 내려야 합니다. 이 함수는 그 수동 판단을 저장합니다.
 * 별도의 좁은 PATCH로 구현한 이유: 일반 upsertCustomerMaster()는 거래처의 다른 필드를 저장할 때도
 * 매번 전체 페이로드를 보내는 upsert라서, 거기에 이 컬럼을 끼워 넣으면 마이그레이션을 아직 실행하지
 * 않은 환경에서 거래처 저장 전체가 깨질 위험이 있습니다. 이 함수만 실패하면 이 기능만 못 쓸 뿐,
 * 나머지 거래처 관리 기능에는 영향이 없습니다.
 */
export async function setCustomerRelationshipStatus(
  companyId: string,
  customerId: string,
  status: typeof RELATIONSHIP_STATUS_ACTIVE | typeof RELATIONSHIP_STATUS_TERMINATED,
  note?: string
): Promise<{ updated: boolean }> {
  if (!isProductionStoreConfigured()) return { updated: false };

  try {
    await supabaseRequest(`normalized_customers?company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(customerId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        relationship_status: status,
        relationship_status_updated_at: new Date().toISOString(),
        relationship_status_note: note?.trim() || null
      })
    });
    return { updated: true };
  } catch (error) {
    if (isMissingCustomerRelationshipStatusColumnError(error)) {
      throw new Error(
        "거래 상태를 저장할 수 없습니다. Supabase에 relationship_status 컬럼이 아직 없습니다. supabase/migrations의 최신 마이그레이션을 먼저 실행하세요."
      );
    }
    throw error;
  }
}

export async function refreshCustomerBusinessStatuses(companyId: string, customerIds?: string[]): Promise<BusinessStatusRefreshResult> {
  const emptyResult: BusinessStatusRefreshResult = {
    configured: isBusinessStatusApiConfigured(),
    checked: 0,
    updated: 0,
    skippedNoBusinessNumber: 0,
    apiFailures: 0,
    closed: []
  };
  if (!emptyResult.configured) return emptyResult;
  if (!isProductionStoreConfigured()) return emptyResult;

  const idFilter = customerIds && customerIds.length ? `&id=in.(${customerIds.map(encodeURIComponent).join(",")})` : "";
  const rows = await supabaseRequest<Array<{ id: string; customer_name: string; business_registration_number: string | null; business_status: string | null }>>(
    `normalized_customers?select=id,customer_name,business_registration_number,business_status&company_id=eq.${encodeURIComponent(
      companyId
    )}${idFilter}&order=business_status_checked_at.asc.nullsfirst&limit=${BUSINESS_STATUS_REFRESH_LIMIT}`
  ).catch(() => []);

  const checkable = rows.filter((row) => normalizeBusinessNumber(row.business_registration_number || "").length === 10);
  const skippedNoBusinessNumber = rows.length - checkable.length;
  if (!checkable.length) {
    return { ...emptyResult, skippedNoBusinessNumber };
  }

  const { results: statusByNumber, failedNumbers } = await checkBusinessRegistrationStatusesWithHealth(
    checkable.map((row) => row.business_registration_number || "")
  );
  const checkedAt = new Date().toISOString();
  const closed: BusinessStatusRefreshResult["closed"] = [];

  const updates = await Promise.all(
    checkable.map(async (row) => {
      const number = normalizeBusinessNumber(row.business_registration_number || "");
      // 2026-08-28 피드백 대응(국세청 API 장애 시 상태 덮어쓰기 방지): 조회 자체가 실패한 번호는
      // "매칭 안 됨(확인 필요)"과 다르게 취급해, 기존 business_status/checked_at을 그대로 두고
      // 건드리지 않습니다. 장애 상황에서도 "N곳 갱신"이라고 보고하면, 이미 정상 확인된 거래처가
      // API 장애 때문에 "확인 필요"로 잘못 바뀐 것처럼 보이는 문제가 있었습니다.
      if (failedNumbers.has(number)) return false;

      const status: BusinessStatusResult | undefined = statusByNumber.get(number);
      const label = status?.label || "확인 필요";
      // 이미 폐업으로 저장돼 있던 거래처가 다시 조회 대상에 걸려 재확인되는 경우까지 알림에 포함하면
      // 같은 폐업을 반복해서 알리게 됩니다. 그래서 "새로 폐업이 확인된" 경우, 즉 직전 상태가 폐업이
      // 아니었던 경우만 closed[]에 담아서, 사용자에게는 진짜 새 소식만 전달되게 합니다.
      if (label === "폐업" && row.business_status !== "폐업") {
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
    apiFailures: failedNumbers.size,
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

export type BusinessClosureAlertResult = {
  configured: boolean;
  companiesNotified: number;
  companiesFailed: Array<{ companyId: string; companyName: string; error: string }>;
};

/**
 * refreshAllCompaniesBusinessStatuses()가 찾아낸 "새로 폐업 확인됨" 거래처를, 회사별로 묶어서
 * 텔레그램으로 즉시 알립니다. 기존에는 closed[]가 cron 응답 JSON에만 담겨서 아무도 보지 못했는데,
 * 그 결과를 실제로 소비하는 함수입니다. closed가 비어 있으면(새 폐업이 없으면) 아무 것도 보내지
 * 않습니다. 텔레그램 chat_id를 설정하지 않은 회사는 조용히 건너뜁니다(이탈 위험 디지스트와 동일한
 * opt-in 방식).
 */
export async function sendBusinessClosureAlerts(closed: BusinessStatusDailyRefreshResult["closed"]): Promise<BusinessClosureAlertResult> {
  const empty: BusinessClosureAlertResult = { configured: isTelegramConfigured(), companiesNotified: 0, companiesFailed: [] };
  if (!empty.configured || !closed.length || !isProductionStoreConfigured()) return empty;

  const closedByCompany = new Map<string, BusinessStatusDailyRefreshResult["closed"]>();
  for (const item of closed) {
    const list = closedByCompany.get(item.companyId) || [];
    list.push(item);
    closedByCompany.set(item.companyId, list);
  }

  const companyIds = Array.from(closedByCompany.keys());
  const companies = await supabaseRequest<Array<{ id: string; name: string; telegram_chat_id: string | null }>>(
    `companies?select=id,name,telegram_chat_id&id=in.(${companyIds.map(encodeURIComponent).join(",")})`
  ).catch(() => []);
  const targets = companies.filter((company) => company.telegram_chat_id?.trim());

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  const results = await Promise.all(
    targets.map(async (company) => {
      const items = closedByCompany.get(company.id) || [];
      if (!items.length) return { skipped: true as const };

      try {
        const timelineUrl = appUrl ? `${appUrl}/crm/timeline?companyId=${encodeURIComponent(company.id)}` : "";
        const lines = items.map((item) => `- ${item.customerName}${item.closedDate ? ` (폐업일 ${item.closedDate})` : ""}`);
        const text = [
          `🚨 <b>${company.name} 신규 폐업 감지 ${items.length}곳</b>`,
          "국세청 사업자 상태 조회에서 새로 폐업으로 확인되었습니다.",
          "",
          lines.join("\n"),
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

  return results.reduce<BusinessClosureAlertResult>(
    (total, result) => {
      if ("error" in result && result.error) {
        return { ...total, companiesFailed: [...total.companiesFailed, { companyId: result.companyId as string, companyName: result.companyName as string, error: result.error }] };
      }
      if (result.skipped) return total;
      return { ...total, companiesNotified: total.companiesNotified + 1 };
    },
    { ...empty }
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
    getLatestBriefing(companyId).catch(() => getEmptyBriefing(isProductionStoreConfigured() ? "supabase" : "empty")),
    getLatestReport(companyId).catch(() => analyzeCompany([])),
    getLatestLeads(companyId).catch(() => ({ total: 0, leads: [] })),
    getUploadHistory(companyId).catch(() => [])
  ]);

  return {
    briefing,
    report,
    leads,
    uploadHistory,
    source: isProductionStoreConfigured() ? "supabase" : "empty"
  };
}

export async function getCompanySettings(companyId?: string, fallbackName = "마주식자재"): Promise<CompanySettings> {
  const id = companyId || getDefaultCompanyId();
  const fallback = {
    id,
    name: fallbackName,
    businessType: "식자재 유통",
    deliveryCompleteMessage: "요청하신 위치에 배송 적재 완료했습니다.",
    deliveryIssueMessage: "배송 중 확인이 필요한 사항이 있어 안내드립니다.",
    deliveryPartialMessage: "일부 품목은 확인 후 별도 안내드리겠습니다.",
    notificationPhone: process.env.COMPANY_NOTIFICATION_PHONE || "",
    notificationSenderName: fallbackName,
    ownerName: "정두영",
    originAddress: process.env.COMPANY_ORIGIN_ADDRESS || "경기도 하남시 초이로 133 1층",
    smsSenderPhone: process.env.SOLAPI_SENDER_PHONE || "",
    status: "fallback",
    updatedAt: "기준 데이터",
    workspaceType: "company" as const
  };

  if (!isProductionStoreConfigured()) {
    return fallback;
  }

  type CompanyRow = {
    id: string;
    name: string;
    business_type: string | null;
    delivery_complete_message?: string | null;
    delivery_issue_message?: string | null;
    delivery_partial_message?: string | null;
    notification_phone?: string | null;
    notification_sender_name?: string | null;
    owner_name: string | null;
    origin_address: string | null;
    sms_sender_phone?: string | null;
    status: string;
    telegram_chat_id?: string | null;
    updated_at: string;
    workspace_type?: string | null;
  };
  let rows: CompanyRow[];

  try {
    rows = await supabaseRequest<Array<CompanyRow>>(
      `companies?select=id,name,business_type,delivery_complete_message,delivery_issue_message,delivery_partial_message,notification_phone,notification_sender_name,owner_name,origin_address,sms_sender_phone,status,telegram_chat_id,workspace_type,updated_at&id=eq.${encodeURIComponent(id)}&limit=1`
    );
  } catch (error) {
    if (!isMissingTelegramChatIdColumnError(error) && !isMissingColumnError(error)) throw error;
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
    deliveryCompleteMessage: row.delivery_complete_message || fallback.deliveryCompleteMessage,
    deliveryIssueMessage: row.delivery_issue_message || fallback.deliveryIssueMessage,
    deliveryPartialMessage: row.delivery_partial_message || fallback.deliveryPartialMessage,
    notificationPhone: row.notification_phone || fallback.notificationPhone,
    notificationSenderName: row.notification_sender_name || row.name || fallback.notificationSenderName,
    ownerName: row.owner_name || "",
    originAddress: row.origin_address || "",
    smsSenderPhone: row.sms_sender_phone || fallback.smsSenderPhone,
    status: row.status,
    telegramChatId: row.telegram_chat_id || undefined,
    updatedAt: new Date(row.updated_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
    workspaceType: row.workspace_type === "personal" ? "personal" : "company"
  };
}

export async function updateCompanySettings(companyId: string, input: CompanySettingsInput) {
  const payload: Record<string, unknown> = {
    id: companyId,
    name: input.name.trim(),
    business_type: input.businessType?.trim() || null,
    delivery_complete_message: input.deliveryCompleteMessage?.trim() || null,
    delivery_issue_message: input.deliveryIssueMessage?.trim() || null,
    delivery_partial_message: input.deliveryPartialMessage?.trim() || null,
    notification_phone: input.notificationPhone?.trim() || null,
    notification_sender_name: input.notificationSenderName?.trim() || null,
    owner_name: input.ownerName?.trim() || null,
    origin_address: input.originAddress?.trim() || null,
    sms_sender_phone: input.smsSenderPhone?.trim() || null,
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
        deliveryCompleteMessage: (payload.delivery_complete_message as string) || "",
        deliveryIssueMessage: (payload.delivery_issue_message as string) || "",
        deliveryPartialMessage: (payload.delivery_partial_message as string) || "",
        notificationPhone: (payload.notification_phone as string) || "",
        notificationSenderName: (payload.notification_sender_name as string) || (payload.name as string),
        ownerName: (payload.owner_name as string) || "",
        originAddress: (payload.origin_address as string) || "",
        smsSenderPhone: (payload.sms_sender_phone as string) || "",
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
    delivery_complete_message?: string | null;
    delivery_issue_message?: string | null;
    delivery_partial_message?: string | null;
    notification_phone?: string | null;
    notification_sender_name?: string | null;
    owner_name: string | null;
    origin_address: string | null;
    sms_sender_phone?: string | null;
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
    if (!isMissingTelegramChatIdColumnError(error) && !isMissingColumnError(error)) throw error;
    if (
      isMissingColumnError(error) &&
      (payload.delivery_complete_message ||
        payload.delivery_issue_message ||
        payload.delivery_partial_message ||
        payload.notification_phone ||
        payload.notification_sender_name ||
        payload.sms_sender_phone)
    ) {
      throw new Error(
        "문자 알림 설정을 저장할 수 없습니다. Supabase에 회사 문자 설정 컬럼이 아직 없습니다. supabase/migrations/20260901_company_message_settings.sql 내용을 먼저 실행하세요."
      );
    }
    if (payload.telegram_chat_id) {
      throw new Error(
        "텔레그램 chat_id를 저장할 수 없습니다. Supabase에 telegram_chat_id 컬럼이 아직 없습니다. ALTER TABLE companies ADD COLUMN IF NOT EXISTS telegram_chat_id text; 를 먼저 실행하세요."
      );
    }
    const {
      notification_phone: _notificationPhone,
      notification_sender_name: _notificationSenderName,
      delivery_complete_message: _deliveryCompleteMessage,
      delivery_issue_message: _deliveryIssueMessage,
      delivery_partial_message: _deliveryPartialMessage,
      sms_sender_phone: _smsSenderPhone,
      telegram_chat_id: _telegramChatId,
      ...payloadWithoutOptionalMessageColumns
    } = payload;
    rows = await supabaseRequest<Array<CompanyRow>>("companies?on_conflict=id", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify([payloadWithoutOptionalMessageColumns])
    });
  }

  const row = rows[0];
  return {
    persisted: true,
    company: {
      id: row.id,
      name: row.name,
      businessType: row.business_type || "",
      deliveryCompleteMessage: row.delivery_complete_message || "",
      deliveryIssueMessage: row.delivery_issue_message || "",
      deliveryPartialMessage: row.delivery_partial_message || "",
      notificationPhone: row.notification_phone || "",
      notificationSenderName: row.notification_sender_name || row.name,
      ownerName: row.owner_name || "",
      originAddress: row.origin_address || "",
      smsSenderPhone: row.sms_sender_phone || "",
      telegramChatId: row.telegram_chat_id || undefined,
      status: row.status,
      updatedAt: new Date(row.updated_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    }
  };
}

export async function getAdminDashboardPayload(): Promise<AdminDashboardPayload> {
  if (!isProductionStoreConfigured()) return getEmptyAdminDashboardPayload("empty");

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
      { label: "리포트 생성 성공률", value: reports.length ? 100 : 0, description: "저장된 운영 리포트 기준입니다." }
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

function getEmptyAdminDashboardPayload(source: "empty" | "supabase"): AdminDashboardPayload {
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
      { label: "주소 인식률", value: 0, description: "거래처를 등록하면 주소/지역 완성도를 계산합니다." },
      { label: "중복 제거율", value: 0, description: "거래처명, 주소, 사업자번호 기준 중복 후보를 계산합니다." },
      { label: "필수 컬럼 완성도", value: 0, description: "필수 필드 매핑 후 저장 품질을 표시합니다." },
      { label: "리포트 생성 성공률", value: 0, description: "저장된 운영 리포트 기준으로 표시합니다." }
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
  const [nameOnlyLookup, exemptBusinessNumbers] = await Promise.all([
    buildNameOnlyCustomerKeyLookup(companyId).catch(() => new Map<string, string>()),
    getExemptBusinessNumberSet(companyId).catch(() => new Set<string>())
  ]);
  const salesRows = rawRows
    .map((row) => {
      const customerName = getRawCell(row, columnMapping.customerName);
      const businessRegistrationNumber = normalizeBusinessNumber(getRawCell(row, columnMapping.businessRegistrationNumber));
      // 중복 허용 목록에 등록된 사업자번호는 매출 매칭 key로 쓰지 않고 상호명/주소 기준으로 대체합니다.
      // (사업자번호 자체는 원래 값 그대로 저장하고, key 계산에서만 제외합니다.)
      const keyEligibleBusinessNumber = exemptBusinessNumbers.has(businessRegistrationNumber) ? "" : businessRegistrationNumber;
      const address = getRawCell(row, columnMapping.address);
      const nameOnlyMatch = !keyEligibleBusinessNumber && !address ? nameOnlyLookup.get(normalizeNameForDuplicateCheck(customerName)) : undefined;
      const customerKey = keyEligibleBusinessNumber || nameOnlyMatch || makeCustomerKey(customerName, address);

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

export { normalizeBusinessNumber };

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
    delivery_vehicle: asNullableString(row.delivery_vehicle),
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
    loading_position: asNullableString(row.loading_position),
    business_hours: asNullableString(row.business_hours),
    menu_summary: asNullableString(row.menu_summary),
    relationship_status: asNullableString(row.relationship_status),
    relationship_status_updated_at: asNullableString(row.relationship_status_updated_at),
    relationship_status_note: asNullableString(row.relationship_status_note),
    updated_at: asNullableString(row.updated_at)
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
    delivery_vehicle?: string | null;
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
    access_method_type?: string | null;
    access_note?: string | null;
    access_password?: string | null;
    business_hours?: string | null;
    menu_summary?: string | null;
    relationship_status?: string | null;
    relationship_status_updated_at?: string | null;
    relationship_status_note?: string | null;
    review_summary?: string | null;
    review_keywords?: string[] | null;
    review_source?: string | null;
    reviews_updated_at?: string | null;
    updated_at?: string | null;
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
    deliveryVehicle: row.delivery_vehicle || undefined,
    deliveryZone: row.delivery_zone || undefined,
    email: row.email || undefined,
    grade: getRevenueGrade(monthlyRevenue),
    industry: row.industry || "미분류",
    lastOrderDays: Number(row.last_order_days || 0),
    loadingPosition: row.loading_position || undefined,
    accessMethodType: row.access_method_type || undefined,
    accessNote: row.access_note || undefined,
    accessPassword: row.access_password || undefined,
    businessHours: row.business_hours || undefined,
    menuSummary: row.menu_summary || undefined,
    googleMapUrl: row.google_map_url || undefined,
    kakaoPlaceUrl: row.kakao_place_url || undefined,
    memoCount: 2 + (index % 4),
    monthlyRevenue,
    naverPlaceUrl: row.naver_place_url || undefined,
    openingDate: row.opening_date || undefined,
    phone: row.phone || undefined,
    placeLinksCheckedAt: row.place_links_checked_at || undefined,
    region: row.region || "미분류",
    relationshipStatus: row.relationship_status || "거래중",
    relationshipStatusNote: row.relationship_status_note || undefined,
    relationshipStatusUpdatedAt: row.relationship_status_updated_at || undefined,
    representativeName: row.representative_name || undefined,
    reviewSummary: row.review_summary || undefined,
    reviewKeywords: row.review_keywords && row.review_keywords.length ? row.review_keywords : undefined,
    reviewSource: row.review_source || undefined,
    reviewsUpdatedAt: row.reviews_updated_at || undefined,
    visitCount: Number(row.visit_count || 0),
    updatedAt: row.updated_at || undefined
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

/**
 * Supabase Storage object key는 [a-zA-Z0-9!-_.*'()/&$@=;:+,?]만 허용합니다.
 * 한글 등 비-ASCII 문자가 남아있으면 업로드 시 400 InvalidKey 오류가 나므로,
 * 확장자를 보존하면서 나머지는 안전한 문자만 남기고 전부 제거합니다.
 * 원본 파일명(한글 포함)은 별도의 title 컬럼에 그대로 저장되므로 여기서는
 * storage key로만 쓰일 안전한 값을 만들면 됩니다.
 */
function sanitizeStorageFilename(filename: string) {
  const fallback = "attachment";
  const normalized = filename.normalize("NFKC").trim();
  const lastDotIndex = normalized.lastIndexOf(".");
  const hasExtension = lastDotIndex > 0 && lastDotIndex < normalized.length - 1;
  const base = hasExtension ? normalized.slice(0, lastDotIndex) : normalized;
  const extension = hasExtension ? normalized.slice(lastDotIndex + 1) : "";

  const safeBase =
    base
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || fallback;
  const safeExtension = extension.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

  return safeExtension ? `${safeBase}.${safeExtension}` : safeBase;
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

// ---------------------------------------------------------------------------------------------
// 2026-09-01 피드백: "결제프로그램도 추가해서 넣고 싶어" — 고객사가 마주 인텔리전스 이용료를 매달
// 카드로 자동결제하는 구독/청구 저장소입니다. 스키마는
// supabase/migrations/20260901_billing_subscriptions.sql, 토스페이먼츠 API 래퍼는
// lib/toss-payments.ts를 참고하세요. 사용자 확정: "매달 자동결제는 일시불로만" — 토스 자동결제
// (빌링) API에는 할부 파라미터가 없어 여기서도 할부를 다루지 않습니다.
// ---------------------------------------------------------------------------------------------

export type SubscriptionStatus = "pending_card" | "active" | "paused" | "canceled";

export type Subscription = {
  id: string;
  companyId: string;
  tossCustomerKey: string;
  billingKey: string | null;
  cardIssuerCode: string | null;
  cardNumberMasked: string | null;
  planAmountWon: number;
  status: SubscriptionStatus;
  nextBillingDate: string | null;
  lastPaymentStatus: string | null;
  lastPaymentAt: string | null;
  lastPaymentMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionPayment = {
  id: string;
  subscriptionId: string;
  companyId: string;
  orderId: string;
  tossPaymentKey: string | null;
  amount: number;
  status: "succeeded" | "failed";
  method: string | null;
  cardNumberMasked: string | null;
  receiptUrl: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  billedAt: string;
};

type SubscriptionRow = {
  id: string;
  company_id: string;
  toss_customer_key: string;
  billing_key: string | null;
  card_issuer_code: string | null;
  card_number_masked: string | null;
  plan_amount_won: number;
  status: string;
  next_billing_date: string | null;
  last_payment_status: string | null;
  last_payment_at: string | null;
  last_payment_message: string | null;
  created_at: string;
  updated_at: string;
};

type SubscriptionPaymentRow = {
  id: string;
  subscription_id: string;
  company_id: string;
  order_id: string;
  toss_payment_key: string | null;
  amount: number;
  status: string;
  method: string | null;
  card_number_masked: string | null;
  receipt_url: string | null;
  failure_code: string | null;
  failure_message: string | null;
  billed_at: string;
};

function isMissingSubscriptionsTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("PGRST205") && (message.includes("subscriptions") || message.includes("subscription_payments"));
}

const MISSING_SUBSCRIPTIONS_TABLE_MESSAGE =
  "구독/결제 저장소가 아직 준비되지 않았습니다. supabase/migrations/20260901_billing_subscriptions.sql을 Supabase SQL Editor에서 실행한 뒤 다시 시도해주세요.";

function mapSubscriptionRow(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    companyId: row.company_id,
    tossCustomerKey: row.toss_customer_key,
    billingKey: row.billing_key,
    cardIssuerCode: row.card_issuer_code,
    cardNumberMasked: row.card_number_masked,
    planAmountWon: row.plan_amount_won || 0,
    status: (row.status as SubscriptionStatus) || "pending_card",
    nextBillingDate: row.next_billing_date,
    lastPaymentStatus: row.last_payment_status,
    lastPaymentAt: row.last_payment_at,
    lastPaymentMessage: row.last_payment_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSubscriptionPaymentRow(row: SubscriptionPaymentRow): SubscriptionPayment {
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    companyId: row.company_id,
    orderId: row.order_id,
    tossPaymentKey: row.toss_payment_key,
    amount: row.amount,
    status: (row.status as "succeeded" | "failed") || "failed",
    method: row.method,
    cardNumberMasked: row.card_number_masked,
    receiptUrl: row.receipt_url,
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    billedAt: row.billed_at
  };
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

// 매달 같은 날짜에 청구하되, 대상 월에 그 날짜가 없으면(예: 1/31 + 1개월 → 2월엔 31일이 없음)
// 그 달의 마지막 날로 당겨줍니다. Date.setUTCMonth()로 그냥 더하면 없는 날짜가 다음 달로
// 넘어가버리는(1/31 + 1개월 → 3/3) 문제가 있어 직접 보정합니다.
function addMonthsClamped(dateOnly: string, months: number) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const targetIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);
  return toDateOnly(new Date(Date.UTC(targetYear, targetMonth, clampedDay)));
}

/** 카드 등록 위젯 콜백(successUrl)은 customerKey만 돌려줍니다 — 그 값으로 어느 회사의 구독인지 역으로 찾습니다. */
export async function getSubscriptionByCustomerKey(tossCustomerKey: string): Promise<Subscription | null> {
  if (!isProductionStoreConfigured()) return null;
  const rows = await supabaseRequest<SubscriptionRow[]>(
    `subscriptions?select=*&toss_customer_key=eq.${encodeURIComponent(tossCustomerKey)}&limit=1`
  ).catch((error) => {
    if (isMissingSubscriptionsTableError(error)) return [];
    throw error;
  });
  const row = rows[0];
  return row ? mapSubscriptionRow(row) : null;
}

export async function getSubscription(companyId: string): Promise<Subscription | null> {
  if (!isProductionStoreConfigured()) return null;
  const rows = await supabaseRequest<SubscriptionRow[]>(`subscriptions?select=*&company_id=eq.${encodeURIComponent(companyId)}&limit=1`).catch(
    (error) => {
      if (isMissingSubscriptionsTableError(error)) return [];
      throw error;
    }
  );
  const row = rows[0];
  return row ? mapSubscriptionRow(row) : null;
}

/** 구독 행이 없으면(첫 방문) toss_customer_key를 발급해 새로 만들고, 있으면 그대로 반환합니다. */
export async function ensureSubscription(companyId: string): Promise<Subscription> {
  if (!isProductionStoreConfigured()) throw new Error("데이터베이스가 연결되어 있지 않습니다.");

  const existing = await getSubscription(companyId);
  if (existing) return existing;

  try {
    const rows = await supabaseRequest<SubscriptionRow[]>("subscriptions", {
      method: "POST",
      body: JSON.stringify([{ company_id: companyId, toss_customer_key: generateTossKey("cust"), status: "pending_card" }])
    });
    return mapSubscriptionRow(rows[0]);
  } catch (error) {
    if (isMissingSubscriptionsTableError(error)) throw new Error(MISSING_SUBSCRIPTIONS_TABLE_MESSAGE);
    // company_id에 unique 제약이 있어, 동시 요청으로 이미 다른 요청이 먼저 만들었을 수 있습니다 — 한 번 더 조회합니다.
    const retried = await getSubscription(companyId);
    if (retried) return retried;
    throw error;
  }
}

/** 카드 등록 위젯 콜백에서 발급받은 billingKey를 저장하고 구독을 활성화합니다. */
export async function saveSubscriptionBillingKey(
  companyId: string,
  input: { billingKey: string; cardIssuerCode?: string; cardNumberMasked?: string }
): Promise<Subscription> {
  const existing = await ensureSubscription(companyId);
  const nextBillingDate = existing.nextBillingDate || addMonthsClamped(toDateOnly(new Date()), 1);

  const rows = await supabaseRequest<SubscriptionRow[]>(`subscriptions?company_id=eq.${encodeURIComponent(companyId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      billing_key: input.billingKey,
      card_issuer_code: input.cardIssuerCode || null,
      card_number_masked: input.cardNumberMasked || null,
      status: "active",
      next_billing_date: nextBillingDate,
      updated_at: new Date().toISOString()
    })
  });
  return mapSubscriptionRow(rows[0]);
}

/** MAJU 운영자가 고객사별 월 이용료를 설정합니다. */
export async function updateSubscriptionPlanAmount(companyId: string, planAmountWon: number): Promise<Subscription> {
  await ensureSubscription(companyId);
  const rows = await supabaseRequest<SubscriptionRow[]>(`subscriptions?company_id=eq.${encodeURIComponent(companyId)}`, {
    method: "PATCH",
    body: JSON.stringify({ plan_amount_won: Math.max(0, Math.round(planAmountWon)), updated_at: new Date().toISOString() })
  });
  return mapSubscriptionRow(rows[0]);
}

/** 일시중지/재개/해지 — 카드 정보(billingKey)는 그대로 두고 청구 대상 여부만 바꿉니다. */
export async function updateSubscriptionStatus(companyId: string, status: Extract<SubscriptionStatus, "active" | "paused" | "canceled">): Promise<Subscription> {
  await ensureSubscription(companyId);
  const rows = await supabaseRequest<SubscriptionRow[]>(`subscriptions?company_id=eq.${encodeURIComponent(companyId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status, updated_at: new Date().toISOString() })
  });
  return mapSubscriptionRow(rows[0]);
}

export async function listSubscriptionPayments(companyId: string, limit = 100): Promise<SubscriptionPayment[]> {
  if (!isProductionStoreConfigured()) return [];
  const rows = await supabaseRequest<SubscriptionPaymentRow[]>(
    `subscription_payments?select=*&company_id=eq.${encodeURIComponent(companyId)}&order=billed_at.desc&limit=${limit}`
  ).catch((error) => {
    if (isMissingSubscriptionsTableError(error)) return [];
    throw error;
  });
  return rows.map(mapSubscriptionPaymentRow);
}

/** 관리자용 — 전체 고객사의 구독 상태를 한 번에 조회합니다(고객사명 포함). */
export async function listSubscriptionsForAdmin(): Promise<Array<Subscription & { companyName: string }>> {
  if (!isProductionStoreConfigured()) return [];
  const subscriptionRows = await supabaseRequest<SubscriptionRow[]>("subscriptions?select=*&order=updated_at.desc").catch((error) => {
    if (isMissingSubscriptionsTableError(error)) return [];
    throw error;
  });
  if (!subscriptionRows.length) return [];

  const companyIds = subscriptionRows.map((row) => row.company_id);
  const companies = await supabaseRequest<Array<{ id: string; name: string }>>(
    `companies?select=id,name&id=in.(${companyIds.map(encodeURIComponent).join(",")})`
  ).catch(() => []);
  const nameById = new Map(companies.map((company) => [company.id, company.name]));

  return subscriptionRows.map((row) => ({ ...mapSubscriptionRow(row), companyName: nameById.get(row.company_id) || "(알 수 없는 고객사)" }));
}

async function chargeSubscriptionOnce(subscription: Subscription): Promise<{ success: boolean; message: string }> {
  const orderId = generateTossKey("order");
  const result = await chargeBilling(subscription.billingKey as string, {
    amount: subscription.planAmountWon,
    customerKey: subscription.tossCustomerKey,
    orderId,
    orderName: "마주 인텔리전스 이용료"
  });
  const now = new Date().toISOString();

  if (result.ok) {
    const payment = result.data as TossPayment;
    await supabaseRequest("subscription_payments", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([
        {
          subscription_id: subscription.id,
          company_id: subscription.companyId,
          order_id: orderId,
          toss_payment_key: payment.paymentKey,
          amount: subscription.planAmountWon,
          status: "succeeded",
          method: payment.method || null,
          card_number_masked: payment.card?.number || subscription.cardNumberMasked,
          receipt_url: payment.receipt?.url || null,
          billed_at: now
        }
      ])
    }).catch(() => null);

    // 청구 기준일은 "오늘"이 아니라 원래 예정일(next_billing_date)에서 한 달을 더합니다 — cron이
    // 하루 늦게 돌아도 매달 청구일이 조금씩 밀리지 않도록 하기 위해서입니다.
    const nextBillingDate = addMonthsClamped(subscription.nextBillingDate || toDateOnly(new Date()), 1);
    await supabaseRequest(`subscriptions?company_id=eq.${encodeURIComponent(subscription.companyId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        last_payment_status: "succeeded",
        last_payment_at: now,
        last_payment_message: null,
        next_billing_date: nextBillingDate,
        updated_at: now
      })
    }).catch(() => null);

    return { success: true, message: "결제 성공" };
  }

  const failureMessage = result.error.message || "알 수 없는 오류로 결제에 실패했습니다.";
  await supabaseRequest("subscription_payments", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([
      {
        subscription_id: subscription.id,
        company_id: subscription.companyId,
        order_id: orderId,
        amount: subscription.planAmountWon,
        status: "failed",
        failure_code: result.error.code || null,
        failure_message: failureMessage,
        billed_at: now
      }
    ])
  }).catch(() => null);

  // next_billing_date는 그대로 둡니다 — 다음 날 cron이 다시 돌 때 같은 구독이 여전히
  // "연체(next_billing_date <= today)" 상태로 잡혀 자동으로 재시도됩니다.
  await supabaseRequest(`subscriptions?company_id=eq.${encodeURIComponent(subscription.companyId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      last_payment_status: "failed",
      last_payment_at: now,
      last_payment_message: failureMessage,
      updated_at: now
    })
  }).catch(() => null);

  if (isTelegramConfigured()) {
    const companies = await supabaseRequest<Array<{ telegram_chat_id: string | null }>>(
      `companies?select=telegram_chat_id&id=eq.${encodeURIComponent(subscription.companyId)}&limit=1`
    ).catch(() => []);
    const chatId = companies[0]?.telegram_chat_id;
    if (chatId) {
      await sendTelegramMessage(
        chatId,
        `⚠️ 마주 인텔리전스 이용료 자동결제 실패\n금액: ${subscription.planAmountWon.toLocaleString()}원\n사유: ${failureMessage}\n결제 관리 화면에서 카드 정보를 확인해주세요. 내일 자동으로 다시 시도합니다.`
      ).catch(() => null);
    }
  }

  return { success: false, message: failureMessage };
}

/**
 * 매달 자동청구 cron 진입점입니다(app/api/cron/business-status/route.ts에서 호출 — Vercel Hobby
 * 플랜 cron 슬롯 2개 제한 때문에 새 cron을 추가하지 않고 기존 일일 배치에 합쳤습니다). status가
 * active고 billingKey가 있고 next_billing_date가 오늘까지인 구독만 청구합니다. 월 이용료가 아직
 * 0원(관리자가 설정 전)인 구독은 건너뜁니다.
 */
export async function chargeDueSubscriptions(referenceDate = new Date()): Promise<{
  configured: boolean;
  charged: number;
  succeeded: number;
  failed: number;
  skipped: number;
}> {
  if (!isProductionStoreConfigured() || !isTossPaymentsConfigured()) {
    return { configured: false, charged: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  const todayIso = toDateOnly(referenceDate);
  const rows = await supabaseRequest<SubscriptionRow[]>(
    `subscriptions?select=*&status=eq.active&billing_key=not.is.null&next_billing_date=lte.${todayIso}`
  ).catch((error) => {
    if (isMissingSubscriptionsTableError(error)) return [];
    throw error;
  });

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const subscription = mapSubscriptionRow(row);
    if (!subscription.billingKey || subscription.planAmountWon <= 0) {
      skipped += 1;
      continue;
    }
    const outcome = await chargeSubscriptionOnce(subscription);
    if (outcome.success) succeeded += 1;
    else failed += 1;
  }

  return { configured: true, charged: rows.length, succeeded, failed, skipped };
}

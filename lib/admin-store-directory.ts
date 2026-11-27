import { findAdminStoreDuplicateIds } from "../domains/store/admin-store-directory";
import { supabaseRequest } from "./store";

type ProfileRow = { id: string; store_name: string; business_registration_number: string | null; business_status: string; base_address: string | null; address_detail: string | null; status: string; origin: string; created_at: string };
type MemberRow = { id: string; store_profile_id: string; role: string; status: string; app_users: { name: string; phone: string | null; email: string | null; kakao_user_id: string | null; last_login_at: string | null } | null };
type AccountRow = { id: string; company_id: string; customer_id: string; store_profile_id: string | null; status: string; customer_review_status: string | null };
type OrderRow = { store_account_id: string | null; submitted_at: string };
type CompanyRow = { id: string; name: string };
type CustomerRow = { id: string; customer_name: string };
type ChangeRow = { id: string; store_profile_id: string; actor_member_id: string; changed_fields: string[]; created_at: string };

export type AdminStoreDirectoryItem = {
  id: string; storeName: string; businessNumber: string | null; businessStatus: string; address: string | null;
  status: string; origin: string; createdAt: string; recentOrderAt: string | null; duplicateSuspected: boolean;
  connections: Array<{ id: string; companyId: string; companyName: string; customerName: string; status: string; reviewStatus: string | null }>;
  members: Array<{ id: string; name: string; phone: string | null; email: string | null; kakaoLinked: boolean; role: string; status: string; lastLoginAt: string | null }>;
  changes: Array<{ id: string; actorName: string; fields: string[]; createdAt: string }>;
};

export async function getAdminStoreDirectory(): Promise<AdminStoreDirectoryItem[]> {
  if (process.env.CI_ADMIN_STORE_FIXTURES === "enabled" && process.env.VERCEL_ENV !== "production") return fixtureStores;
  const [profiles, members, accounts, companies, customers, changes, orders] = await Promise.all([
    supabaseRequest<ProfileRow[]>("store_profiles?select=id,store_name,business_registration_number,business_status,base_address,address_detail,status,origin,created_at&order=updated_at.desc&limit=1000"),
    supabaseRequest<MemberRow[]>("store_profile_members?select=id,store_profile_id,role,status,app_users(name,phone,email,kakao_user_id,last_login_at)&order=joined_at.asc&limit=5000"),
    supabaseRequest<AccountRow[]>("store_accounts?select=id,company_id,customer_id,store_profile_id,status,customer_review_status&store_profile_id=not.is.null&limit=5000"),
    supabaseRequest<CompanyRow[]>("companies?select=id,name&limit=1000"),
    supabaseRequest<CustomerRow[]>("normalized_customers?select=id,customer_name&limit=5000"),
    supabaseRequest<ChangeRow[]>("store_profile_change_events?select=id,store_profile_id,actor_member_id,changed_fields,created_at&order=created_at.desc&limit=5000").catch(() => []),
    supabaseRequest<OrderRow[]>("store_orders?select=store_account_id,submitted_at&store_account_id=not.is.null&order=submitted_at.desc&limit=5000").catch(() => []),
  ]);
  const companyNames = new Map(companies.map((row) => [row.id, row.name]));
  const customerNames = new Map(customers.map((row) => [row.id, row.customer_name]));
  const actorNames = new Map(members.map((row) => [row.id, row.app_users?.name || "알 수 없음"]));
  const recentOrderByAccount = new Map<string, string>();
  for (const order of orders) if (order.store_account_id && !recentOrderByAccount.has(order.store_account_id)) recentOrderByAccount.set(order.store_account_id, order.submitted_at);
  const duplicateIds = findAdminStoreDuplicateIds(profiles.map((row) => ({
    id: row.id, storeName: row.store_name, businessNumber: row.business_registration_number, address: row.base_address,
  })));
  return profiles.map((profile) => ({
    id: profile.id, storeName: profile.store_name, businessNumber: profile.business_registration_number,
    businessStatus: profile.business_status, address: [profile.base_address, profile.address_detail].filter(Boolean).join(" ") || null,
    status: profile.status, origin: profile.origin, createdAt: profile.created_at,
    recentOrderAt: accounts.filter((row) => row.store_profile_id === profile.id).map((row) => recentOrderByAccount.get(row.id) || null).filter((value): value is string => Boolean(value)).sort().at(-1) || null,
    duplicateSuspected: duplicateIds.has(profile.id),
    connections: accounts.filter((row) => row.store_profile_id === profile.id).map((row) => ({
      id: row.id, companyId: row.company_id, companyName: companyNames.get(row.company_id) || "알 수 없는 유통사",
      customerName: customerNames.get(row.customer_id) || "연결 매출처 미확인", status: row.status,
      reviewStatus: row.customer_review_status,
    })),
    members: members.filter((row) => row.store_profile_id === profile.id).map((row) => ({
      id: row.id, name: row.app_users?.name || "이름 없음", phone: row.app_users?.phone || null,
      email: row.app_users?.email || null, kakaoLinked: Boolean(row.app_users?.kakao_user_id), role: row.role, status: row.status, lastLoginAt: row.app_users?.last_login_at || null,
    })),
    changes: changes.filter((row) => row.store_profile_id === profile.id).map((row) => ({
      id: row.id, actorName: actorNames.get(row.actor_member_id) || "알 수 없음", fields: row.changed_fields || [], createdAt: row.created_at,
    })),
  }));
}

const fixtureStores: AdminStoreDirectoryItem[] = [
  {
    id: "10000000-0000-4000-8000-000000000001", storeName: "합성 중앙식당", businessNumber: "1234567890",
    businessStatus: "active", address: "서울특별시 중구 합성로 10 1층", status: "active", origin: "direct", createdAt: "2026-11-01T00:00:00Z", recentOrderAt: "2026-11-26T03:00:00Z",
    duplicateSuspected: true,
    connections: [
      { id: "a1", companyId: "c1", companyName: "합성 유통사 A", customerName: "중앙식당 본점", status: "active", reviewStatus: null },
      { id: "a2", companyId: "c2", companyName: "합성 유통사 B", customerName: "합성 중앙식당", status: "active", reviewStatus: "needs_review" },
    ],
    members: [{ id: "m1", name: "합성 점주", phone: "010-0000-0000", email: "owner@example.test", kakaoLinked: true, role: "owner", status: "active", lastLoginAt: "2026-11-26T02:00:00Z" }],
    changes: [{ id: "e1", actorName: "합성 점주", fields: ["storeName", "baseAddress"], createdAt: "2026-11-17T00:00:00Z" }],
  },
  {
    id: "10000000-0000-4000-8000-000000000002", storeName: "합성 중앙 식당", businessNumber: "1234567890",
    businessStatus: "registration_pending", address: "서울특별시 중구 합성로 10 1층", status: "active", origin: "link", createdAt: "2026-11-02T00:00:00Z", recentOrderAt: null,
    duplicateSuspected: true,
    connections: [], members: [], changes: [],
  },
];

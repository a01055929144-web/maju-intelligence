import "server-only";

import { supabaseRequest } from "../store";
import type { CompanyNotification } from "../notification-list";

type Row = { id: string; notification_type: string; store_account_id: string | null; customer_id: string | null; before_values: Record<string, unknown>; after_values: Record<string, unknown>; read_at: string | null; processed_at: string | null; created_at: string };

export async function listCompanyStoreNotifications(companyId: string): Promise<CompanyNotification[]> {
  const rows = await supabaseRequest<Row[]>(`company_notifications?select=id,notification_type,store_account_id,customer_id,before_values,after_values,read_at,processed_at,created_at` +
    `&company_id=eq.${encodeURIComponent(companyId)}&notification_type=in.(new_store,store_review_required,store_profile_changed)&order=created_at.desc&limit=100`);
  return rows.map(row => ({ id: row.id, notificationType: row.notification_type, createdAt: row.created_at, readAt: row.read_at,
    processedAt: row.processed_at, beforeValues: row.before_values, afterValues: row.after_values,
    subject: String(row.after_values.storeName || row.before_values.storeName || "매장") }));
}

export async function markCompanyNotificationRead(companyId: string, notificationId: string, actorId: string) {
  await supabaseRequest(`company_notifications?company_id=eq.${encodeURIComponent(companyId)}&id=eq.${encodeURIComponent(notificationId)}&read_at=is.null`, {
    method: "PATCH", body: JSON.stringify({ read_at: new Date().toISOString(), read_by_user_id: actorId }), headers: { Prefer: "return=minimal" },
  });
}

export async function processCompanyStoreNotification(input: { actorId: string; actorName: string; companyId: string; notificationId: string; type: string }) {
  const rows = await supabaseRequest<Array<{ store_account_id: string | null }>>(`company_notifications?select=store_account_id&company_id=eq.${encodeURIComponent(input.companyId)}&id=eq.${encodeURIComponent(input.notificationId)}&notification_type=eq.${encodeURIComponent(input.type)}&limit=1`);
  const storeAccountId = rows[0]?.store_account_id;
  if (!storeAccountId) throw new Error("notification_not_found");
  if (input.type === "store_profile_changed") return supabaseRequest("rpc/apply_store_profile_notification_v1", { method: "POST", body: JSON.stringify({
    p_company: input.companyId, p_notification: input.notificationId, p_actor: input.actorId, p_apply_store_name: false,
  }) });
  return supabaseRequest("rpc/confirm_new_store_account_v1", { method: "POST", body: JSON.stringify({ p_company: input.companyId,
    p_store_account: storeAccountId, p_target_customer: null, p_actor: input.actorId, p_actor_name: input.actorName }) });
}

import {
  normalizeSensitiveAccessItem,
  normalizeSensitiveAccessWarning,
  type SensitiveAccessItem,
  type SensitiveAccessLog,
  type SensitiveAccessLogFilters,
  type SensitiveAccessWarningCode
} from "../../domains/organization/sensitive-access-log";
import { supabaseRequest } from "../store";

type SensitiveAccessLogRow = {
  accessed_at: string;
  actor_name: string;
  actor_role: string;
  device_label: string | null;
  hidden_at: string | null;
  id: string;
  item_type: string;
  page_path: string;
  store_name: string | null;
  warning_codes: unknown;
};

export function sensitiveAccessLogsEnabled() {
  return process.env.SENSITIVE_ACCESS_LOGS_ENABLED === "true";
}

export async function isActiveCompanyOwner(input: { companyId: string; userId: string }) {
  const rows = await supabaseRequest<Array<{ permission_role: string | null; role: string | null }>>(
    `company_members?select=permission_role,role&company_id=eq.${encodeURIComponent(input.companyId)}&user_id=eq.${encodeURIComponent(input.userId)}&status=eq.active&limit=1`
  );
  const member = rows[0];
  return member?.permission_role === "owner" || member?.role === "owner";
}

function mapLog(row: SensitiveAccessLogRow): SensitiveAccessLog {
  return {
    accessedAt: row.accessed_at,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    deviceLabel: row.device_label || "알 수 없는 기기",
    hiddenAt: row.hidden_at,
    id: row.id,
    item: normalizeSensitiveAccessItem(row.item_type) || "access_password",
    pagePath: row.page_path,
    storeName: row.store_name || "매장 미지정",
    warningCodes: Array.isArray(row.warning_codes)
      ? row.warning_codes.map(normalizeSensitiveAccessWarning).filter((value): value is SensitiveAccessWarningCode => Boolean(value))
      : []
  };
}

export async function listSensitiveAccessLogs(companyId: string, filters: SensitiveAccessLogFilters = {}) {
  const query = new URLSearchParams({
    select: "id,actor_name,actor_role,store_name,item_type,device_label,page_path,warning_codes,accessed_at,hidden_at",
    company_id: `eq.${companyId}`,
    order: "accessed_at.desc",
    limit: "200"
  });
  if (!filters.includeHidden) query.set("hidden_at", "is.null");
  if (filters.from) query.set("accessed_at", `gte.${filters.from}`);
  if (filters.to) query.append("accessed_at", `lte.${filters.to}`);
  if (filters.userId) query.set("actor_user_id", `eq.${filters.userId}`);
  if (filters.role) query.set("actor_role", `eq.${filters.role}`);
  if (filters.item) query.set("item_type", `eq.${filters.item}`);
  if (filters.warning) query.set("warning_codes", `cs.{${filters.warning}}`);
  const safeQuery = filters.query?.replace(/[(),*%]/g, " ").trim();
  if (safeQuery) query.set("or", `(actor_name.ilike.*${safeQuery}*,store_name.ilike.*${safeQuery}*,device_label.ilike.*${safeQuery}*)`);
  const rows = await supabaseRequest<SensitiveAccessLogRow[]>(`sensitive_access_logs?${query.toString()}`);
  return rows.map(mapLog);
}

export async function recordSensitiveAccessLog(input: {
  actorName: string;
  actorRole: string;
  actorUserId: string;
  companyId: string;
  deviceLabel?: string;
  item: SensitiveAccessItem;
  pagePath: string;
  storeId?: string;
  storeName?: string;
  warningCodes?: SensitiveAccessWarningCode[];
}) {
  if (!sensitiveAccessLogsEnabled()) return;
  await supabaseRequest("sensitive_access_logs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{ company_id: input.companyId, actor_user_id: input.actorUserId, actor_name: input.actorName, actor_role: input.actorRole, store_id: input.storeId || null, store_name: input.storeName || null, item_type: input.item, device_label: input.deviceLabel || null, page_path: input.pagePath, warning_codes: input.warningCodes || [] }])
  });
}

export async function hideSensitiveAccessLog(input: { actorUserId: string; companyId: string; logId: string }) {
  const now = new Date().toISOString();
  await supabaseRequest(`sensitive_access_logs?id=eq.${encodeURIComponent(input.logId)}&company_id=eq.${encodeURIComponent(input.companyId)}&hidden_at=is.null`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ hidden_at: now, hidden_by: input.actorUserId })
  });
  return now;
}

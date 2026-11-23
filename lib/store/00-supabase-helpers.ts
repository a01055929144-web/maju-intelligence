import { getSupabaseConfig, supabaseRequest } from "./00-core";

export function isInvalidSupabaseApiKeyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Invalid API key") || message.includes("Forbidden use of secret API key");
}

export function isMissingCustomerPlaceLinksColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return ["naver_place_url", "kakao_place_url", "google_map_url", "place_links_checked_at"].some((column) => message.includes(column));
}

export function isMissingCustomerHoursMenuColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return ["business_hours", "menu_summary"].some((column) => message.includes(column));
}

export function isMissingCustomerRelationshipStatusColumnError(error: unknown) {
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
export function isMissingColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("42703") || message.includes("does not exist") || message.includes("PGRST204") || message.includes("schema cache");
}

export function isMissingDeliveryIdempotencyColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("idempotency_key") && isMissingColumnError(error);
}

export function removePasswordHashFromBody(body: BodyInit | null | undefined) {
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

export function removeCompanyWorkspaceFieldsFromBody(body: BodyInit | null | undefined) {
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

export async function appUsersRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await supabaseRequest<T>(path, init);
  } catch (error) {
    const bodyWithoutPasswordHash = removePasswordHashFromBody(init.body);
    if (!isMissingColumnError(error) || bodyWithoutPasswordHash === init.body) throw error;
    return supabaseRequest<T>(path, { ...init, body: bodyWithoutPasswordHash });
  }
}

export async function companiesRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await supabaseRequest<T>(path, init);
  } catch (error) {
    const bodyWithoutWorkspaceFields = removeCompanyWorkspaceFieldsFromBody(init.body);
    if (!isMissingColumnError(error) || bodyWithoutWorkspaceFields === init.body) throw error;
    return supabaseRequest<T>(path, { ...init, body: bodyWithoutWorkspaceFields });
  }
}

export function isMissingTelegramChatIdColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("telegram_chat_id");
}

export function isMissingStaffAssignmentOverrideColumnError(error: unknown) {
  if (!isMissingColumnError(error)) return false;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("assigned_manager_name") || message.includes("assigned_vehicle");
}

export async function supabaseStorageRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
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

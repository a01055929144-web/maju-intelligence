/**
 * Login/signup/forgot-password throttling.
 *
 * Backed by the public.login_throttle_attempts Supabase table (see
 * supabase/migrations/20260907d_login_throttle.sql) so the limit actually holds across
 * Vercel's multiple concurrent serverless instances and survives cold starts, unlike a
 * plain in-memory Map.
 *
 * If Supabase is not configured (e.g. local dev without env vars), this falls back to the
 * previous best-effort in-memory Map so login still works, just without durable throttling.
 */

type AttemptRecord = {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number | null;
};

const MAX_FAILURES = 5;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

const memoryAttempts = new Map<string, AttemptRecord>();

type SupabaseConfig = { serviceRoleKey: string; url: string };

function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !serviceRoleKey) return null;
  return { serviceRoleKey, url: url.replace(/\/$/, "") };
}

type ThrottleRow = {
  failures: number;
  first_failure_at: string;
  identifier: string;
  locked_until: string | null;
};

async function supabaseThrottleRequest<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  const config = getSupabaseConfig();
  if (!config) return null;
  try {
    const response = await fetch(`${config.url}/rest/v1/login_throttle_attempts${path}`, {
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
    if (!response.ok) return null;
    const text = await response.text();
    return text ? (JSON.parse(text) as T) : (null as T);
  } catch {
    return null;
  }
}

function memoryPruneExpired(now: number) {
  for (const [key, record] of Array.from(memoryAttempts)) {
    const windowExpired = now - record.firstFailureAt > WINDOW_MS && (!record.lockedUntil || now > record.lockedUntil);
    if (windowExpired) memoryAttempts.delete(key);
  }
}

export async function checkLoginThrottle(identifier: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const key = identifier.trim().toLowerCase();
  const now = Date.now();

  const config = getSupabaseConfig();
  if (config) {
    const rows = await supabaseThrottleRequest<ThrottleRow[]>(`?identifier=eq.${encodeURIComponent(key)}&select=*`);
    const record = rows?.[0];
    if (record?.locked_until) {
      const lockedUntil = new Date(record.locked_until).getTime();
      if (Number.isFinite(lockedUntil) && now < lockedUntil) {
        return { allowed: false, retryAfterSeconds: Math.ceil((lockedUntil - now) / 1000) };
      }
    }
    return { allowed: true };
  }

  const record = memoryAttempts.get(key);
  if (record?.lockedUntil && now < record.lockedUntil) {
    return { allowed: false, retryAfterSeconds: Math.ceil((record.lockedUntil - now) / 1000) };
  }
  return { allowed: true };
}

export async function recordLoginFailure(identifier: string): Promise<void> {
  const key = identifier.trim().toLowerCase();
  const now = Date.now();

  const config = getSupabaseConfig();
  if (config) {
    const rows = await supabaseThrottleRequest<ThrottleRow[]>(`?identifier=eq.${encodeURIComponent(key)}&select=*`);
    const existing = rows?.[0];
    const firstFailureAt = existing && now - new Date(existing.first_failure_at).getTime() <= WINDOW_MS
      ? existing.first_failure_at
      : new Date(now).toISOString();
    const failures = existing && now - new Date(existing.first_failure_at).getTime() <= WINDOW_MS ? existing.failures + 1 : 1;
    const lockedUntil = failures >= MAX_FAILURES ? new Date(now + LOCKOUT_MS).toISOString() : null;

    await supabaseThrottleRequest(`?on_conflict=identifier`, {
      body: JSON.stringify([{ failures, first_failure_at: firstFailureAt, identifier: key, locked_until: lockedUntil, updated_at: new Date(now).toISOString() }]),
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      method: "POST"
    });
    return;
  }

  memoryPruneExpired(now);
  const record = memoryAttempts.get(key);
  if (!record || now - record.firstFailureAt > WINDOW_MS) {
    memoryAttempts.set(key, { failures: 1, firstFailureAt: now, lockedUntil: null });
    return;
  }
  const failures = record.failures + 1;
  const lockedUntil = failures >= MAX_FAILURES ? now + LOCKOUT_MS : null;
  memoryAttempts.set(key, { failures, firstFailureAt: record.firstFailureAt, lockedUntil });
}

export async function clearLoginThrottle(identifier: string): Promise<void> {
  const key = identifier.trim().toLowerCase();

  const config = getSupabaseConfig();
  if (config) {
    await supabaseThrottleRequest(`?identifier=eq.${encodeURIComponent(key)}`, {
      headers: { Prefer: "return=minimal" },
      method: "DELETE"
    });
    return;
  }

  memoryAttempts.delete(key);
}

/**
 * Best-effort login throttling.
 *
 * This is an in-memory, single-instance limiter: it protects a warm serverless instance from
 * rapid brute-force attempts, but does NOT share state across concurrent Vercel instances or
 * survive cold starts. For durable, distributed protection, back this with a shared store
 * (a Supabase table or a service like Upstash Redis) instead of the in-memory Map below.
 */

type AttemptRecord = {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number | null;
};

const MAX_FAILURES = 5;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

const attempts = new Map<string, AttemptRecord>();

function pruneExpired(now: number) {
  for (const [key, record] of Array.from(attempts)) {
    const windowExpired = now - record.firstFailureAt > WINDOW_MS && (!record.lockedUntil || now > record.lockedUntil);
    if (windowExpired) attempts.delete(key);
  }
}

export function checkLoginThrottle(identifier: string): { allowed: boolean; retryAfterSeconds?: number } {
  const key = identifier.trim().toLowerCase();
  const now = Date.now();
  const record = attempts.get(key);

  if (record?.lockedUntil && now < record.lockedUntil) {
    return { allowed: false, retryAfterSeconds: Math.ceil((record.lockedUntil - now) / 1000) };
  }

  return { allowed: true };
}

export function recordLoginFailure(identifier: string) {
  const key = identifier.trim().toLowerCase();
  const now = Date.now();
  pruneExpired(now);

  const record = attempts.get(key);
  if (!record || now - record.firstFailureAt > WINDOW_MS) {
    attempts.set(key, { failures: 1, firstFailureAt: now, lockedUntil: null });
    return;
  }

  const failures = record.failures + 1;
  const lockedUntil = failures >= MAX_FAILURES ? now + LOCKOUT_MS : null;
  attempts.set(key, { failures, firstFailureAt: record.firstFailureAt, lockedUntil });
}

export function clearLoginThrottle(identifier: string) {
  attempts.delete(identifier.trim().toLowerCase());
}

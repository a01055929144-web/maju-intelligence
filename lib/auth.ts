import { cookies } from "next/headers";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { getAuthCredentials, getCustomerLoginCredentials, updateAdminPasswordHash, updateCustomerPasswordHash, updateCustomerUserLastLogin } from "./store";
import { hashPassword, isHashedPassword, verifyPassword } from "./password";
import { AppUserRole, canUseWorkspaceFeature, WorkspaceCapability, WorkspaceRole, WorkspaceType, normalizeWorkspaceRole } from "./workspace";

export type AdminSession = {
  email: string;
  role: "super_admin" | "operator";
  appRole: Extract<AppUserRole, "maju_super_admin" | "maju_operator">;
  name: string;
};

export type CustomerSession = {
  appRole: Extract<AppUserRole, "customer_user">;
  assignmentKeys?: string[];
  companyId: string;
  companyName: string;
  email: string;
  role: "owner" | "member";
  name: string;
  userId?: string;
  workspaceRole: WorkspaceRole;
  workspaceType: WorkspaceType;
};

const ADMIN_COOKIE_NAME = "maju_admin_session";
const CUSTOMER_COOKIE_NAME = "maju_customer_session";
const DEFAULT_ADMIN_EMAIL = "admin@maju.local";
const DEFAULT_ADMIN_PASSWORD = "maju-admin-2026";
const DEFAULT_CUSTOMER_EMAIL = "owner@maju.local";
const DEFAULT_CUSTOMER_PASSWORD = "maju-owner-2026";
const DEFAULT_CUSTOMER_COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const LONG_LIVED_SESSION_SECONDS = 60 * 60 * 24 * 365 * 10;

function getSecret() {
  if (process.env.ADMIN_SESSION_SECRET) return process.env.ADMIN_SESSION_SECRET;
  return process.env.NODE_ENV === "production" ? "missing-production-session-secret" : "local-development-session-secret";
}

function isDevelopmentAdminCredential(email: string, password: string) {
  return email === DEFAULT_ADMIN_EMAIL || password === DEFAULT_ADMIN_PASSWORD;
}

function isDevelopmentCustomerCredential(email: string, password: string) {
  return email === DEFAULT_CUSTOMER_EMAIL || password === DEFAULT_CUSTOMER_PASSWORD;
}

function sign(value: string) {
  return createHash("sha256").update(`${value}.${getSecret()}`).digest("hex");
}

function encodeSession(session: AdminSession | CustomerSession) {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeSession<TSession>(value?: string): TSession | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TSession;
  } catch {
    return null;
  }
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  return decodeSession<AdminSession>(cookieStore.get(ADMIN_COOKIE_NAME)?.value);
}

export async function getCustomerSession() {
  const cookieStore = await cookies();
  return decodeSession<CustomerSession>(cookieStore.get(CUSTOMER_COOKIE_NAME)?.value);
}

export async function requireAdminSession() {
  const session = await getAdminSession();
  if (!session) return null;
  return session;
}

export function resolvePageCompanyId(customerSession: CustomerSession | null, adminSession: AdminSession | null, queryCompanyId?: string) {
  if (customerSession) return customerSession.companyId;
  if (adminSession) return queryCompanyId;
  return undefined;
}

export async function getRequestAuthScope(request: NextRequest, bodyCompanyId?: string) {
  const customerSession = await getCustomerSession();
  const adminSession = await getAdminSession();

  if (!customerSession && !adminSession) {
    return {
      adminSession: null,
      companyId: undefined,
      customerSession: null,
      ok: false as const,
      role: "anonymous" as const
    };
  }

  if (customerSession) {
    return {
      adminSession,
      companyId: customerSession.companyId,
      customerSession,
      ok: true as const,
      role: "customer" as const
    };
  }

  const queryCompanyId = request.nextUrl.searchParams.get("companyId") || undefined;
  const adminCompanyId = bodyCompanyId || queryCompanyId;

  if (!adminCompanyId) {
    return {
      adminSession,
      companyId: undefined,
      customerSession: null,
      ok: false as const,
      reason: "missing_company_id" as const,
      role: "admin" as const
    };
  }

  return {
    adminSession,
    companyId: adminCompanyId,
    customerSession: null,
    ok: true as const,
    role: "admin" as const
  };
}

/** Checks a customer session against the workspace capability matrix. */
export function customerHasCapability(session: CustomerSession | null, capability: WorkspaceCapability) {
  if (!session) return false;
  return canUseWorkspaceFeature(session.workspaceRole, capability);
}

/**
 * Same check for the combined admin/customer scope. MAJU admins always keep full access,
 * while customer capability rules remain centralized in lib/workspace.ts.
 */
export function scopeHasCapability(scope: Awaited<ReturnType<typeof getRequestAuthScope>>, capability: WorkspaceCapability) {
  if (!scope.ok) return false;
  if (scope.role === "admin") return true;
  return customerHasCapability(scope.customerSession, capability);
}

export async function validateAdminCredentials(email: string, password: string): Promise<AdminSession | null> {
  const credentials = await getAuthCredentials();
  const adminEmail = credentials.adminEmail || DEFAULT_ADMIN_EMAIL;
  const adminPassword = credentials.adminPassword || DEFAULT_ADMIN_PASSWORD;

  if (process.env.NODE_ENV === "production" && (!process.env.ADMIN_SESSION_SECRET || isDevelopmentAdminCredential(adminEmail, adminPassword))) {
    return null;
  }

  if (email.trim().toLowerCase() !== adminEmail.toLowerCase()) return null;
  if (!(await verifyPassword(password, adminPassword))) return null;

  // 2026-08-26 보안 수정: 평문으로 저장돼 있던 비밀번호는 로그인에 성공한 바로 이 시점에 해시로
  // 전환해 저장합니다(레이지 마이그레이션) — 비밀번호를 다시 입력받지 않고도 자연스럽게 전환됩니다.
  if (!isHashedPassword(adminPassword)) {
    await updateAdminPasswordHash(await hashPassword(password)).catch(() => null);
  }

  return {
    appRole: "maju_super_admin",
    email: adminEmail,
    role: "super_admin",
    name: "MAJU 관리자"
  };
}

export async function validateCustomerCredentials(email: string, password: string): Promise<CustomerSession | null> {
  const credentials = await getCustomerLoginCredentials(email);
  if (!credentials) return null;

  const customerEmail = credentials.customerEmail || DEFAULT_CUSTOMER_EMAIL;
  const customerPassword = credentials.customerPassword || DEFAULT_CUSTOMER_PASSWORD;

  if (process.env.NODE_ENV === "production" && isDevelopmentCustomerCredential(customerEmail, customerPassword)) {
    return null;
  }
  if (credentials.companyStatus && !["active", "fallback"].includes(credentials.companyStatus)) {
    return null;
  }
  if (credentials.userStatus && credentials.userStatus !== "active") {
    return null;
  }

  if (email.trim().toLowerCase() !== customerEmail.toLowerCase()) return null;
  if (!(await verifyPassword(password, customerPassword))) return null;

  // 2026-08-26 보안 수정: 위 관리자 로그인과 동일하게, 평문 비밀번호는 로그인 성공 시 즉시 해시로
  // 전환해 저장합니다.
  if (credentials.credentialSource !== "app_users" && !isHashedPassword(customerPassword)) {
    await updateCustomerPasswordHash(customerEmail, await hashPassword(password)).catch(() => null);
  }
  if (credentials.userId) {
    await updateCustomerUserLastLogin(credentials.userId, "password").catch(() => null);
  }

  const workspaceRole = normalizeWorkspaceRole(credentials.workspaceRole || "owner");

  return {
    appRole: "customer_user",
    assignmentKeys: credentials.assignmentKeys,
    companyId: credentials.customerCompanyId || process.env.CUSTOMER_COMPANY_ID || DEFAULT_CUSTOMER_COMPANY_ID,
    companyName: credentials.companyName,
    email: customerEmail,
    role: workspaceRole === "owner" ? "owner" : "member",
    name: credentials.ownerName || credentials.companyName,
    userId: credentials.userId,
    workspaceRole,
    workspaceType: "company"
  };
}

export async function setAdminSession(session: AdminSession) {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8
  });
}

export async function setCustomerSession(session: CustomerSession, maxAgeSeconds = 60 * 60 * 8) {
  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_COOKIE_NAME, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds
  });
}

export function getLongLivedCustomerSessionSeconds() {
  return LONG_LIVED_SESSION_SECONDS;
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
}

export async function clearCustomerSession() {
  const cookieStore = await cookies();
  cookieStore.delete(CUSTOMER_COOKIE_NAME);
}

const OAUTH_STATE_COOKIE = "maju_oauth_state";

/**
 * 2026-08-26 보안 수정(P0-6): 카카오/네이버/구글 로그인의 `state` 파라미터는 지금까지 초대 코드를
 * 그대로 실어 보내는 용도로만 쓰이고 CSRF 방지용 검증은 없었습니다. 여기서는 실제로 검증 가능한
 * 임의의 nonce를 발급해 짧은 수명의 httpOnly 쿠키에 저장하고, 콜백에서 그 쿠키 값과 대조합니다.
 * 초대 코드(또는 "personal")는 `${nonce}.${payload}` 형태로 nonce 뒤에 그대로 실어 보내 기존 동작을
 * 유지합니다.
 */
export async function createOAuthState(payload: string): Promise<string> {
  const nonce = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10
  });
  return `${nonce}.${payload}`;
}

export async function consumeOAuthState(state: string): Promise<{ ok: boolean; payload: string }> {
  const cookieStore = await cookies();
  const expectedNonce = cookieStore.get(OAUTH_STATE_COOKIE)?.value || "";
  cookieStore.delete(OAUTH_STATE_COOKIE);

  const separatorIndex = state.indexOf(".");
  if (separatorIndex === -1) return { ok: false, payload: "" };

  const nonce = state.slice(0, separatorIndex);
  const payload = state.slice(separatorIndex + 1);
  if (!expectedNonce || !nonce) return { ok: false, payload };

  const nonceBuffer = Buffer.from(nonce);
  const expectedBuffer = Buffer.from(expectedNonce);
  if (nonceBuffer.length !== expectedBuffer.length || !timingSafeEqual(nonceBuffer, expectedBuffer)) {
    return { ok: false, payload };
  }

  return { ok: true, payload };
}

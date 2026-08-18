import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { getAuthCredentials, getCustomerLoginCredentials } from "./store";
import { AppUserRole, canUseWorkspaceFeature, WorkspaceCapability, WorkspaceRole, WorkspaceType, normalizeWorkspaceRole } from "./workspace";

export type AdminSession = {
  email: string;
  role: "super_admin" | "operator";
  appRole: Extract<AppUserRole, "maju_super_admin" | "maju_operator">;
  name: string;
};

export type CustomerSession = {
  appRole: Extract<AppUserRole, "customer_user">;
  companyId: string;
  companyName: string;
  email: string;
  role: "owner" | "member";
  name: string;
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
  if (password !== adminPassword) return null;

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

  if (email.trim().toLowerCase() !== customerEmail.toLowerCase()) return null;
  if (password !== customerPassword) return null;

  return {
    appRole: "customer_user",
    companyId: credentials.customerCompanyId || process.env.CUSTOMER_COMPANY_ID || DEFAULT_CUSTOMER_COMPANY_ID,
    companyName: credentials.companyName,
    email: customerEmail,
    role: "owner",
    name: credentials.ownerName || credentials.companyName,
    workspaceRole: normalizeWorkspaceRole("owner"),
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

export async function setCustomerSession(session: CustomerSession) {
  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_COOKIE_NAME, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
}

export async function clearCustomerSession() {
  const cookieStore = await cookies();
  cookieStore.delete(CUSTOMER_COOKIE_NAME);
}

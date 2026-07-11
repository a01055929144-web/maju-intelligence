import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "crypto";
import { getAuthCredentials } from "./store";

export type AdminSession = {
  email: string;
  role: "super_admin" | "operator";
  name: string;
};

export type CustomerSession = {
  companyId: string;
  companyName: string;
  email: string;
  role: "owner" | "member";
  name: string;
};

const ADMIN_COOKIE_NAME = "maju_admin_session";
const CUSTOMER_COOKIE_NAME = "maju_customer_session";
const DEFAULT_ADMIN_EMAIL = "admin@maju.local";
const DEFAULT_ADMIN_PASSWORD = "maju-admin-2026";
const DEFAULT_CUSTOMER_EMAIL = "owner@maju.local";
const DEFAULT_CUSTOMER_PASSWORD = "maju-owner-2026";
const DEFAULT_CUSTOMER_COMPANY_ID = "00000000-0000-4000-8000-000000000001";

function getSecret() {
  return process.env.ADMIN_SESSION_SECRET || "local-development-session-secret";
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

export function getAdminSession() {
  return decodeSession<AdminSession>(cookies().get(ADMIN_COOKIE_NAME)?.value);
}

export function getCustomerSession() {
  return decodeSession<CustomerSession>(cookies().get(CUSTOMER_COOKIE_NAME)?.value);
}

export function requireAdminSession() {
  const session = getAdminSession();
  if (!session) return null;
  return session;
}

export async function validateAdminCredentials(email: string, password: string): Promise<AdminSession | null> {
  const credentials = await getAuthCredentials();
  const adminEmail = credentials.adminEmail || DEFAULT_ADMIN_EMAIL;
  const adminPassword = credentials.adminPassword || DEFAULT_ADMIN_PASSWORD;

  if (email.trim().toLowerCase() !== adminEmail.toLowerCase()) return null;
  if (password !== adminPassword) return null;

  return {
    email: adminEmail,
    role: "super_admin",
    name: "MAJU 관리자"
  };
}

export async function validateCustomerCredentials(email: string, password: string): Promise<CustomerSession | null> {
  const credentials = await getAuthCredentials();
  const customerEmail = credentials.customerEmail || DEFAULT_CUSTOMER_EMAIL;
  const customerPassword = credentials.customerPassword || DEFAULT_CUSTOMER_PASSWORD;

  if (email.trim().toLowerCase() !== customerEmail.toLowerCase()) return null;
  if (password !== customerPassword) return null;

  return {
    companyId: credentials.customerCompanyId || process.env.CUSTOMER_COMPANY_ID || DEFAULT_CUSTOMER_COMPANY_ID,
    companyName: "마주식자재",
    email: customerEmail,
    role: "owner",
    name: "정두영"
  };
}

export function setAdminSession(session: AdminSession) {
  cookies().set(ADMIN_COOKIE_NAME, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8
  });
}

export function setCustomerSession(session: CustomerSession) {
  cookies().set(CUSTOMER_COOKIE_NAME, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8
  });
}

export function clearAdminSession() {
  cookies().delete(ADMIN_COOKIE_NAME);
}

export function clearCustomerSession() {
  cookies().delete(CUSTOMER_COOKIE_NAME);
}

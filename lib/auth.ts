import { cookies } from "next/headers";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { after, NextRequest } from "next/server";
import { getActiveCustomerMembership, getAppUserAccountState, getAppUserLoginCredential, getAuthCredentials, getCustomerLoginCredentials, getCustomerWorkspaces, getManagedAdminAccountCount, updateAdminPasswordHash, updateCustomerPasswordHash, updateCustomerUserLastLogin, type CustomerAssignmentScope } from "./store";
import { hashPassword, isHashedPassword, verifyPassword } from "./password";
import { AppUserRole, canUseWorkspaceFeature, WorkspaceCapability, WorkspaceRole, WorkspaceType, normalizeWorkspaceRole } from "./workspace";
import { getStaffAccessState } from "./store/07-staff-access";
import { observeStaffSession } from "../application/organization/observe-staff-session";
import { isValidObservationDeviceId, shouldRefreshSessionObservation } from "../domains/organization/session-observation";
import { staffSessionObservationRepository } from "./store/07-session-observation";
import type { StaffDuty } from "@/domains/organization/staff-access";
import { accountLoginV2Enabled } from "./account-login-feature";
import { rolePermissionsAllowCapability, type RoleGroupKey, type RolePermissionKey } from "../domains/organization/role-settings";

export type AdminSession = {
  email: string;
  role: "super_admin" | "operator";
  appRole: Extract<AppUserRole, "maju_super_admin" | "maju_operator">;
  name: string;
  mustChangePassword?: boolean;
  sessionVersion?: number;
  userId?: string;
};

export type CustomerSession = {
  appRole: Extract<AppUserRole, "customer_user">;
  companyId: string;
  companyName: string;
  companyMemberId?: string;
  email: string;
  role: "owner" | "member";
  name: string;
  userId?: string;
  mustChangePassword?: boolean;
  sessionVersion?: number;
  workspaceRole: WorkspaceRole;
  workspaceType: WorkspaceType;
  duties?: StaffDuty[];
  rolePermissionGroup?: RoleGroupKey | null;
  rolePermissions?: RolePermissionKey[];
  /** 기록 전용 단계의 서버 발급 세션·기기 식별자. 기능 플래그 OFF에서는 생성하지 않는다. */
  appSessionId?: string;
  observationDeviceHash?: string;
  // 2026-09-07: 카카오 로그인 이름이 거래처의 배송담당자 표기와 달라 자동 매칭이 안 되는
  // 직원을 위해, 관리자가 직원 초대 화면에서 수동으로 지정한 담당자명/차량 값입니다.
  // getCustomerAssignmentKeys가 이 값도 매칭 후보로 함께 사용합니다.
  assignedManagerName?: string;
  assignedVehicle?: string;
  // 2026-09-12 버그 수정("카카오톡 초대 가입시 배송담당자랑 배송차 배송이 매끄럽지 못해"): name은
  // 카카오/네이버/구글 프로필의 실시간 닉네임이라 직원이 언제든 바꿀 수 있어, 관리자가 초대 생성 시
  // 입력한 정식 이름과 다른 경우가 흔합니다. 그 결과 위 assignedManagerName/assignedVehicle을 매번
  // 수동으로 지정해줘야만 배송 목록이 매칭되는 문제가 있었습니다. 이 값은 그 정식 이름을 자동
  // 매칭 후보로 추가해, 관리자가 애초에 거래처 담당자 표기와 같은 이름으로 초대했다면 닉네임이
  // 무엇이든 수동 개입 없이 바로 매칭되게 합니다(lib/store.ts의 normalizeInvitedEmployeeName 참고).
  invitedEmployeeName?: string;
  // 개인/오너 계정은 직원 초대명이 없으므로 회사 설정의 대표자/담당자명을 운영 표시명으로 씁니다.
  // getCustomerSession이 멤버십을 검증할 때 최신 값을 다시 읽어 설정 변경 후 재로그인 없이 반영합니다.
  operationalDisplayName?: string;
  operationalPhone?: string;
  // 호차/실물 차량은 화면 표시용입니다. 거래처 권한 판정은 기존 담당자·권역 기준을 유지합니다.
  routeUnitName?: string;
  vehicleDisplayName?: string;
};

export type StoreSession = {
  authUserId: string;
  issuedAt: number;
  expiresAt: number;
};

const ADMIN_COOKIE_NAME = "maju_admin_session";
const CUSTOMER_COOKIE_NAME = "maju_customer_session";
const STORE_COOKIE_NAME = "maju_store_session";
const CUSTOMER_DEVICE_COOKIE_NAME = "maju_customer_device";
const sessionObservationThrottle = new Map<string, number>();
const DEFAULT_CUSTOMER_EMAIL = "owner@maju.local";
const DEFAULT_CUSTOMER_PASSWORD = "maju-owner-2026";
const DEFAULT_CUSTOMER_COMPANY_ID = "00000000-0000-4000-8000-000000000001";

function getSecret() {
  if (process.env.ADMIN_SESSION_SECRET) return process.env.ADMIN_SESSION_SECRET;
  return process.env.NODE_ENV === "production" ? "missing-production-session-secret" : "local-development-session-secret";
}

function sessionObservationEnabled() {
  return process.env.STAFF_SESSION_OBSERVATION_ENABLED === "true";
}

function isDevelopmentCustomerCredential(email: string, password: string) {
  return email === DEFAULT_CUSTOMER_EMAIL || password === DEFAULT_CUSTOMER_PASSWORD;
}

function sign(value: string) {
  return createHash("sha256").update(`${value}.${getSecret()}`).digest("hex");
}

const INVITE_PHONE_COOKIE = "maju_invite_phone_ok";

/** 초대 화면에서 끝 4자리를 확인했다는 표시(15분, 초대 코드에 묶인 서명). */
export async function setInvitePhoneProof(inviteCode: string) {
  const cookieStore = await cookies();
  cookieStore.set(INVITE_PHONE_COOKIE, `${inviteCode}.${sign(`invite-phone:${inviteCode}`)}`, {
    httpOnly: true, maxAge: 60 * 15, path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production"
  });
}

export async function consumeInvitePhoneProof(inviteCode: string) {
  const cookieStore = await cookies();
  const value = cookieStore.get(INVITE_PHONE_COOKIE)?.value || "";
  cookieStore.delete(INVITE_PHONE_COOKIE);
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return false;
  const code = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const expected = sign(`invite-phone:${inviteCode}`);
  return code === inviteCode && signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function encodeSession(session: AdminSession | CustomerSession | StoreSession) {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORE_SESSION_SECONDS = 60 * 60 * 8;

export function storeMemberSessionEnabled() {
  return process.env.STORE_MEMBER_SESSION_ENABLED === "true";
}

export async function getStoreSession(): Promise<StoreSession | null> {
  if (!storeMemberSessionEnabled()) return null;
  const cookieStore = await cookies();
  const session = decodeSession<StoreSession>(cookieStore.get(STORE_COOKIE_NAME)?.value);
  const now = Math.floor(Date.now() / 1000);
  if (!session || !UUID_PATTERN.test(session.authUserId) || !Number.isSafeInteger(session.issuedAt) ||
    !Number.isSafeInteger(session.expiresAt) || session.issuedAt > now + 60 || session.expiresAt <= now ||
    session.expiresAt <= session.issuedAt || session.expiresAt - session.issuedAt > STORE_SESSION_SECONDS) return null;
  return session;
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

export async function getAdminSession(options: { allowPasswordChange?: boolean } = {}) {
  const cookieStore = await cookies();
  const session = decodeSession<AdminSession>(cookieStore.get(ADMIN_COOKIE_NAME)?.value);
  if (!accountLoginV2Enabled() || !session) return session;
  if (!session.userId) return (await getManagedAdminAccountCount()) === 0 ? session : null;
  const state = await getAppUserAccountState(session.userId);
  if (!state || state.status !== "active" || state.sessionVersion !== session.sessionVersion) return null;
  if (state.mustChangePassword && !options.allowPasswordChange) return null;
  return { ...session, mustChangePassword: state.mustChangePassword };
}

export async function getCustomerSession(options: { allowPasswordChange?: boolean } = {}) {
  const cookieStore = await cookies();
  const session = decodeSession<CustomerSession>(cookieStore.get(CUSTOMER_COOKIE_NAME)?.value);
  if (!session?.userId) return session;

  try {
    if (accountLoginV2Enabled()) {
      const state = await getAppUserAccountState(session.userId);
      if (!state || state.status !== "active" || state.sessionVersion !== session.sessionVersion) return null;
      if (state.mustChangePassword && !options.allowPasswordChange) return null;
    }
    const membership = await getActiveCustomerMembership({ companyId: session.companyId, userId: session.userId });
    if (!membership.active) return null;
    const staffAccess = await getStaffAccessState({ companyId: session.companyId, userId: session.userId });
    if (!staffAccess.active) return null;
    const workspaceRole = normalizeWorkspaceRole(membership.role || session.workspaceRole);
    const role: CustomerSession["role"] = workspaceRole === "owner" ? "owner" : "member";
    return {
      ...session,
      duties: staffAccess.duties.length ? staffAccess.duties : session.duties,
      rolePermissionGroup: staffAccess.rolePermissionGroup,
      rolePermissions: staffAccess.rolePermissions,
      companyMemberId: membership.companyMemberId,
      assignedManagerName: membership.assignedManagerName,
      assignedVehicle: membership.assignedVehicle,
      invitedEmployeeName: membership.invitedEmployeeName || session.invitedEmployeeName,
      operationalDisplayName:
        role === "owner"
          ? membership.companyOwnerName || membership.companyDisplayName
          : membership.companyDisplayName || session.operationalDisplayName,
      operationalPhone: membership.userPhone || session.operationalPhone,
      routeUnitName: membership.routeUnitName,
      vehicleDisplayName: membership.vehicleDisplayName,
      role,
      workspaceRole
    };
  } catch (error) {
    console.error("Customer membership validation failed:", error);
    return null;
  }
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
    scheduleCustomerSessionObservation(customerSession);
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

function scheduleCustomerSessionObservation(session: CustomerSession) {
  if (!sessionObservationEnabled() || !session.userId || !session.observationDeviceHash) return;
  try {
    after(() => recordCustomerSessionObservation(session));
  } catch {
    // 테스트처럼 요청 컨텍스트가 없는 환경에서는 인증 성공을 우선한다.
  }
}

async function recordCustomerSessionObservation(session: CustomerSession) {
  if (!sessionObservationEnabled() || !session.userId || !session.observationDeviceHash) return;
  const throttleKey = `${session.companyId}:${session.userId}:${session.observationDeviceHash}`;
  const now = Date.now();
  if (!shouldRefreshSessionObservation({ lastObservedAt: sessionObservationThrottle.get(throttleKey), now })) return;
  if (sessionObservationThrottle.size >= 10_000) sessionObservationThrottle.clear();
  sessionObservationThrottle.set(throttleKey, now);
  try {
    await observeStaffSession(
      {
        companyId: session.companyId,
        deviceHash: session.observationDeviceHash,
        enabled: true,
        membershipValidated: true,
        observedAt: new Date(now),
        userId: session.userId
      },
      staffSessionObservationRepository
    );
  } catch {
    sessionObservationThrottle.delete(throttleKey);
    console.error("Staff session observation failed.");
  }
}

/** Checks a customer session against the workspace capability matrix. */
export function customerHasCapability(session: CustomerSession | null, capability: WorkspaceCapability) {
  if (!session) return false;
  if (process.env.ROLE_PERMISSIONS_ENABLED === "true" && session.rolePermissionGroup) {
    return rolePermissionsAllowCapability(session.rolePermissions ?? [], capability);
  }
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

export function shouldScopeCustomerData(session: CustomerSession | null) {
  if (!session) return false;
  const role = normalizeWorkspaceRole(session.workspaceRole || session.role);
  return role !== "owner" && role !== "manager";
}

export function getCustomerAssignmentKeys(
  session: CustomerSession | null,
  options: { forceScope?: boolean } = {}
): CustomerAssignmentScope | undefined {
  if (!session) return undefined;
  if (!options.forceScope && !shouldScopeCustomerData(session)) return undefined;
  return {
    staffMemberId: session.companyMemberId,
    legacyManagerKeys: [session.userId, session.name, session.email, session.assignedManagerName, session.invitedEmployeeName]
      .map((value) => value?.trim())
      .filter(Boolean) as string[],
    legacyTerritoryKeys: [session.assignedVehicle]
      .map((value) => value?.trim())
      .filter(Boolean) as string[]
  };
}

/** Returns the stable operations-facing name used by delivery, GPS, and assignment screens. */
export function getCustomerOperationalName(session: CustomerSession | null) {
  if (!session) return "";
  const candidates = [session.invitedEmployeeName, session.operationalDisplayName, session.assignedManagerName, session.name];
  for (const candidate of candidates) {
    const normalized = candidate?.trim();
    if (normalized && !/^(개인 사용자|직원|모바일 직원|배송기사|모바일 담당자)$/.test(normalized)) return normalized;
  }
  return session.companyName?.trim() || "이름 미등록 직원";
}

export async function validateAdminCredentials(email: string, password: string): Promise<AdminSession | null> {
  if (accountLoginV2Enabled()) {
    const account = await getAppUserLoginCredential(email);
    if (account) {
      if (!["maju_super_admin", "maju_operator"].includes(account.role) || account.status !== "active") return null;
      if (account.loginLockedUntil && new Date(account.loginLockedUntil).getTime() > Date.now()) return null;
      if (!(await verifyPassword(password, account.passwordHash))) return null;
      return {
        appRole: account.role as AdminSession["appRole"],
        email: account.email || account.loginId,
        mustChangePassword: account.mustChangePassword,
        name: account.name,
        role: account.role === "maju_super_admin" ? "super_admin" : "operator",
        sessionVersion: account.sessionVersion,
        userId: account.id
      };
    }
    if ((await getManagedAdminAccountCount()) > 0) return null;
  }
  const credentials = await getAuthCredentials();
  const adminEmail = credentials.adminEmail;
  const adminPassword = credentials.adminPassword;

  if (!adminEmail || !adminPassword) return null;
  if (process.env.NODE_ENV === "production" && !process.env.ADMIN_SESSION_SECRET) return null;

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
  if (accountLoginV2Enabled()) {
    const account = await getAppUserLoginCredential(email);
    if (!account || !["customer_owner", "customer_member"].includes(account.role) || account.status !== "active") return null;
    if (account.loginLockedUntil && new Date(account.loginLockedUntil).getTime() > Date.now()) return null;
    if (!(await verifyPassword(password, account.passwordHash))) return null;
    const workspace = (await getCustomerWorkspaces({ userId: account.id }))[0];
    if (!workspace) return null;
    await updateCustomerUserLastLogin(account.id, "password").catch(() => null);
    const workspaceRole = normalizeWorkspaceRole(workspace.role || (account.role === "customer_owner" ? "owner" : "member"));
    return {
      appRole: "customer_user",
      companyId: workspace.companyId,
      companyName: workspace.companyName,
      email: account.email || account.loginId,
      mustChangePassword: account.mustChangePassword,
      name: account.name,
      role: workspaceRole === "owner" ? "owner" : "member",
      sessionVersion: account.sessionVersion,
      userId: account.id,
      workspaceRole,
      workspaceType: workspace.workspaceType
    };
  }
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

export async function setCustomerSession(session: CustomerSession, options?: { remember?: boolean }) {
  const cookieStore = await cookies();
  let sessionToStore = session;
  if (accountLoginV2Enabled() && session.userId && !session.sessionVersion) {
    const state = await getAppUserAccountState(session.userId);
    if (state) {
      sessionToStore = { ...sessionToStore, mustChangePassword: state.mustChangePassword, sessionVersion: state.sessionVersion };
    }
  }
  if (sessionObservationEnabled() && session.userId) {
    const cookieDeviceId = cookieStore.get(CUSTOMER_DEVICE_COOKIE_NAME)?.value;
    const existingDeviceId = isValidObservationDeviceId(cookieDeviceId) ? cookieDeviceId : undefined;
    const deviceId = existingDeviceId || randomBytes(32).toString("hex");
    if (!existingDeviceId) {
      cookieStore.set(CUSTOMER_DEVICE_COOKIE_NAME, deviceId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 400
      });
    }
    sessionToStore = {
      ...session,
      appSessionId: session.appSessionId || randomBytes(16).toString("hex"),
      observationDeviceHash: createHash("sha256").update(`${deviceId}.${getSecret()}`).digest("hex")
    };
  }
  cookieStore.set(CUSTOMER_COOKIE_NAME, encodeSession(sessionToStore), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: options?.remember ? 60 * 60 * 24 * 400 : 60 * 60 * 8
  });
}

export async function setStoreSession(authUserId: string) {
  if (!storeMemberSessionEnabled() || !UUID_PATTERN.test(authUserId)) return false;
  const cookieStore = await cookies();
  const issuedAt = Math.floor(Date.now() / 1000);
  cookieStore.set(STORE_COOKIE_NAME, encodeSession({ authUserId, issuedAt, expiresAt: issuedAt + STORE_SESSION_SECONDS }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STORE_SESSION_SECONDS
  });
  return true;
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
}

export async function clearCustomerSession() {
  const cookieStore = await cookies();
  cookieStore.delete(CUSTOMER_COOKIE_NAME);
}

export async function clearStoreSession() {
  const cookieStore = await cookies();
  cookieStore.delete(STORE_COOKIE_NAME);
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

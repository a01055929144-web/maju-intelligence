import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { createManagedLoginAccount, getAuthCredentials, listManagedLoginAccounts, updateManagedLoginAccount, upsertAuthCredentials } from "@/lib/store";
import { accountLoginV2Enabled } from "@/lib/account-login-feature";
import { isValidLoginId } from "@/domains/organization/account-login";
import { clearLoginThrottle } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (accountLoginV2Enabled()) {
    return NextResponse.json({ accounts: await listManagedLoginAccounts() });
  }
  const credentials = await getAuthCredentials();
  return NextResponse.json({ credentials: publicCredentials(credentials) });
}

export async function PATCH(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        adminEmail?: string;
        adminPassword?: string;
        customerCompanyId?: string;
        customerEmail?: string;
        customerPassword?: string;
        action?: "change_login_id" | "disable" | "reset_password" | "unlock";
        loginId?: string;
        targetRole?: string;
        userId?: string;
      }
    | null;

  if (accountLoginV2Enabled()) {
    if (!body?.action || !body.userId) return NextResponse.json({ message: "계정 작업 정보가 필요합니다." }, { status: 400 });
    const target = (await listManagedLoginAccounts()).find((account) => account.id === body.userId);
    if (!target) return NextResponse.json({ message: "계정을 찾을 수 없습니다." }, { status: 404 });
    if (target.role.startsWith("maju_") && session.role !== "super_admin") {
      return NextResponse.json({ message: "관리자 계정은 최고 관리자만 변경할 수 있습니다." }, { status: 403 });
    }
    if (body.action === "change_login_id" && (!body.loginId || !isValidLoginId(body.loginId))) {
      return NextResponse.json({ message: "아이디는 영문 소문자·숫자·밑줄 4~20자여야 합니다." }, { status: 400 });
    }
    const result = await updateManagedLoginAccount({ action: body.action, loginId: body.loginId, userId: body.userId });
    if (body.action === "unlock" && body.loginId) {
      await Promise.all([clearLoginThrottle(body.loginId), clearLoginThrottle(`admin:${body.loginId}`)]);
    }
    return NextResponse.json({ ...result, accounts: await listManagedLoginAccounts() });
  }

  if (!body?.adminEmail || !body.customerEmail) {
    return NextResponse.json({ message: "관리자/고객사 이메일은 필수입니다." }, { status: 400 });
  }

  const result = await upsertAuthCredentials(body, {
    actorName: session.name,
    actorRole: session.appRole
  });
  return NextResponse.json({ ...result, credentials: publicCredentials(result.credentials) });
}

export async function POST(request: NextRequest) {
  if (!accountLoginV2Enabled()) return NextResponse.json({ message: "기능이 비활성화되어 있습니다." }, { status: 404 });
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    companyId?: string;
    loginId?: string;
    name?: string;
    role?: "maju_super_admin" | "maju_operator" | "customer_owner" | "customer_member";
    workspaceRole?: "owner" | "manager" | "sales" | "driver" | "member";
  } | null;
  if (!body?.loginId || !isValidLoginId(body.loginId) || !body.name?.trim() || !body.role) {
    return NextResponse.json({ message: "아이디·이름·역할을 확인해주세요." }, { status: 400 });
  }
  if (body.role.startsWith("maju_") && session.role !== "super_admin") {
    return NextResponse.json({ message: "관리자 계정은 최고 관리자만 만들 수 있습니다." }, { status: 403 });
  }
  if (body.role.startsWith("customer_") && !body.companyId) {
    return NextResponse.json({ message: "고객사 계정에는 회사 ID가 필요합니다." }, { status: 400 });
  }
  try {
    const result = await createManagedLoginAccount({
      companyId: body.companyId,
      loginId: body.loginId,
      name: body.name,
      role: body.role,
      workspaceRole: body.workspaceRole
    });
    return NextResponse.json({ ...result, accounts: await listManagedLoginAccounts() });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "계정을 만들지 못했습니다." }, { status: 400 });
  }
}

function publicCredentials(credentials: Awaited<ReturnType<typeof getAuthCredentials>>) {
  return {
    adminEmail: credentials.adminEmail,
    adminPassword: "",
    customerEmail: credentials.customerEmail,
    customerPassword: "",
    customerCompanyId: credentials.customerCompanyId,
    updatedAt: credentials.updatedAt
  };
}

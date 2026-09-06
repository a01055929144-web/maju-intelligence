import { NextRequest, NextResponse } from "next/server";
import { clearAdminSession, setCustomerSession } from "@/lib/auth";
import { createCompanySignup } from "@/lib/store";
import { normalizeWorkspaceRole } from "@/lib/workspace";
import { checkLoginThrottle, clearLoginThrottle, recordLoginFailure } from "@/lib/rate-limit";

type CompanySignupBody = {
  companyName?: string;
  businessRegistrationNumber?: string;
  ownerName?: string;
  ownerEmail?: string;
  ownerPassword?: string;
  termsAgreed?: boolean;
  privacyAgreed?: boolean;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as CompanySignupBody | null;
  const identifier = body?.ownerEmail || "unknown";

  const throttle = checkLoginThrottle(identifier);
  if (!throttle.allowed) {
    return NextResponse.json(
      { ok: false, message: `가입 시도가 많아 잠시 제한되었습니다. ${throttle.retryAfterSeconds}초 후 다시 시도해주세요.` },
      { status: 429 }
    );
  }

  try {
    const result = await createCompanySignup({
      companyName: body?.companyName || "",
      businessRegistrationNumber: body?.businessRegistrationNumber || "",
      ownerName: body?.ownerName || "",
      ownerEmail: body?.ownerEmail || "",
      ownerPassword: body?.ownerPassword || "",
      termsAgreed: Boolean(body?.termsAgreed),
      privacyAgreed: Boolean(body?.privacyAgreed)
    });

    clearLoginThrottle(identifier);
    await clearAdminSession();
    await setCustomerSession({
      appRole: "customer_user",
      companyId: result.companyId,
      companyName: result.companyName,
      email: result.email,
      name: result.name,
      role: "owner",
      userId: result.userId,
      workspaceRole: normalizeWorkspaceRole("owner"),
      workspaceType: "company"
    });

    return NextResponse.json({ ok: true, companyId: result.companyId, companyName: result.companyName });
  } catch (error) {
    recordLoginFailure(identifier);
    const message = error instanceof Error ? error.message : "가입 처리 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}

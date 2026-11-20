import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { createBusinessPartner, findPartnerDuplicateCandidates } from "@/lib/business-partners";
import { isFeatureEnabled } from "@/lib/feature-flags";
import type { PartnerRegistrationInput } from "@/domains/partner/registration";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as (PartnerRegistrationInput & { companyId?: string; confirmCreate?: boolean }) | null;
  const scope = await getRequestAuthScope(request, body?.companyId);
  if (!scope.ok) return NextResponse.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (!isFeatureEnabled("PARTNER_REGISTRATION", scope.companyId)) return NextResponse.json({ message: "사용할 수 없는 기능입니다." }, { status: 404 });
  const allowed = body?.partnerType === "supplier" ? scopeHasCapability(scope, "manage_sales") : scopeHasCapability(scope, "manage_customers");
  if (!allowed) return NextResponse.json({ message: "거래처를 등록할 권한이 없습니다." }, { status: 403 });
  if (!body) return NextResponse.json({ message: "입력값을 확인해 주세요." }, { status: 400 });
  try {
    const candidates = await findPartnerDuplicateCandidates(scope.companyId, body);
    if (candidates.length && !body.confirmCreate) return NextResponse.json({ message: "기존 거래처 후보를 먼저 확인해 주세요.", candidates }, { status: 409 });
    return NextResponse.json({ partner: await createBusinessPartner(scope.companyId, body) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "거래처를 저장하지 못했습니다." }, { status: 400 });
  }
}

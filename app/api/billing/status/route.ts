import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { getTossClientKey, isTossPaymentsConfigured } from "@/lib/toss-payments";
import { ensureSubscription, listSubscriptionPayments } from "@/lib/store";

export const dynamic = "force-dynamic";

// 2026-09-01: 고객사 결제 관리 화면에서 현재 구독 상태(카드 등록 여부, 다음 청구일, 최근 결제
// 결과)와 결제 이력을 함께 내려줍니다. 구독 행이 아직 없으면(첫 방문) ensureSubscription이
// pending_card 상태로 하나 만들어줍니다 — 화면에 "카드를 등록해주세요"를 보여주기 위해 항상
// 구독 객체가 존재하게 합니다.
export async function GET(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok || !scope.companyId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_billing")) {
    return NextResponse.json({ message: "결제 정보를 확인할 권한이 없습니다." }, { status: 403 });
  }

  try {
    const [subscription, payments] = await Promise.all([ensureSubscription(scope.companyId), listSubscriptionPayments(scope.companyId)]);
    return NextResponse.json({
      configured: isTossPaymentsConfigured(),
      clientKey: getTossClientKey(),
      subscription,
      payments
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "결제 정보를 불러오지 못했습니다." }, { status: 400 });
  }
}

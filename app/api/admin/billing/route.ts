import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { listSubscriptionsForAdmin, updateSubscriptionPlanAmount } from "@/lib/store";

export const dynamic = "force-dynamic";

// 2026-09-01: MAJU 운영자가 전체 고객사 구독 현황을 확인하고, 고객사별 월 이용료(원)를 설정합니다.
// 이용료가 0원이면 lib/store.ts chargeDueSubscriptions()가 해당 구독을 건너뛰므로, 실제 청구를
// 시작하려면 반드시 여기서 금액을 먼저 설정해야 합니다.
export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ subscriptions: await listSubscriptionsForAdmin() });
}

export async function PATCH(request: NextRequest) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { companyId?: string; planAmountWon?: number } | null;
  if (!body?.companyId || typeof body.planAmountWon !== "number" || Number.isNaN(body.planAmountWon)) {
    return NextResponse.json({ message: "companyId와 planAmountWon(숫자)이 필요합니다." }, { status: 400 });
  }
  if (body.planAmountWon < 0) {
    return NextResponse.json({ message: "월 이용료는 0원 이상이어야 합니다." }, { status: 400 });
  }

  try {
    const subscription = await updateSubscriptionPlanAmount(body.companyId, body.planAmountWon);
    return NextResponse.json({ subscription });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "월 이용료를 저장하지 못했습니다." }, { status: 400 });
  }
}

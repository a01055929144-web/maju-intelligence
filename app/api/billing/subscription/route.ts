import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope, scopeHasCapability } from "@/lib/auth";
import { getSubscription, updateSubscriptionStatus } from "@/lib/store";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = ["active", "paused", "canceled"] as const;

// 2026-09-01: 고객사가 결제 관리 화면에서 자동결제를 일시중지/재개/해지할 수 있게 합니다.
// 카드(billingKey) 자체는 지우지 않아 재개 시 다시 등록할 필요가 없습니다.
export async function PATCH(request: NextRequest) {
  const scope = await getRequestAuthScope(request);
  if (!scope.ok || !scope.companyId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!scopeHasCapability(scope, "manage_billing")) {
    return NextResponse.json({ message: "결제 설정을 변경할 권한이 없습니다." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { status?: string } | null;
  const status = body?.status;
  if (!status || !ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])) {
    return NextResponse.json({ message: "status 값은 active/paused/canceled 중 하나여야 합니다." }, { status: 400 });
  }

  try {
    if (status === "active") {
      const current = await getSubscription(scope.companyId);
      if (!current?.billingKey) {
        return NextResponse.json({ message: "먼저 카드를 등록해야 자동결제를 시작할 수 있습니다." }, { status: 400 });
      }
    }
    const subscription = await updateSubscriptionStatus(scope.companyId, status as "active" | "paused" | "canceled");
    return NextResponse.json({ subscription });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "결제 설정을 변경하지 못했습니다." }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getRequestAuthScope } from "@/lib/auth";
import { storeOrderDeliveryCompletionEnabled } from "@/lib/pricing/store-order-delivery-feature";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  if (!storeOrderDeliveryCompletionEnabled()) {
    return NextResponse.json({ message: "주문 배송 완료 기능은 아직 활성화되지 않았습니다." }, { status: 404, headers });
  }
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ message: "같은 화면에서 다시 시도해 주세요." }, { status: 403, headers });
  }
  const scope = await getRequestAuthScope(request);
  if (!scope.ok) return NextResponse.json({ message: "로그인 상태를 확인해 주세요." }, { status: 401, headers });
  // A staff session alone cannot prove the 02 driver/confirmed route/stop/proof contract.
  // Keep every caller blocked until that server verification and atomic proof binding exist.
  return NextResponse.json({
    code: "delivery_completion_verification_unavailable",
    message: "기사·배정·증빙 확인 연결이 준비되지 않았습니다. 담당자에게 확인해 주세요.",
  }, { status: 503, headers });
}

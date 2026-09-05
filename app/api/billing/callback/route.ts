import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionByCustomerKey, saveSubscriptionBillingKey } from "@/lib/store";
import { issueBillingKey } from "@/lib/toss-payments";

export const dynamic = "force-dynamic";

// 2026-09-01: 카드 등록 위젯(client.requestBillingAuth)의 successUrl/failUrl을 동시에 이 라우트로
// 받습니다 — 성공/실패 여부는 토스가 붙여주는 쿼리 파라미터로 구분합니다(성공: authKey+customerKey,
// 실패: code+message). customerKey는 우리가 미리 발급해둔 값이라(무작위, company_id와 무관) 그
// 값으로 어느 회사의 구독인지 역으로 찾습니다 — companyId를 쿼리로 직접 받지 않아 위조 위험이
// 없습니다.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const authKey = params.get("authKey");
  const customerKey = params.get("customerKey");
  const failureCode = params.get("code");
  const failureMessage = params.get("message");
  const returnTo = "/revenue/billing";

  if (!customerKey) {
    return NextResponse.redirect(new URL(`${returnTo}?billing=fail&message=${encodeURIComponent("잘못된 콜백 요청입니다.")}`, request.url));
  }

  const subscription = await getSubscriptionByCustomerKey(customerKey).catch(() => null);
  if (!subscription) {
    return NextResponse.redirect(new URL(`${returnTo}?billing=fail&message=${encodeURIComponent("일치하는 구독 정보를 찾을 수 없습니다.")}`, request.url));
  }

  if (!authKey) {
    const message = failureMessage || "카드 등록이 취소되었습니다.";
    return NextResponse.redirect(new URL(`${returnTo}?billing=fail&message=${encodeURIComponent(message)}&code=${encodeURIComponent(failureCode || "")}`, request.url));
  }

  const issued = await issueBillingKey(authKey, customerKey);
  if (!issued.ok) {
    const message = issued.error.message || "카드 등록에 실패했습니다.";
    return NextResponse.redirect(new URL(`${returnTo}?billing=fail&message=${encodeURIComponent(message)}`, request.url));
  }

  await saveSubscriptionBillingKey(subscription.companyId, {
    billingKey: issued.data.billingKey,
    cardIssuerCode: issued.data.card?.issuerCode,
    cardNumberMasked: issued.data.card?.number
  });

  return NextResponse.redirect(new URL(`${returnTo}?billing=success`, request.url));
}

/**
 * 토스페이먼츠 자동결제(빌링) API 얇은 래퍼입니다(공식 문서, 2026-09-01 기준).
 *
 * 흐름: (1) 고객이 클라이언트에서 카드 등록 위젯을 열어(TossPayments SDK, clientKey 사용) 카드를
 * 등록하면 successUrl로 authKey+customerKey가 돌아옵니다 → (2) 서버가 issueBillingKey로 그
 * authKey를 billingKey로 교환해 저장합니다(billingKey는 이 시점에만 받을 수 있고 나중에 다시 조회할
 * 수 없어 — 반드시 즉시 저장) → (3) 매달 chargeBilling(billingKey, ...)으로 자동 청구합니다.
 *
 * 중요한 제약(2026-09-01 조사, 사용자에게 확인받은 내용): 이 빌링키 자동청구 API에는 할부
 * 파라미터가 아예 없습니다 — 할부는 카드사 정책상 구매자가 결제창을 직접 열어 인증할 때만
 * 가능해서, 사람 개입 없는 정기결제 구조와는 원천적으로 안 맞습니다. 그래서 이 서비스의 자동결제는
 * 항상 일시불로만 청구됩니다(사용자 확정: "매달 자동결제는 일시불로만").
 *
 * secretKey는 서버에서만 쓰고(Basic 인증, `${secretKey}:`를 base64 인코딩) 클라이언트로 절대
 * 내려보내지 않습니다 — clientKey만 클라이언트에 노출됩니다.
 */

import { randomBytes } from "crypto";

const TOSS_API_BASE = "https://api.tosspayments.com/v1";
// 토스 자동결제 승인은 최대 60초가 걸릴 수 있다고 공식 문서에 명시되어 있어(2026-09-01 확인),
// 타임아웃을 최소 60초 이상으로 넉넉히 잡습니다.
const BILLING_CHARGE_TIMEOUT_MS = 65_000;

export type TossBilling = {
  mId: string;
  customerKey: string;
  authenticatedAt: string;
  method: string;
  billingKey: string;
  card?: {
    issuerCode?: string;
    acquirerCode?: string;
    number?: string;
    cardType?: string;
    ownerType?: string;
  };
};

export type TossPayment = {
  paymentKey: string;
  orderId: string;
  status: string;
  approvedAt?: string;
  totalAmount: number;
  method?: string;
  card?: {
    number?: string;
    issuerCode?: string;
    installmentPlanMonths?: number;
  };
  receipt?: { url?: string };
  failure?: { code?: string; message?: string };
};

export type TossErrorResponse = { code?: string; message?: string };

function getTossSecretKey() {
  return (process.env.TOSS_SECRET_KEY || "").trim();
}

export function getTossClientKey() {
  return (process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || process.env.TOSS_CLIENT_KEY || "").trim();
}

export function isTossPaymentsConfigured() {
  const secretKey = getTossSecretKey();
  const clientKey = getTossClientKey();
  return Boolean(
    secretKey && secretKey !== "replace-with-toss-secret-key" && clientKey && clientKey !== "replace-with-toss-client-key"
  );
}

function authHeader() {
  const secretKey = getTossSecretKey();
  return `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
}

async function tossRequest<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ ok: true; data: T } | { ok: false; error: TossErrorResponse; status: number }> {
  if (!isTossPaymentsConfigured()) {
    return { ok: false, error: { message: "토스페이먼츠 연동 키(TOSS_SECRET_KEY / TOSS_CLIENT_KEY)가 설정되지 않았습니다." }, status: 0 };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs || 15_000);

  try {
    const response = await fetch(`${TOSS_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        ...(init.headers || {})
      },
      signal: controller.signal
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : {};

    if (!response.ok) {
      return { ok: false, error: body as TossErrorResponse, status: response.status };
    }
    return { ok: true, data: body as T };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { message: message.includes("abort") ? "토스페이먼츠 응답이 지연되어 시간초과되었습니다." : message }, status: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

/** authKey(카드 등록 위젯 successUrl 콜백에서 받은 1회용 토큰)를 billingKey로 교환해 발급합니다. */
export async function issueBillingKey(authKey: string, customerKey: string) {
  return tossRequest<TossBilling>("/billing/authorizations/issue", {
    method: "POST",
    body: JSON.stringify({ authKey, customerKey })
  });
}

/**
 * billingKey로 이번 달 이용료를 청구합니다. 자동결제 API에는 할부 파라미터가 없어 항상
 * 일시불로만 청구됩니다(위 파일 상단 설명 참고).
 */
export async function chargeBilling(
  billingKey: string,
  input: { amount: number; customerKey: string; orderId: string; orderName: string; customerEmail?: string; customerName?: string }
) {
  return tossRequest<TossPayment>(`/billing/${encodeURIComponent(billingKey)}`, {
    method: "POST",
    timeoutMs: BILLING_CHARGE_TIMEOUT_MS,
    body: JSON.stringify({
      amount: input.amount,
      customerKey: input.customerKey,
      orderId: input.orderId,
      orderName: input.orderName,
      customerEmail: input.customerEmail,
      customerName: input.customerName
    })
  });
}

/** 카드 변경/해지 시 기존 billingKey를 폐기합니다. */
export async function deleteBillingKey(billingKey: string) {
  return tossRequest<{ billingKey: string }>(`/billing/${encodeURIComponent(billingKey)}`, {
    method: "DELETE"
  });
}

/** 우리 쪽에서 생성하는 무작위 customerKey/orderId입니다 — 토스 정책상 2~50자, 영문/숫자/-/_만 허용됩니다. */
export function generateTossKey(prefix: string) {
  const random = randomBytes(16).toString("hex");
  return `${prefix}_${Date.now().toString(36)}${random}`.slice(0, 50);
}

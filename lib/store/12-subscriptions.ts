import { isTelegramConfigured, sendTelegramMessage } from "../telegram";
import { chargeBilling, generateTossKey, isTossPaymentsConfigured, TossPayment } from "../toss-payments";
import type { CompanyKind } from "../store";
import { isProductionStoreConfigured, normalizeCompanyKind, supabaseRequest } from "../store";

// ---------------------------------------------------------------------------------------------
// 2026-09-01 피드백: "결제프로그램도 추가해서 넣고 싶어" — 고객사가 마주 인텔리전스 이용료를 매달
// 카드로 자동결제하는 구독/청구 저장소입니다. 스키마는
// supabase/migrations/20260901_billing_subscriptions.sql, 토스페이먼츠 API 래퍼는
// lib/toss-payments.ts를 참고하세요. 사용자 확정: "매달 자동결제는 일시불로만" — 토스 자동결제
// (빌링) API에는 할부 파라미터가 없어 여기서도 할부를 다루지 않습니다.
// ---------------------------------------------------------------------------------------------

export type SubscriptionStatus = "pending_card" | "active" | "paused" | "canceled";

export type Subscription = {
  id: string;
  companyId: string;
  tossCustomerKey: string;
  billingKey: string | null;
  cardIssuerCode: string | null;
  cardNumberMasked: string | null;
  planAmountWon: number;
  status: SubscriptionStatus;
  nextBillingDate: string | null;
  lastPaymentStatus: string | null;
  lastPaymentAt: string | null;
  lastPaymentMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionPayment = {
  id: string;
  subscriptionId: string;
  companyId: string;
  orderId: string;
  tossPaymentKey: string | null;
  amount: number;
  status: "succeeded" | "failed";
  method: string | null;
  cardNumberMasked: string | null;
  receiptUrl: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  billedAt: string;
};

type SubscriptionRow = {
  id: string;
  company_id: string;
  toss_customer_key: string;
  billing_key: string | null;
  card_issuer_code: string | null;
  card_number_masked: string | null;
  plan_amount_won: number;
  status: string;
  next_billing_date: string | null;
  last_payment_status: string | null;
  last_payment_at: string | null;
  last_payment_message: string | null;
  created_at: string;
  updated_at: string;
};

type SubscriptionPaymentRow = {
  id: string;
  subscription_id: string;
  company_id: string;
  order_id: string;
  toss_payment_key: string | null;
  amount: number;
  status: string;
  method: string | null;
  card_number_masked: string | null;
  receipt_url: string | null;
  failure_code: string | null;
  failure_message: string | null;
  billed_at: string;
};

function isMissingSubscriptionsTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("PGRST205") && (message.includes("subscriptions") || message.includes("subscription_payments"));
}

const MISSING_SUBSCRIPTIONS_TABLE_MESSAGE =
  "구독/결제 저장소가 아직 준비되지 않았습니다. supabase/migrations/20260901_billing_subscriptions.sql을 Supabase SQL Editor에서 실행한 뒤 다시 시도해주세요.";

function mapSubscriptionRow(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    companyId: row.company_id,
    tossCustomerKey: row.toss_customer_key,
    billingKey: row.billing_key,
    cardIssuerCode: row.card_issuer_code,
    cardNumberMasked: row.card_number_masked,
    planAmountWon: row.plan_amount_won || 0,
    status: (row.status as SubscriptionStatus) || "pending_card",
    nextBillingDate: row.next_billing_date,
    lastPaymentStatus: row.last_payment_status,
    lastPaymentAt: row.last_payment_at,
    lastPaymentMessage: row.last_payment_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSubscriptionPaymentRow(row: SubscriptionPaymentRow): SubscriptionPayment {
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    companyId: row.company_id,
    orderId: row.order_id,
    tossPaymentKey: row.toss_payment_key,
    amount: row.amount,
    status: (row.status as "succeeded" | "failed") || "failed",
    method: row.method,
    cardNumberMasked: row.card_number_masked,
    receiptUrl: row.receipt_url,
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    billedAt: row.billed_at
  };
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

// 매달 같은 날짜에 청구하되, 대상 월에 그 날짜가 없으면(예: 1/31 + 1개월 → 2월엔 31일이 없음)
// 그 달의 마지막 날로 당겨줍니다. Date.setUTCMonth()로 그냥 더하면 없는 날짜가 다음 달로
// 넘어가버리는(1/31 + 1개월 → 3/3) 문제가 있어 직접 보정합니다.
function addMonthsClamped(dateOnly: string, months: number) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const targetIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);
  return toDateOnly(new Date(Date.UTC(targetYear, targetMonth, clampedDay)));
}

/** 카드 등록 위젯 콜백(successUrl)은 customerKey만 돌려줍니다 — 그 값으로 어느 회사의 구독인지 역으로 찾습니다. */
export async function getSubscriptionByCustomerKey(tossCustomerKey: string): Promise<Subscription | null> {
  if (!isProductionStoreConfigured()) return null;
  const rows = await supabaseRequest<SubscriptionRow[]>(
    `subscriptions?select=*&toss_customer_key=eq.${encodeURIComponent(tossCustomerKey)}&limit=1`
  ).catch((error) => {
    if (isMissingSubscriptionsTableError(error)) return [];
    throw error;
  });
  const row = rows[0];
  return row ? mapSubscriptionRow(row) : null;
}

export async function getSubscription(companyId: string): Promise<Subscription | null> {
  if (!isProductionStoreConfigured()) return null;
  const rows = await supabaseRequest<SubscriptionRow[]>(`subscriptions?select=*&company_id=eq.${encodeURIComponent(companyId)}&limit=1`).catch(
    (error) => {
      if (isMissingSubscriptionsTableError(error)) return [];
      throw error;
    }
  );
  const row = rows[0];
  return row ? mapSubscriptionRow(row) : null;
}

/** 구독 행이 없으면(첫 방문) toss_customer_key를 발급해 새로 만들고, 있으면 그대로 반환합니다. */
export async function ensureSubscription(companyId: string): Promise<Subscription> {
  if (!isProductionStoreConfigured()) throw new Error("데이터베이스가 연결되어 있지 않습니다.");

  const existing = await getSubscription(companyId);
  if (existing) return existing;

  try {
    const rows = await supabaseRequest<SubscriptionRow[]>("subscriptions", {
      method: "POST",
      body: JSON.stringify([{ company_id: companyId, toss_customer_key: generateTossKey("cust"), status: "pending_card" }])
    });
    return mapSubscriptionRow(rows[0]);
  } catch (error) {
    if (isMissingSubscriptionsTableError(error)) throw new Error(MISSING_SUBSCRIPTIONS_TABLE_MESSAGE);
    // company_id에 unique 제약이 있어, 동시 요청으로 이미 다른 요청이 먼저 만들었을 수 있습니다 — 한 번 더 조회합니다.
    const retried = await getSubscription(companyId);
    if (retried) return retried;
    throw error;
  }
}

/** 카드 등록 위젯 콜백에서 발급받은 billingKey를 저장하고 구독을 활성화합니다. */
export async function saveSubscriptionBillingKey(
  companyId: string,
  input: { billingKey: string; cardIssuerCode?: string; cardNumberMasked?: string }
): Promise<Subscription> {
  const existing = await ensureSubscription(companyId);
  const nextBillingDate = existing.nextBillingDate || addMonthsClamped(toDateOnly(new Date()), 1);

  const rows = await supabaseRequest<SubscriptionRow[]>(`subscriptions?company_id=eq.${encodeURIComponent(companyId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      billing_key: input.billingKey,
      card_issuer_code: input.cardIssuerCode || null,
      card_number_masked: input.cardNumberMasked || null,
      status: "active",
      next_billing_date: nextBillingDate,
      updated_at: new Date().toISOString()
    })
  });
  return mapSubscriptionRow(rows[0]);
}

/** MAJU 운영자가 고객사별 월 이용료를 설정합니다. */
export async function updateSubscriptionPlanAmount(companyId: string, planAmountWon: number): Promise<Subscription> {
  await ensureSubscription(companyId);
  const rows = await supabaseRequest<SubscriptionRow[]>(`subscriptions?company_id=eq.${encodeURIComponent(companyId)}`, {
    method: "PATCH",
    body: JSON.stringify({ plan_amount_won: Math.max(0, Math.round(planAmountWon)), updated_at: new Date().toISOString() })
  });
  return mapSubscriptionRow(rows[0]);
}

/** 일시중지/재개/해지 — 카드 정보(billingKey)는 그대로 두고 청구 대상 여부만 바꿉니다. */
export async function updateSubscriptionStatus(companyId: string, status: Extract<SubscriptionStatus, "active" | "paused" | "canceled">): Promise<Subscription> {
  await ensureSubscription(companyId);
  const rows = await supabaseRequest<SubscriptionRow[]>(`subscriptions?company_id=eq.${encodeURIComponent(companyId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status, updated_at: new Date().toISOString() })
  });
  return mapSubscriptionRow(rows[0]);
}

export async function listSubscriptionPayments(companyId: string, limit = 100): Promise<SubscriptionPayment[]> {
  if (!isProductionStoreConfigured()) return [];
  const rows = await supabaseRequest<SubscriptionPaymentRow[]>(
    `subscription_payments?select=*&company_id=eq.${encodeURIComponent(companyId)}&order=billed_at.desc&limit=${limit}`
  ).catch((error) => {
    if (isMissingSubscriptionsTableError(error)) return [];
    throw error;
  });
  return rows.map(mapSubscriptionPaymentRow);
}

/** 관리자용 — 전체 고객사의 구독 상태를 한 번에 조회합니다(고객사명 포함). */
export async function listSubscriptionsForAdmin(): Promise<
  Array<Omit<Subscription, "status"> & { companyName: string; companyKind: CompanyKind; status: SubscriptionStatus | "none" }>
> {
  if (!isProductionStoreConfigured()) return [];
  const [subscriptionRows, companies] = await Promise.all([
    supabaseRequest<SubscriptionRow[]>("subscriptions?select=*&order=updated_at.desc").catch((error) => {
      if (isMissingSubscriptionsTableError(error)) return [];
      throw error;
    }),
    supabaseRequest<Array<{ id: string; name: string; company_kind?: string | null }>>("companies?select=id,name,company_kind&order=created_at.desc").catch(() => [])
  ]);
  const subscriptionByCompany = new Map(subscriptionRows.map((row) => [row.company_id, row]));

  return companies.map((company) => {
    const row = subscriptionByCompany.get(company.id);
    const companyKind = normalizeCompanyKind(company.company_kind);
    if (row) return { ...mapSubscriptionRow(row), companyName: company.name, companyKind };
    return {
      id: `none-${company.id}`,
      companyId: company.id,
      companyName: company.name,
      companyKind,
      tossCustomerKey: "",
      billingKey: null,
      cardIssuerCode: null,
      cardNumberMasked: null,
      planAmountWon: 0,
      status: "none" as const,
      nextBillingDate: null,
      lastPaymentStatus: null,
      lastPaymentAt: null,
      lastPaymentMessage: null,
      createdAt: "",
      updatedAt: ""
    };
  });
}

async function chargeSubscriptionOnce(subscription: Subscription): Promise<{ success: boolean; message: string }> {
  const orderId = generateTossKey("order");
  const result = await chargeBilling(subscription.billingKey as string, {
    amount: subscription.planAmountWon,
    customerKey: subscription.tossCustomerKey,
    orderId,
    orderName: "마주 인텔리전스 이용료"
  });
  const now = new Date().toISOString();

  if (result.ok) {
    const payment = result.data as TossPayment;
    await supabaseRequest("subscription_payments", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([
        {
          subscription_id: subscription.id,
          company_id: subscription.companyId,
          order_id: orderId,
          toss_payment_key: payment.paymentKey,
          amount: subscription.planAmountWon,
          status: "succeeded",
          method: payment.method || null,
          card_number_masked: payment.card?.number || subscription.cardNumberMasked,
          receipt_url: payment.receipt?.url || null,
          billed_at: now
        }
      ])
    }).catch(() => null);

    // 청구 기준일은 "오늘"이 아니라 원래 예정일(next_billing_date)에서 한 달을 더합니다 — cron이
    // 하루 늦게 돌아도 매달 청구일이 조금씩 밀리지 않도록 하기 위해서입니다.
    const nextBillingDate = addMonthsClamped(subscription.nextBillingDate || toDateOnly(new Date()), 1);
    await supabaseRequest(`subscriptions?company_id=eq.${encodeURIComponent(subscription.companyId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        last_payment_status: "succeeded",
        last_payment_at: now,
        last_payment_message: null,
        next_billing_date: nextBillingDate,
        updated_at: now
      })
    }).catch(() => null);

    return { success: true, message: "결제 성공" };
  }

  const failureMessage = result.error.message || "알 수 없는 오류로 결제에 실패했습니다.";
  await supabaseRequest("subscription_payments", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([
      {
        subscription_id: subscription.id,
        company_id: subscription.companyId,
        order_id: orderId,
        amount: subscription.planAmountWon,
        status: "failed",
        failure_code: result.error.code || null,
        failure_message: failureMessage,
        billed_at: now
      }
    ])
  }).catch(() => null);

  // next_billing_date는 그대로 둡니다 — 다음 날 cron이 다시 돌 때 같은 구독이 여전히
  // "연체(next_billing_date <= today)" 상태로 잡혀 자동으로 재시도됩니다.
  await supabaseRequest(`subscriptions?company_id=eq.${encodeURIComponent(subscription.companyId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      last_payment_status: "failed",
      last_payment_at: now,
      last_payment_message: failureMessage,
      updated_at: now
    })
  }).catch(() => null);

  if (isTelegramConfigured()) {
    const companies = await supabaseRequest<Array<{ telegram_chat_id: string | null }>>(
      `companies?select=telegram_chat_id&id=eq.${encodeURIComponent(subscription.companyId)}&limit=1`
    ).catch(() => []);
    const chatId = companies[0]?.telegram_chat_id;
    if (chatId) {
      await sendTelegramMessage(
        chatId,
        `⚠️ 마주 인텔리전스 이용료 자동결제 실패\n금액: ${subscription.planAmountWon.toLocaleString()}원\n사유: ${failureMessage}\n결제 관리 화면에서 카드 정보를 확인해주세요. 내일 자동으로 다시 시도합니다.`
      ).catch(() => null);
    }
  }

  return { success: false, message: failureMessage };
}

/**
 * 매달 자동청구 cron 진입점입니다(app/api/cron/business-status/route.ts에서 호출 — Vercel Hobby
 * 플랜 cron 슬롯 2개 제한 때문에 새 cron을 추가하지 않고 기존 일일 배치에 합쳤습니다). status가
 * active고 billingKey가 있고 next_billing_date가 오늘까지인 구독만 청구합니다. 월 이용료가 아직
 * 0원(관리자가 설정 전)인 구독은 건너뜁니다.
 */
export async function chargeDueSubscriptions(referenceDate = new Date()): Promise<{
  configured: boolean;
  charged: number;
  succeeded: number;
  failed: number;
  skipped: number;
}> {
  if (!isProductionStoreConfigured() || !isTossPaymentsConfigured()) {
    return { configured: false, charged: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  const todayIso = toDateOnly(referenceDate);
  const rows = await supabaseRequest<SubscriptionRow[]>(
    `subscriptions?select=*&status=eq.active&billing_key=not.is.null&next_billing_date=lte.${todayIso}`
  ).catch((error) => {
    if (isMissingSubscriptionsTableError(error)) return [];
    throw error;
  });

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const subscription = mapSubscriptionRow(row);
    if (!subscription.billingKey || subscription.planAmountWon <= 0) {
      skipped += 1;
      continue;
    }
    const outcome = await chargeSubscriptionOnce(subscription);
    if (outcome.success) succeeded += 1;
    else failed += 1;
  }

  return { configured: true, charged: rows.length, succeeded, failed, skipped };
}

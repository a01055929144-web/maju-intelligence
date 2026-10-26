export type BillingPlan = {
  active: boolean;
  code: string;
  monthlyAmountWon: number;
  monthlyLeadLimit: number | null;
  name: string;
  staffLimit: number | null;
};

export const BILLING_RETRY_DAYS = [1, 3, 5] as const;
export const BILLING_GRACE_DAYS = 7;

export function recommendBillingPlan(plans: BillingPlan[], averageMonthlyLeads: number) {
  const usage = Math.max(0, Math.ceil(averageMonthlyLeads));
  return plans
    .filter((plan) => plan.active)
    .sort((left, right) => (left.monthlyLeadLimit ?? Number.MAX_SAFE_INTEGER) - (right.monthlyLeadLimit ?? Number.MAX_SAFE_INTEGER))
    .find((plan) => plan.monthlyLeadLimit === null || plan.monthlyLeadLimit >= usage) ?? null;
}

export function resolvePlanCodeForBilling(currentPlanCode: string | null, scheduledPlanCode: string | null) {
  return scheduledPlanCode || currentPlanCode;
}

export function getKstUsageMonth(referenceDate: Date) {
  const kst = new Date(referenceDate.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function buildBillingCycleKey(subscriptionId: string, billingMonth: string) {
  return `${subscriptionId}:${billingMonth.slice(0, 7)}`;
}

export function getBillingRecoveryState(dueDate: string, failedAttempts: number, referenceDate: Date) {
  const due = parseDateOnly(dueDate);
  const today = startOfKstDay(referenceDate);
  const daysPastDue = Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86_400_000));
  const nextRetryDay = BILLING_RETRY_DAYS.find((day, index) => index >= failedAttempts && day >= daysPastDue) ?? null;
  return {
    daysPastDue,
    graceUntil: toDateOnly(addUtcDays(due, BILLING_GRACE_DAYS)),
    nextRetryDate: nextRetryDay === null ? null : toDateOnly(addUtcDays(due, nextRetryDay)),
    readOnly: daysPastDue > BILLING_GRACE_DAYS
  };
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function startOfKstDay(value: Date) {
  const kst = new Date(value.getTime() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
}

function addUtcDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 86_400_000);
}

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

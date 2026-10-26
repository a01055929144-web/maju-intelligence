-- REVIEW ONLY. 운영 DB에 실행하지 않았습니다.
-- WO-8 요금제·체험·결제 실패 복구를 위한 초안입니다.

begin;

create table if not exists public.plans (
  code text primary key,
  name text not null,
  monthly_lead_limit integer check (monthly_lead_limit is null or monthly_lead_limit >= 0),
  monthly_amount_won integer not null check (monthly_amount_won >= 0),
  staff_limit integer check (staff_limit is null or staff_limit >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions add column if not exists plan_code text references public.plans(code);
alter table public.subscriptions add column if not exists scheduled_plan_code text references public.plans(code);
alter table public.subscriptions add column if not exists trial_ends_at timestamptz;
alter table public.subscriptions add column if not exists grace_until timestamptz;
alter table public.subscriptions add column if not exists retry_attempt integer not null default 0 check (retry_attempt >= 0);
alter table public.subscriptions add column if not exists next_retry_at timestamptz;

create table if not exists public.subscription_monthly_usage (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  usage_month date not null check (usage_month = date_trunc('month', usage_month)::date),
  new_lead_count integer not null default 0 check (new_lead_count >= 0),
  staff_count integer not null default 0 check (staff_count >= 0),
  measured_at timestamptz not null default now(),
  unique (company_id, usage_month)
);

alter table public.subscription_payments add column if not exists billing_month date;
alter table public.subscription_payments add column if not exists retry_attempt integer not null default 0 check (retry_attempt >= 0);
create unique index if not exists subscription_payments_billing_attempt_uq
  on public.subscription_payments (subscription_id, billing_month, retry_attempt)
  where billing_month is not null;

create index if not exists subscriptions_retry_due_idx
  on public.subscriptions (next_retry_at)
  where status = 'active' and next_retry_at is not null;
create index if not exists subscription_monthly_usage_company_month_idx
  on public.subscription_monthly_usage (company_id, usage_month desc);

alter table public.plans enable row level security;
alter table public.subscription_monthly_usage enable row level security;

commit;

-- 적용 전 확인
-- 1. plans 금액은 대표가 관리자 화면에서 입력하며 seed로 하드코딩하지 않습니다.
-- 2. 기존 subscriptions의 plan_amount_won은 전환 검증이 끝날 때까지 보존합니다.
-- 3. billing_month/retry_attempt 유니크 키를 실제 Toss orderId 멱등 처리와 함께 검증합니다.
-- 4. service role 외 접근 정책은 추가하지 않았습니다.

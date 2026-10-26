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
alter table public.subscriptions add constraint subscriptions_company_id_id_uq unique (company_id, id);

create table if not exists public.subscription_monthly_usage (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  subscription_id uuid not null,
  usage_month date not null check (usage_month = date_trunc('month', usage_month)::date),
  new_lead_count integer not null default 0 check (new_lead_count >= 0),
  staff_count integer not null default 0 check (staff_count >= 0),
  measured_at timestamptz not null default now(),
  unique (company_id, usage_month),
  constraint subscription_monthly_usage_company_subscription_fk
    foreign key (company_id, subscription_id)
    references public.subscriptions(company_id, id)
    on delete cascade
);

alter table public.subscription_payments add column if not exists billing_month date;
alter table public.subscription_payments add column if not exists retry_attempt integer not null default 0 check (retry_attempt >= 0);
alter table public.subscription_payments add column if not exists billing_cycle_key text;
do $$
begin
  if exists (
    select 1
    from public.subscription_payments payment
    join public.subscriptions subscription on subscription.id = payment.subscription_id
    where payment.company_id <> subscription.company_id
  ) then
    raise exception 'subscription_payments에 회사와 구독이 일치하지 않는 기존 행이 있습니다. 적용을 중단합니다.';
  end if;
end $$;
alter table public.subscription_payments
  add constraint subscription_payments_company_subscription_fk
  foreign key (company_id, subscription_id)
  references public.subscriptions(company_id, id)
  on delete cascade;
create unique index if not exists subscription_payments_billing_attempt_uq
  on public.subscription_payments (subscription_id, billing_month, retry_attempt)
  where billing_month is not null;
create unique index if not exists subscription_payments_billing_cycle_uq
  on public.subscription_payments (billing_cycle_key)
  where billing_cycle_key is not null;
create unique index if not exists subscription_payments_success_month_uq
  on public.subscription_payments (subscription_id, billing_month)
  where billing_month is not null and status = 'succeeded';

create index if not exists subscriptions_retry_due_idx
  on public.subscriptions (next_retry_at)
  where status = 'active' and next_retry_at is not null;
create index if not exists subscription_monthly_usage_company_month_idx
  on public.subscription_monthly_usage (company_id, usage_month desc);

alter table public.plans enable row level security;
alter table public.subscription_monthly_usage enable row level security;
revoke all on table public.plans from public, anon, authenticated;
revoke all on table public.subscription_monthly_usage from public, anon, authenticated;
grant all on table public.plans to service_role;
grant all on table public.subscription_monthly_usage to service_role;

commit;

-- 적용 전 확인
-- 1. plans 금액은 대표가 관리자 화면에서 입력하며 seed로 하드코딩하지 않습니다.
-- 2. 기존 subscriptions의 plan_amount_won은 전환 검증이 끝날 때까지 보존합니다.
-- 3. billing_cycle_key를 subscription_id + KST 청구월로 고정하고 같은 키를 Toss orderId에도 사용합니다.
--    재시도 차수가 달라도 orderId를 바꾸지 않으며, 성공 월 1건 제약을 함께 유지합니다.
-- 4. service role 외 접근 정책은 추가하지 않았습니다.

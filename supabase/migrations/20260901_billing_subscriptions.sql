-- 2026-09-01 피드백: "결제프로그램도 추가해서 넣고 싶어" — 고객사가 마주 인텔리전스 이용료를
-- 매달 카드로 자동결제(정기결제)하는 구조를 위한 테이블입니다. 토스페이먼츠 자동결제(빌링) API를
-- 씁니다(고객이 카드 등록창에서 카드를 한 번 등록하면 billingKey가 발급되고, 그 billingKey로
-- 매달 서버가 알아서 결제를 청구합니다 — 카드 번호 자체는 저장하지 않습니다, 토스가 암호화해
-- 보관합니다).
--
-- 토스페이먼츠 자동결제(빌링) API는 할부 파라미터가 없어(공식 문서 확인, 2026-09-01) 항상
-- 일시불로만 청구됩니다 — 카드사 정책상 할부는 구매자가 결제창을 직접 열어 인증할 때만
-- 가능하고, 사람 개입 없이 자동으로 청구되는 정기결제 구조와는 맞지 않습니다.
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade unique,
  -- 토스페이먼츠에서 구매자를 특정하는 값입니다(카드번호 대신 이 값과 billing_key로 결제를
  -- 냅니다). 무작위 값이어야 하므로 company_id를 그대로 쓰지 않고 별도 생성합니다.
  toss_customer_key text not null unique,
  -- 카드 등록 완료 전까지는 null입니다. 발급되면 다시 조회할 수 없어(토스 정책) 최초 1회만
  -- 저장됩니다 — 카드를 바꾸려면 재등록해서 이 값을 덮어씁니다.
  billing_key text,
  card_issuer_code text,
  card_number_masked text,
  -- 월 이용료(원). 회사마다 다를 수 있어 companies 공용 컬럼이 아니라 여기 둡니다.
  plan_amount_won integer not null default 0,
  -- pending_card(카드 미등록) | active(정상) | paused(일시중지) | canceled(해지)
  status text not null default 'pending_card',
  next_billing_date date,
  last_payment_status text,
  last_payment_at timestamptz,
  last_payment_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_company_id_idx on public.subscriptions (company_id);
create index if not exists subscriptions_billing_due_idx on public.subscriptions (next_billing_date) where status = 'active';

-- 결제 시도 이력(성공/실패 모두 기록 — 실패 이력이 남아야 "왜 이번 달에 못 받았는지" 추적 가능).
create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  -- 토스에 보내는 주문번호(우리가 생성, 충분히 무작위). 재시도 시 새로 생성해 매 시도가 구분되게
  -- 합니다.
  order_id text not null unique,
  toss_payment_key text,
  amount integer not null,
  status text not null, -- succeeded | failed
  method text,
  card_number_masked text,
  receipt_url text,
  failure_code text,
  failure_message text,
  billed_at timestamptz not null default now()
);

create index if not exists subscription_payments_company_id_idx on public.subscription_payments (company_id);
create index if not exists subscription_payments_subscription_id_idx on public.subscription_payments (subscription_id);

-- 2026-08-31 보안 감사에서 정리한 패턴과 동일: 서비스 롤 키로만 접근하고(anon key 미사용),
-- RLS는 정책 없이 켜서 서비스 롤이 아닌 접근을 기본 차단하는 안전망으로만 둡니다.
alter table public.subscriptions enable row level security;
alter table public.subscription_payments enable row level security;

-- P1-3b N1 배송 이슈·영업 제안 구조화 저장 SQL 초안
-- 상태: 검토용. 운영 DB에 적용하지 않는다.
-- 적용 전 확인: 07 C6 병합 여부, API 저장 주체, 기존 customer_notes 백필 범위.

begin;

create table if not exists public.delivery_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.normalized_customers(id) on delete cascade,
  customer_note_id uuid references public.customer_notes(id) on delete set null,
  recorded_by_user_id uuid references public.app_users(id) on delete set null,
  recorded_by_name text,
  event_type text not null,
  cause_code text,
  item_name text,
  quantity numeric,
  quantity_unit text,
  supplier_id uuid references public.product_suppliers(id) on delete set null,
  supplier_name text,
  occurrence_stage text,
  action_code text,
  action_amount numeric,
  status text not null default 'received',
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_events_type_check check (
    event_type in ('arrived', 'partial', 'return', 'replenishment', 'exchange', 'damage', 'missing', 'other')
  ),
  constraint delivery_events_cause_check check (
    cause_code is null or cause_code in (
      'frozen_thaw', 'cold_temperature', 'freshness_quality', 'damage', 'missing',
      'wrong_delivery', 'quantity_difference', 'expiration', 'packaging_defect',
      'customer_request', 'other'
    )
  ),
  constraint delivery_events_stage_check check (
    occurrence_stage is null or occurrence_stage in ('receiving', 'storage', 'loading', 'transit', 'unloading')
  ),
  constraint delivery_events_action_check check (
    action_code is null or action_code in ('redelivery', 'exchange', 'deduction', 'supplier_claim')
  ),
  constraint delivery_events_status_check check (status in ('received', 'in_progress', 'completed')),
  constraint delivery_events_quantity_check check (quantity is null or quantity > 0),
  constraint delivery_events_action_amount_check check (action_amount is null or action_amount >= 0),
  constraint delivery_events_resolution_check check (
    (status = 'completed' and resolved_at is not null) or (status <> 'completed' and resolved_at is null)
  )
);

comment on table public.delivery_events is '배송 완료·부분 배송·반품·파손 등 현장 이벤트의 집계 가능한 구조화 원장';
comment on column public.delivery_events.memo is '사람이 읽는 요약. 원인·품목·수량·단계·조치·상태의 원장 값으로 사용하지 않는다.';
comment on column public.delivery_events.supplier_name is '공급처가 외부 원장에만 있거나 삭제될 때를 위한 당시 명칭 스냅샷';

create index if not exists delivery_events_company_occurred_idx
  on public.delivery_events(company_id, occurred_at desc);
create index if not exists delivery_events_customer_occurred_idx
  on public.delivery_events(company_id, customer_id, occurred_at desc);
create index if not exists delivery_events_open_status_idx
  on public.delivery_events(company_id, status, occurred_at desc)
  where status <> 'completed';
create index if not exists delivery_events_cause_stage_idx
  on public.delivery_events(company_id, cause_code, occurrence_stage, occurred_at desc)
  where cause_code is not null;

create table if not exists public.sales_offers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.normalized_customers(id) on delete cascade,
  customer_note_id uuid references public.customer_notes(id) on delete set null,
  recorded_by_user_id uuid references public.app_users(id) on delete set null,
  recorded_by_name text,
  item_name text not null,
  offered_price numeric,
  currency_code text not null default 'KRW',
  valid_until date,
  sample_provided boolean not null default false,
  sample_quantity numeric,
  sample_unit text,
  memo text,
  offered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_offers_item_name_check check (length(btrim(item_name)) > 0),
  constraint sales_offers_price_check check (offered_price is null or offered_price >= 0),
  constraint sales_offers_currency_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint sales_offers_sample_quantity_check check (sample_quantity is null or sample_quantity > 0),
  constraint sales_offers_sample_consistency_check check (
    sample_provided or (sample_quantity is null and sample_unit is null)
  )
);

comment on table public.sales_offers is '거래처별 제안 품목·가격·유효기간·샘플 제공 내역';
comment on column public.sales_offers.memo is '사람이 읽는 특이사항. 품목·가격·유효기간·샘플 값의 원장으로 사용하지 않는다.';

create index if not exists sales_offers_company_offered_idx
  on public.sales_offers(company_id, offered_at desc);
create index if not exists sales_offers_customer_offered_idx
  on public.sales_offers(company_id, customer_id, offered_at desc);
create index if not exists sales_offers_expiring_idx
  on public.sales_offers(company_id, valid_until)
  where valid_until is not null;

alter table public.delivery_events enable row level security;
alter table public.sales_offers enable row level security;

-- 현재 앱은 서버 API의 service role만 DB에 접근한다. 정책 없이 RLS를 켜서
-- 브라우저의 anon/authenticated 직접 접근은 기본 거부한다.
revoke all on public.delivery_events from public, anon, authenticated;
revoke all on public.sales_offers from public, anon, authenticated;
grant all on public.delivery_events to service_role;
grant all on public.sales_offers to service_role;

commit;

-- 승인 후 별도 마이그레이션으로 옮길 때 추가할 작업:
-- 1. updated_at 공통 트리거 연결 여부 확인
-- 2. customer_notes의 기존 메모 백필은 읽기 전용 드라이런 결과 승인 후 별도 실행

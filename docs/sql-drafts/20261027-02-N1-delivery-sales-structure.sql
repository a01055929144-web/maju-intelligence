-- P1-3b N1 배송 이슈·영업 제안 구조화 저장 SQL 초안
-- 상태: 검토용. 운영 DB에 적용하지 않는다.
-- 적용 전 확인: 07 C6 병합 여부, API 저장 주체, 기존 customer_notes 백필 범위.

begin;

-- 복합 FK가 회사 경계를 검증할 수 있도록 기존 원장에 후보 키를 보강한다.
-- 제약 이름이 아니라 실제 컬럼 순서를 검사하여 기존 ERP 제약과 중복 인덱스를 만들지 않는다.
-- business_permit_leads(company_id, id)는 20261019143000에서 이미 UNIQUE다.
do $$
begin
  if not exists (
    select 1
      from pg_constraint c
     where c.conrelid = 'public.normalized_customers'::regclass
       and c.contype in ('p', 'u')
       and (select array_agg(a.attname order by k.ordinality)
              from unnest(c.conkey) with ordinality as k(attnum, ordinality)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
           = array['company_id', 'id']::name[]
  ) then
    alter table public.normalized_customers
      add constraint normalized_customers_company_id_id_uq unique (company_id, id);
  end if;

  if not exists (
    select 1
      from pg_constraint c
     where c.conrelid = 'public.customer_notes'::regclass
       and c.contype in ('p', 'u')
       and (select array_agg(a.attname order by k.ordinality)
              from unnest(c.conkey) with ordinality as k(attnum, ordinality)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
           = array['company_id', 'customer_id', 'id']::name[]
  ) then
    alter table public.customer_notes
      add constraint customer_notes_company_customer_id_uq unique (company_id, customer_id, id);
  end if;

  if not exists (
    select 1
      from pg_constraint c
     where c.conrelid = 'public.lead_actions'::regclass
       and c.contype in ('p', 'u')
       and (select array_agg(a.attname order by k.ordinality)
              from unnest(c.conkey) with ordinality as k(attnum, ordinality)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
           = array['company_id', 'lead_id', 'id']::name[]
  ) then
    alter table public.lead_actions
      add constraint lead_actions_company_lead_id_uq unique (company_id, lead_id, id);
  end if;
end $$;

create table if not exists public.delivery_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null,
  customer_note_id uuid not null,
  recorded_by_user_id uuid references public.app_users(id) on delete set null,
  recorded_by_name text,
  event_type text not null,
  cause_code text,
  item_name text,
  quantity numeric,
  quantity_unit text,
  supplier_id uuid,
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
  constraint delivery_events_company_id_id_uq unique (company_id, id),
  constraint delivery_events_customer_note_uq unique (company_id, customer_note_id),
  constraint delivery_events_customer_fk foreign key (company_id, customer_id)
    references public.normalized_customers(company_id, id) on delete cascade,
  constraint delivery_events_customer_note_fk foreign key (company_id, customer_id, customer_note_id)
    references public.customer_notes(company_id, customer_id, id) on delete cascade,
  constraint delivery_events_supplier_fk foreign key (company_id, supplier_id)
    references public.product_suppliers(company_id, id) on delete set null (supplier_id),
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
comment on column public.delivery_events.customer_note_id is '기존 배송 기록 원본. UNIQUE 1:1로 연결하여 구조화 행의 중복·누락을 막는다.';

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
  customer_id uuid,
  lead_id uuid,
  customer_note_id uuid,
  lead_action_id uuid,
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
  constraint sales_offers_company_id_id_uq unique (company_id, id),
  constraint sales_offers_customer_note_uq unique (company_id, customer_note_id),
  constraint sales_offers_lead_action_uq unique (company_id, lead_action_id),
  constraint sales_offers_customer_note_fk foreign key (company_id, customer_id, customer_note_id)
    references public.customer_notes(company_id, customer_id, id) on delete cascade,
  constraint sales_offers_lead_action_fk foreign key (company_id, lead_id, lead_action_id)
    references public.lead_actions(company_id, lead_id, id) on delete cascade,
  constraint sales_offers_subject_source_check check (
    (customer_id is not null and customer_note_id is not null and lead_id is null and lead_action_id is null)
    or
    (lead_id is not null and lead_action_id is not null and customer_id is null and customer_note_id is null)
  ),
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
comment on column public.sales_offers.customer_note_id is '기존 거래처 영업 기록 원본. 거래처 대상 제안은 UNIQUE 1:1로 연결한다.';
comment on column public.sales_offers.lead_action_id is '모바일 리드 방문·영업 행동 원본. 리드 대상 제안은 UNIQUE 1:1로 연결한다.';

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
-- 2. 배송 저장은 customer_notes + customer_attachments + delivery_events를 한 트랜잭션 RPC로 묶는다.
--    기존 API가 세 쓰기를 모두 성공시키기 전까지 delivery_events 읽기를 운영 화면에 연결하지 않는다.
-- 3. 리드 영업 저장은 lead_actions + sales_offers를, 기존 거래처 영업 저장은
--    customer_notes + sales_offers를 각각 한 트랜잭션 RPC로 묶는다.
--    리드가 거래처로 전환돼도 과거 제안의 lead_id/lead_action_id는 당시 원본으로 유지한다.
-- 4. 기존 메모 백필은 읽기 전용 드라이런으로 원본 note/action과 1:1 매칭된 행만 제안하고,
--    사람이 승인한 뒤 별도 마이그레이션에서 수행한다. 추론이 필요한 행은 메모로 남긴다.
-- 5. 롤백은 새 API 전환 전에는 두 신규 테이블과 세 후보 키 제약만 제거한다.

-- REVIEW ONLY. 운영 적용 및 저장 코드 배포는 별도 승인 후 진행한다.
-- 02 / 휴대폰 배송·영업 기록의 구조화 저장. 기존 메모·사진·리드 행동 기록은 변경하지 않는다.
-- customer_notes와 lead_actions에 회사 복합 참조 키를 추가해야 교차 회사 연결을 DB에서 차단할 수 있다.

begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.customer_notes'::regclass
      and contype = 'u'
      and conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.customer_notes'::regclass and attname = 'company_id'),
        (select attnum from pg_attribute where attrelid = 'public.customer_notes'::regclass and attname = 'id'),
        (select attnum from pg_attribute where attrelid = 'public.customer_notes'::regclass and attname = 'customer_id')
      ]::smallint[]
  ) then
    alter table public.customer_notes
      add constraint customer_notes_company_id_id_customer_id_uq unique (company_id, id, customer_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.lead_actions'::regclass
      and contype = 'u'
      and conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.lead_actions'::regclass and attname = 'company_id'),
        (select attnum from pg_attribute where attrelid = 'public.lead_actions'::regclass and attname = 'id'),
        (select attnum from pg_attribute where attrelid = 'public.lead_actions'::regclass and attname = 'lead_id')
      ]::smallint[]
  ) then
    alter table public.lead_actions
      add constraint lead_actions_company_id_id_lead_id_uq unique (company_id, id, lead_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.customer_attachments'::regclass
      and contype = 'u'
      and conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.customer_attachments'::regclass and attname = 'company_id'),
        (select attnum from pg_attribute where attrelid = 'public.customer_attachments'::regclass and attname = 'id'),
        (select attnum from pg_attribute where attrelid = 'public.customer_attachments'::regclass and attname = 'customer_id')
      ]::smallint[]
  ) then
    alter table public.customer_attachments
      add constraint customer_attachments_company_id_id_customer_id_uq unique (company_id, id, customer_id);
  end if;
end $$;

create table if not exists public.delivery_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  customer_id uuid not null,
  customer_note_id uuid not null,
  event_type text not null,
  cause_code text,
  item_name text,
  quantity numeric(14,3),
  quantity_unit text,
  supplier_id uuid,
  supplier_name_snapshot text,
  stage text,
  action_type text,
  action_amount bigint,
  status text not null default 'received',
  actor_user_id uuid,
  actor_name text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_events_company_fk foreign key (company_id)
    references public.companies(id) on delete cascade,
  constraint delivery_events_customer_fk foreign key (company_id, customer_id)
    references public.normalized_customers(company_id, id) on delete cascade,
  constraint delivery_events_note_fk foreign key (company_id, customer_note_id, customer_id)
    references public.customer_notes(company_id, id, customer_id) on delete cascade,
  constraint delivery_events_supplier_fk foreign key (company_id, supplier_id)
    references public.product_suppliers(company_id, id) on delete set null (supplier_id),
  constraint delivery_events_type_check check (event_type in (
    'arrived', 'partial', 'return', 'replenishment', 'exchange', 'damage', 'missing', 'other'
  )),
  constraint delivery_events_cause_check check (cause_code is null or cause_code in (
    '냉동 해동', '냉장 온도', '신선도/품질', '파손', '누락', '오배송',
    '수량 차이', '유통기한', '포장 불량', '고객 요청', '기타'
  )),
  constraint delivery_events_item_check check (item_name is null or char_length(item_name) between 1 and 200),
  constraint delivery_events_quantity_check check (quantity is null or quantity > 0),
  constraint delivery_events_unit_check check (quantity_unit is null or char_length(quantity_unit) between 1 and 30),
  constraint delivery_events_supplier_name_check check (supplier_name_snapshot is null or char_length(supplier_name_snapshot) between 1 and 200),
  constraint delivery_events_stage_check check (stage is null or stage in ('receiving', 'storage', 'loading', 'transport', 'unloading')),
  constraint delivery_events_action_check check (action_type is null or action_type in ('redelivery', 'exchange', 'discount', 'supplier_claim')),
  constraint delivery_events_amount_check check (action_amount is null or action_amount >= 0),
  constraint delivery_events_status_check check (status in ('received', 'in_progress', 'completed')),
  constraint delivery_events_note_uq unique (company_id, customer_note_id),
  constraint delivery_events_company_id_id_customer_id_uq unique (company_id, id, customer_id)
);

create index if not exists delivery_events_company_occurred_idx
  on public.delivery_events (company_id, occurred_at desc, id desc);
create index if not exists delivery_events_company_issue_idx
  on public.delivery_events (company_id, status, cause_code, occurred_at desc)
  where event_type in ('partial', 'return', 'replenishment', 'exchange', 'damage', 'missing', 'other');
create index if not exists delivery_events_company_customer_idx
  on public.delivery_events (company_id, customer_id, occurred_at desc);

create table if not exists public.delivery_event_attachments (
  company_id uuid not null,
  customer_id uuid not null,
  delivery_event_id uuid not null,
  attachment_id uuid not null,
  created_at timestamptz not null default now(),
  constraint delivery_event_attachments_pkey primary key (company_id, delivery_event_id, attachment_id),
  constraint delivery_event_attachments_event_fk foreign key (company_id, delivery_event_id, customer_id)
    references public.delivery_events(company_id, id, customer_id) on delete cascade,
  constraint delivery_event_attachments_attachment_fk foreign key (company_id, attachment_id, customer_id)
    references public.customer_attachments(company_id, id, customer_id) on delete cascade
);
create index if not exists delivery_event_attachments_attachment_idx
  on public.delivery_event_attachments (company_id, attachment_id);

create table if not exists public.sales_offers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  lead_id uuid not null,
  lead_action_id uuid not null,
  line_number integer not null default 1,
  item_name text,
  unit_price bigint,
  currency text not null default 'KRW',
  valid_until date,
  sample_item_name text,
  sample_quantity numeric(14,3),
  sample_unit text,
  actor_user_id uuid,
  actor_name text,
  created_at timestamptz not null default now(),
  constraint sales_offers_company_fk foreign key (company_id)
    references public.companies(id) on delete cascade,
  constraint sales_offers_lead_fk foreign key (company_id, lead_id)
    references public.business_permit_leads(company_id, id) on delete cascade,
  constraint sales_offers_action_fk foreign key (company_id, lead_action_id, lead_id)
    references public.lead_actions(company_id, id, lead_id) on delete cascade,
  constraint sales_offers_line_uq unique (company_id, lead_action_id, line_number),
  constraint sales_offers_line_check check (line_number > 0),
  constraint sales_offers_item_check check (item_name is null or char_length(item_name) between 1 and 200),
  constraint sales_offers_price_check check (unit_price is null or unit_price >= 0),
  constraint sales_offers_currency_check check (currency = 'KRW'),
  constraint sales_offers_sample_item_check check (sample_item_name is null or char_length(sample_item_name) between 1 and 200),
  constraint sales_offers_sample_quantity_check check (sample_quantity is null or sample_quantity > 0),
  constraint sales_offers_sample_unit_check check (sample_unit is null or char_length(sample_unit) between 1 and 30),
  constraint sales_offers_content_check check (
    (item_name is not null and unit_price is not null)
    or (sample_item_name is not null and sample_quantity is not null)
  ),
  constraint sales_offers_price_item_check check (unit_price is null or item_name is not null),
  constraint sales_offers_sample_pair_check check ((sample_item_name is null) = (sample_quantity is null))
);

create index if not exists sales_offers_company_lead_idx
  on public.sales_offers (company_id, lead_id, created_at desc);
create index if not exists sales_offers_company_expiry_idx
  on public.sales_offers (company_id, valid_until)
  where valid_until is not null;

alter table public.delivery_events enable row level security;
alter table public.delivery_event_attachments enable row level security;
alter table public.sales_offers enable row level security;
revoke all on table public.delivery_events, public.delivery_event_attachments, public.sales_offers from public, anon, authenticated;
grant select, insert, update, delete on table public.delivery_events, public.delivery_event_attachments, public.sales_offers to service_role;

commit;

-- 롤백은 적용 승인과 별개로 계획한다. 데이터가 생성된 뒤에는 먼저 내보내고 아래를 실행한다.
-- begin;
-- drop table if exists public.sales_offers;
-- drop table if exists public.delivery_event_attachments;
-- drop table if exists public.delivery_events;
-- alter table public.lead_actions drop constraint if exists lead_actions_company_id_id_lead_id_uq;
-- alter table public.customer_notes drop constraint if exists customer_notes_company_id_id_customer_id_uq;
-- alter table public.customer_attachments drop constraint if exists customer_attachments_company_id_id_customer_id_uq;
-- commit;

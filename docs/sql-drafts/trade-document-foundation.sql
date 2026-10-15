-- REVIEW ONLY: 설계 초안. 운영 DB에 실행하지 마세요.
-- Phase 1: 전표 작성·확정, 지급, 거래명세서 발행 스냅샷

begin;

create table if not exists public.trade_document_counters (
  company_id uuid not null references public.companies(id) on delete cascade,
  document_type text not null check (document_type in ('sale', 'purchase')),
  document_year integer not null check (document_year between 2000 and 9999),
  last_number bigint not null default 0 check (last_number >= 0),
  primary key (company_id, document_type, document_year)
);

create table if not exists public.trade_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_type text not null check (document_type in ('sale', 'purchase')),
  transaction_type text not null default 'normal' check (transaction_type in ('normal', 'return')),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'cancelled')),
  document_number text,
  trade_date date not null,
  customer_id uuid,
  supplier_id uuid,
  source_type text not null default 'manual' check (source_type in ('quote', 'order', 'manual', 'upload')),
  source_id uuid,
  idempotency_key text,
  original_document_id uuid,
  subtotal_amount bigint not null default 0 check (subtotal_amount >= 0),
  tax_amount bigint not null default 0 check (tax_amount >= 0),
  total_amount bigint not null default 0 check (total_amount = subtotal_amount + tax_amount),
  memo text,
  confirmed_at timestamptz,
  confirmed_by_user_id uuid,
  confirmed_by_name text,
  cancelled_at timestamptz,
  cancelled_by_user_id uuid,
  cancelled_by_name text,
  cancel_reason text,
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trade_documents_company_id_id_uq unique (company_id, id),
  constraint trade_documents_company_number_uq unique (company_id, document_number),
  constraint trade_documents_partner_ck check (
    (document_type = 'sale' and customer_id is not null and supplier_id is null)
    or (document_type = 'purchase' and supplier_id is not null and customer_id is null)
  ),
  constraint trade_documents_customer_fk foreign key (company_id, customer_id)
    references public.normalized_customers(company_id, id) on delete restrict,
  constraint trade_documents_supplier_fk foreign key (company_id, supplier_id)
    references public.product_suppliers(company_id, id) on delete restrict,
  constraint trade_documents_original_fk foreign key (company_id, original_document_id)
    references public.trade_documents(company_id, id) on delete restrict,
  constraint trade_documents_source_key_uq unique (company_id, source_type, idempotency_key)
);

create table if not exists public.trade_document_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_id uuid not null,
  line_no integer not null check (line_no > 0),
  product_catalog_id uuid,
  supplier_product_id uuid,
  product_code_snapshot text,
  product_name_snapshot text not null,
  specification_snapshot text,
  unit_snapshot text not null,
  tax_type_snapshot text not null check (tax_type_snapshot in ('taxable', 'exempt')),
  quantity numeric(18, 6) not null check (quantity > 0),
  unit_price bigint not null check (unit_price >= 0),
  supply_amount bigint generated always as (round(quantity * unit_price)::bigint) stored,
  tax_amount bigint generated always as (
    case when tax_type_snapshot = 'taxable'
      then round(round(quantity * unit_price) * 0.1)::bigint
      else 0 end
  ) stored,
  total_amount bigint generated always as (
    round(quantity * unit_price)::bigint
    + case when tax_type_snapshot = 'taxable'
      then round(round(quantity * unit_price) * 0.1)::bigint
      else 0 end
  ) stored,
  memo text,
  created_at timestamptz not null default now(),
  constraint trade_document_lines_company_id_id_uq unique (company_id, id),
  constraint trade_document_lines_document_line_uq unique (company_id, document_id, line_no),
  constraint trade_document_lines_document_fk foreign key (company_id, document_id)
    references public.trade_documents(company_id, id) on delete cascade,
  constraint trade_document_lines_product_fk foreign key (company_id, product_catalog_id)
    references public.product_catalog(company_id, id) on delete restrict,
  constraint trade_document_lines_supplier_product_fk foreign key (company_id, supplier_product_id)
    references public.supplier_products(company_id, id) on delete restrict
);

create table if not exists public.trade_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  partner_type text not null check (partner_type in ('customer', 'supplier')),
  payment_type text not null check (payment_type in ('receipt', 'payment')),
  customer_id uuid,
  supplier_id uuid,
  payment_date date not null,
  amount bigint not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash', 'bank', 'card')),
  reverses_payment_id uuid,
  idempotency_key text not null,
  memo text,
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  constraint trade_payments_company_id_id_uq unique (company_id, id),
  constraint trade_payments_idempotency_uq unique (company_id, idempotency_key),
  constraint trade_payments_partner_ck check (
    (partner_type = 'customer' and payment_type = 'receipt' and customer_id is not null and supplier_id is null)
    or (partner_type = 'supplier' and payment_type = 'payment' and supplier_id is not null and customer_id is null)
  ),
  constraint trade_payments_customer_fk foreign key (company_id, customer_id)
    references public.normalized_customers(company_id, id) on delete restrict,
  constraint trade_payments_supplier_fk foreign key (company_id, supplier_id)
    references public.product_suppliers(company_id, id) on delete restrict,
  constraint trade_payments_reversal_fk foreign key (company_id, reverses_payment_id)
    references public.trade_payments(company_id, id) on delete restrict
);

create table if not exists public.trade_document_issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_id uuid not null,
  issue_number text not null,
  snapshot jsonb not null,
  content_hash text not null,
  issued_by_user_id uuid,
  issued_by_name text,
  issued_at timestamptz not null default now(),
  constraint trade_document_issues_company_number_uq unique (company_id, issue_number),
  constraint trade_document_issues_document_fk foreign key (company_id, document_id)
    references public.trade_documents(company_id, id) on delete restrict
);

create index if not exists trade_documents_company_date_idx
  on public.trade_documents(company_id, trade_date desc, id);
create index if not exists trade_documents_customer_date_idx
  on public.trade_documents(company_id, customer_id, trade_date desc) where customer_id is not null;
create index if not exists trade_documents_supplier_date_idx
  on public.trade_documents(company_id, supplier_id, trade_date desc) where supplier_id is not null;
create index if not exists trade_documents_status_date_idx
  on public.trade_documents(company_id, status, trade_date desc);
create index if not exists trade_document_lines_product_idx
  on public.trade_document_lines(company_id, product_catalog_id, document_id) where product_catalog_id is not null;
create index if not exists trade_payments_customer_date_idx
  on public.trade_payments(company_id, customer_id, payment_date desc) where customer_id is not null;
create index if not exists trade_payments_supplier_date_idx
  on public.trade_payments(company_id, supplier_id, payment_date desc) where supplier_id is not null;

alter table public.trade_document_counters enable row level security;
alter table public.trade_documents enable row level security;
alter table public.trade_document_lines enable row level security;
alter table public.trade_payments enable row level security;
alter table public.trade_document_issues enable row level security;

revoke all on table public.trade_document_counters from anon, authenticated;
revoke all on table public.trade_documents from anon, authenticated;
revoke all on table public.trade_document_lines from anon, authenticated;
revoke all on table public.trade_payments from anon, authenticated;
revoke all on table public.trade_document_issues from anon, authenticated;

grant all on table public.trade_document_counters to service_role;
grant all on table public.trade_documents to service_role;
grant all on table public.trade_document_lines to service_role;
grant all on table public.trade_payments to service_role;
grant all on table public.trade_document_issues to service_role;

-- 구현 단계에서 추가할 DB 함수/트리거:
-- 1. next_trade_document_number(company_id, document_type, trade_date)
-- 2. confirm_trade_document(company_id, document_id): 라인 합계 검증·채번·확정 원자 처리
-- 3. guard_confirmed_trade_document(): 확정 후 내용 수정과 라인 INSERT/UPDATE/DELETE 차단
-- 4. cancel_trade_document(company_id, document_id, reason): 내용은 유지하고 취소 이력만 기록
-- 함수는 security invoker를 기본으로 하고 service_role만 EXECUTE 가능하게 한다.

-- 운영 적용 금지 안전장치: 검토용 트랜잭션을 항상 되돌린다.
rollback;

-- 승인 후 별도 운영 마이그레이션의 롤백 순서:
-- drop table public.trade_document_issues;
-- drop table public.trade_payments;
-- drop table public.trade_document_lines;
-- drop table public.trade_documents;
-- drop table public.trade_document_counters;

-- 운영 DB에 2026-10-16 적용된 Phase B 스키마 기록본입니다. 운영에서 재실행하지 않습니다.
create extension if not exists btree_gist with schema extensions;

alter table public.sales_quotes add column if not exists accepted_by_name text;
alter table public.sales_quotes add column if not exists accepted_via text;
alter table public.sales_quotes add column if not exists pricing_applied_at timestamptz;
do $$ begin
  alter table public.sales_quotes add constraint sales_quotes_accepted_via_check check (accepted_via is null or accepted_via in ('staff','customer_link','portal'));
exception when duplicate_object then null; end $$;
create unique index if not exists sales_quotes_company_id_id_key on public.sales_quotes(company_id,id);

alter table public.sales_quote_items add column if not exists product_code_snapshot text;
alter table public.sales_quote_items add column if not exists sales_unit_snapshot text;
alter table public.sales_quote_items add column if not exists purchase_unit_snapshot text;
alter table public.sales_quote_items add column if not exists conversion_ratio_snapshot numeric;
alter table public.sales_quote_items add column if not exists tax_type_snapshot text;
alter table public.sales_quote_items add column if not exists supply_amount bigint;
alter table public.sales_quote_items add column if not exists tax_amount bigint;
alter table public.sales_quote_items add column if not exists total_amount bigint;

create table if not exists public.customer_price_agreements (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null, product_catalog_id uuid not null, sales_unit text not null, unit_price bigint not null,
  tax_type text not null, price_includes_tax boolean not null default false, effective_from date not null,
  effective_until date, status text not null default 'active', source_quote_id uuid, source_quote_item_id uuid,
  created_by_name text, ended_by_name text, ended_at timestamptz, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_price_agreements_company_id_id_key unique(company_id,id),
  constraint customer_price_agreements_customer_fk foreign key(company_id,customer_id) references public.normalized_customers(company_id,id) on delete cascade,
  constraint customer_price_agreements_product_fk foreign key(company_id,product_catalog_id) references public.product_catalog(company_id,id) on delete restrict,
  constraint customer_price_agreements_quote_fk foreign key(company_id,source_quote_id) references public.sales_quotes(company_id,id) on delete set null(source_quote_id),
  constraint customer_price_agreements_unit_price_check check(unit_price >= 0),
  constraint customer_price_agreements_tax_type_check check(tax_type in ('taxable','exempt')),
  constraint customer_price_agreements_status_check check(status in ('active','ended','cancelled')),
  constraint customer_price_agreements_period_check check(effective_until is null or effective_until >= effective_from)
);
create index if not exists customer_price_agreements_lookup_idx on public.customer_price_agreements(company_id,customer_id,product_catalog_id,effective_from desc);
create index if not exists customer_price_agreements_quote_idx on public.customer_price_agreements(company_id,source_quote_id) where source_quote_id is not null;
do $$ begin
  alter table public.customer_price_agreements add constraint customer_price_agreements_no_overlap exclude using gist
    (company_id with =, customer_id with =, product_catalog_id with =, daterange(effective_from,effective_until,'[]') with &&)
    where (status='active');
exception when duplicate_object then null; end $$;
alter table public.customer_price_agreements enable row level security;
revoke all on public.customer_price_agreements from anon, authenticated;
grant all on public.customer_price_agreements to service_role;

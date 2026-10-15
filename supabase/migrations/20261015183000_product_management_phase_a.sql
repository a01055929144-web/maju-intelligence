-- Production-applied Phase A schema record. Do not re-run against the production project.
alter table public.product_catalog add column if not exists product_code text;
alter table public.product_catalog add column if not exists purchase_to_sales_ratio numeric;
alter table public.product_catalog add column if not exists tax_type text;
alter table public.supplier_products add column if not exists parsed_tax_type text;
alter table public.supplier_product_matches add column if not exists purchase_to_sales_ratio numeric;
alter table public.supplier_product_matches add column if not exists conversion_confirmed boolean not null default false;

do $$ begin
  alter table public.product_catalog add constraint product_catalog_product_code_uq unique(company_id,product_code);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.product_catalog add constraint product_catalog_conversion_check check(purchase_to_sales_ratio is null or purchase_to_sales_ratio > 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.product_catalog add constraint product_catalog_tax_type_check check(tax_type is null or tax_type in ('taxable','exempt'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.supplier_products add constraint supplier_products_tax_type_check check(parsed_tax_type is null or parsed_tax_type in ('taxable','exempt'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.supplier_product_matches add constraint supplier_product_matches_conversion_check check(purchase_to_sales_ratio is null or purchase_to_sales_ratio > 0);
exception when duplicate_object then null; end $$;

create table if not exists public.product_code_counters (
  company_id uuid primary key references public.companies(id) on delete cascade,
  last_value bigint not null default 0 check(last_value >= 0)
);
create table if not exists public.product_sales_price_history (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  product_catalog_id uuid not null, previous_price bigint, next_price bigint not null,
  changed_by_user_id uuid, changed_by_name text, changed_at timestamptz not null default now(),
  constraint product_sales_price_history_previous_price_check check(previous_price is null or previous_price >= 0),
  constraint product_sales_price_history_next_price_check check(next_price >= 0),
  constraint product_sales_price_history_product_fk foreign key(company_id,product_catalog_id) references public.product_catalog(company_id,id) on delete cascade
);
create index if not exists product_sales_price_history_product_idx on public.product_sales_price_history(company_id,product_catalog_id,changed_at desc);

create or replace function public.next_product_code(p_company_id uuid) returns text language plpgsql set search_path to 'public' as $$
declare v bigint; begin
 insert into public.product_code_counters(company_id,last_value) values(p_company_id,1)
 on conflict(company_id) do update set last_value=public.product_code_counters.last_value+1 returning last_value into v;
 return 'P-'||lpad(v::text,6,'0');
end $$;

-- The production application assigned codes to pre-existing rows in creation order.
do $$
declare r record;
begin
 for r in select id,company_id from public.product_catalog where product_code is null order by company_id,created_at,id loop
   update public.product_catalog set product_code=public.next_product_code(r.company_id) where id=r.id;
 end loop;
end $$;
create or replace function public.product_catalog_lock_product_code() returns trigger language plpgsql set search_path to 'public' as $$
begin if old.product_code is not null and new.product_code is distinct from old.product_code then raise exception '품목코드는 변경할 수 없습니다 (%).',old.product_code; end if; return new; end $$;
drop trigger if exists product_catalog_lock_product_code on public.product_catalog;
create trigger product_catalog_lock_product_code before update on public.product_catalog for each row execute function public.product_catalog_lock_product_code();

alter table public.product_code_counters enable row level security;
alter table public.product_sales_price_history enable row level security;
revoke all on public.product_code_counters,public.product_sales_price_history from anon,authenticated;
revoke all on function public.next_product_code(uuid) from public,anon,authenticated;
grant execute on function public.next_product_code(uuid) to service_role;
grant all on public.product_code_counters,public.product_sales_price_history to service_role;

\set ON_ERROR_STOP on

create extension if not exists pgcrypto;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

drop table if exists public.business_document_lines cascade;
drop table if exists public.business_documents cascade;
drop table if exists public.product_base_prices cascade;
drop table if exists public.product_catalog cascade;
drop table if exists public.companies cascade;

create table public.companies(id uuid primary key);
create table public.product_catalog(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  unique(company_id, id)
);
create table public.business_documents(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  unique(company_id, id)
);
create table public.business_document_lines(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_id uuid not null,
  product_catalog_id uuid,
  unit_price bigint not null,
  foreign key(company_id, document_id) references public.business_documents(company_id, id),
  foreign key(company_id, product_catalog_id) references public.product_catalog(company_id, id)
);

\ir 20261102-WO-25-product-base-prices.sql

begin;
do $$
declare
  company_a uuid := gen_random_uuid();
  company_b uuid := gen_random_uuid();
  product_a uuid := gen_random_uuid();
  document_a uuid := gen_random_uuid();
  line_a uuid := gen_random_uuid();
  rejected boolean;
begin
  insert into public.companies(id) values (company_a), (company_b);
  insert into public.product_catalog(id, company_id) values (product_a, company_a);
  insert into public.business_documents(id, company_id) values (document_a, company_a);
  insert into public.business_document_lines(id, company_id, document_id, product_catalog_id, unit_price)
    values (line_a, company_a, document_a, product_a, 777);

  insert into public.product_base_prices(company_id, product_id, effective_date, base_cost, base_price, source)
    values (company_a, product_a, '2026-11-02', 600, 900, 'manual');
  update public.product_base_prices set base_cost = 700, base_price = 1000, source = 'voucher'
    where company_id = company_a and product_id = product_a and effective_date = '2026-11-02';
  if (select unit_price from public.business_document_lines where id = line_a) <> 777 then
    raise exception 'saved voucher price changed with base price';
  end if;

  insert into public.product_base_prices(company_id, product_id, effective_date, base_cost, base_price, source)
    values (company_a, product_a, '2026-11-03', 710, 1010, 'copy_prev');
  if (select count(*) from public.product_base_prices where company_id = company_a and product_id = product_a) <> 2 then
    raise exception 'daily history was not preserved';
  end if;

  rejected := false;
  begin
    insert into public.product_base_prices(company_id, product_id, effective_date, base_cost, base_price, source)
      values (company_a, product_a, '2026-11-02', 1, 1, 'excel');
  exception when unique_violation then rejected := true;
  end;
  if not rejected then raise exception 'duplicate daily base price accepted'; end if;

  rejected := false;
  begin
    insert into public.product_base_prices(company_id, product_id, effective_date, base_cost, base_price, source)
      values (company_b, product_a, '2026-11-02', 1, 1, 'manual');
  exception when foreign_key_violation then rejected := true;
  end;
  if not rejected then raise exception 'cross-company product accepted'; end if;

  rejected := false;
  begin
    insert into public.product_base_prices(company_id, product_id, effective_date, base_cost, base_price, source)
      values (company_a, product_a, '2026-11-04', -1, 1, 'manual');
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception 'negative base price accepted'; end if;

  rejected := false;
  begin
    insert into public.product_base_prices(company_id, product_id, effective_date, base_cost, base_price, source)
      values (company_a, product_a, '2026-11-04', 1, 1, 'unknown');
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception 'unknown source accepted'; end if;

  if has_table_privilege('anon', 'public.product_base_prices', 'select')
     or has_table_privilege('authenticated', 'public.product_base_prices', 'select') then
    raise exception 'base prices exposed to public roles';
  end if;
  if not has_table_privilege('service_role', 'public.product_base_prices', 'select') then
    raise exception 'service role cannot read base prices';
  end if;
end $$;
rollback;

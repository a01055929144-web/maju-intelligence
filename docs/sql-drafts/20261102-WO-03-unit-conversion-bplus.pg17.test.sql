\set ON_ERROR_STOP on

create extension if not exists pgcrypto;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

drop table if exists public.product_unit_observations cascade;
drop table if exists public.category_unit_rules cascade;
drop table if exists public.product_unit_conversions cascade;
drop table if exists public.product_categories cascade;
drop table if exists public.product_catalog cascade;
drop table if exists public.companies cascade;

create table public.companies(id uuid primary key);
create table public.product_catalog(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_code text,
  category text,
  is_active boolean not null default true,
  unique(company_id, id),
  unique(company_id, product_code)
);

\ir 20261102-WO-03-product-catalog-schema.sql

create table public.product_unit_conversions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  product_catalog_id uuid not null,
  unit_name text not null,
  base_quantity numeric(14,3) not null,
  is_base boolean not null default false,
  is_confirmed boolean not null default false,
  source text not null default 'manual',
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, id),
  unique(company_id, product_catalog_id, unit_name),
  foreign key(company_id, product_catalog_id)
    references public.product_catalog(company_id, id) on delete cascade,
  check(base_quantity > 0),
  check(not is_base or base_quantity = 1),
  check(source in ('manual', 'supplier_match', 'legacy'))
);
create unique index product_unit_conversions_one_base_uq
  on public.product_unit_conversions(company_id, product_catalog_id) where is_base;

\ir 20261102-WO-03-unit-conversion-bplus.sql

begin;
do $$
declare
  company_a uuid := gen_random_uuid();
  company_b uuid := gen_random_uuid();
  category_a uuid;
  category_b uuid;
  product_a uuid;
  product_a2 uuid;
  product_b uuid;
  conversion_a uuid;
  changed integer;
  rejected boolean;
begin
  insert into public.companies(id) values(company_a), (company_b);
  insert into public.product_categories(company_id, level, name)
    values(company_a, 1, '채소') returning id into category_a;
  insert into public.product_categories(company_id, level, name)
    values(company_b, 1, '타회사') returning id into category_b;
  insert into public.product_catalog(company_id, product_code, category_id)
    values(company_a, 'A-1', category_a) returning id into product_a;
  insert into public.product_catalog(company_id, product_code, category_id)
    values(company_a, 'A-2', category_a) returning id into product_a2;
  insert into public.product_catalog(company_id, product_code, category_id)
    values(company_b, 'B-1', category_b) returning id into product_b;

  insert into public.product_unit_conversions(
    company_id, product_catalog_id, unit_name, base_quantity, is_base, is_confirmed
  ) values
    (company_a, product_a, 'kg', 1, true, true),
    (company_a, product_a2, 'kg', 1, true, true),
    (company_b, product_b, 'kg', 1, true, true);

  changed := public.apply_category_unit_rule(
    company_a, category_a, array[product_a], '박스', 9.5, true, 95, true, '테스트'
  );
  if changed <> 1 then raise exception 'selected product was not updated'; end if;
  if exists(
    select 1 from public.product_unit_conversions
    where company_id = company_a and product_catalog_id = product_a2 and unit_name = '박스'
  ) then raise exception 'unselected product changed'; end if;

  perform public.apply_category_unit_rule(
    company_a, category_a, array[product_a], '박스', 10, true, 100, true, '테스트'
  );
  if (select base_quantity from public.product_unit_conversions
      where company_id = company_a and product_catalog_id = product_a and unit_name = '박스') <> 9.5 then
    raise exception 'keep-existing option was ignored';
  end if;

  perform public.apply_category_unit_rule(
    company_a, category_a, array[product_a], '박스', 10, true, 100, false, '테스트'
  );
  select id into conversion_a from public.product_unit_conversions
  where company_id = company_a and product_catalog_id = product_a and unit_name = '박스';
  if (select base_quantity from public.product_unit_conversions where id = conversion_a) <> 10 then
    raise exception 'explicit overwrite failed';
  end if;

  rejected := false;
  begin
    perform public.apply_category_unit_rule(
      company_a, category_a, array[product_b], '박스', 9.5, true, 95, true, '테스트'
    );
  exception when raise_exception then rejected := true;
  end;
  if not rejected then raise exception 'cross-company product accepted'; end if;

  insert into public.product_unit_observations(
    company_id, product_catalog_id, conversion_id, observed_base_quantity, observed_at, source_key
  ) values
    (company_a, product_a, conversion_a, 9.3, '2026-11-01 01:00+09', 'receipt-1'),
    (company_a, product_a, conversion_a, 9.5, '2026-11-01 02:00+09', 'receipt-2'),
    (company_a, product_a, conversion_a, 9.6, '2026-11-01 03:00+09', 'receipt-3'),
    (company_a, product_a, conversion_a, 9.8, '2026-11-01 04:00+09', 'receipt-4'),
    (company_a, product_a, conversion_a, 9.4, '2026-11-01 05:00+09', 'receipt-5'),
    (company_a, product_a, conversion_a, 9.7, '2026-11-01 06:00+09', 'receipt-6');
  if public.product_unit_recent_median(company_a, product_a, conversion_a) <> 9.6 then
    raise exception 'recent-five median is incorrect';
  end if;
  if public.numeric_median(array[9, 10, 11, 12]::numeric[]) <> 10.5 then
    raise exception 'even median is incorrect';
  end if;

  insert into public.product_catalog(company_id, product_code, category_id)
    values(company_a, 'A-NEW', category_a) returning id into product_a2;
  if not exists(
    select 1 from public.product_unit_conversions
    where company_id = company_a and product_catalog_id = product_a2
      and unit_name = '박스' and base_quantity = 10
  ) then raise exception 'category rule was not applied to new product'; end if;
  select id into conversion_a from public.product_unit_conversions
  where company_id = company_a and product_catalog_id = product_a2 and unit_name = '박스';
  if public.product_unit_recent_median(company_a, product_a2, conversion_a) <> 10 then
    raise exception 'fixed conversion fallback is incorrect';
  end if;

  if has_table_privilege('anon', 'public.category_unit_rules', 'select')
     or has_table_privilege('authenticated', 'public.product_unit_observations', 'select') then
    raise exception 'unit conversion data exposed to public roles';
  end if;
  if not has_table_privilege('service_role', 'public.category_unit_rules', 'select')
     or not has_function_privilege(
       'service_role',
       'public.apply_category_unit_rule(uuid,uuid,uuid[],text,numeric,boolean,numeric,boolean,text)',
       'execute'
     ) then raise exception 'service role permissions missing'; end if;
end $$;
rollback;

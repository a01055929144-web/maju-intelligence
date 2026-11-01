\set ON_ERROR_STOP on

create extension if not exists pgcrypto;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

drop table if exists public.product_catalog cascade;
drop table if exists public.product_categories cascade;
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

begin;
do $$
declare
  company_a uuid := gen_random_uuid();
  company_b uuid := gen_random_uuid();
  root_a uuid;
  child_a uuid;
  product_a uuid;
  rejected boolean;
begin
  insert into public.companies(id) values (company_a), (company_b);
  insert into public.product_categories(company_id, level, name, margin_bp)
    values (company_a, 1, '식품', 1500) returning id into root_a;
  insert into public.product_categories(company_id, parent_id, level, name)
    values (company_a, root_a, 2, '냉동') returning id into child_a;
  insert into public.product_catalog(company_id, product_code, category_id)
    values (company_a, 'ERP-001', child_a) returning id into product_a;

  if (select category_id from public.product_catalog where id = product_a) <> child_a then
    raise exception 'category assignment failed';
  end if;

  begin
    insert into public.product_categories(company_id, parent_id, level, name)
      values (company_b, root_a, 2, '교차 회사');
    raise exception 'cross-company parent accepted';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.product_catalog(company_id, product_code, category_id)
      values (company_b, 'ERP-002', child_a);
    raise exception 'cross-company category accepted';
  exception when foreign_key_violation then null;
  end;

  rejected := false;
  begin
    insert into public.product_categories(company_id, level, name)
      values (company_a, 4, '잘못된 단계');
  exception when check_violation or raise_exception then rejected := true;
  end;
  if not rejected then raise exception 'invalid level accepted'; end if;

  rejected := false;
  begin
    insert into public.product_categories(company_id, parent_id, level, name)
      values (company_a, root_a, 3, '단계 건너뜀');
  exception when raise_exception then rejected := true;
  end;
  if not rejected then raise exception 'skipped level accepted'; end if;

  begin
    insert into public.product_categories(company_id, level, name)
      values (company_a, 1, ' 식품 ');
    raise exception 'duplicate root name accepted';
  exception when unique_violation then null;
  end;

  if has_table_privilege('anon', 'public.product_categories', 'select')
     or has_table_privilege('authenticated', 'public.product_categories', 'select') then
    raise exception 'product categories exposed to public roles';
  end if;
  if not has_table_privilege('service_role', 'public.product_categories', 'select') then
    raise exception 'service role cannot read product categories';
  end if;
end $$;
rollback;

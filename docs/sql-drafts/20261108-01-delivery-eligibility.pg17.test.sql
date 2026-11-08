\set ON_ERROR_STOP on

drop schema if exists public cascade;
create schema public;

create table public.normalized_customers (
  id uuid primary key,
  company_id uuid not null,
  customer_name text not null
);

insert into public.normalized_customers(id, company_id, customer_name) values
  ('10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '기존 배정 거래처'),
  ('10000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', '기존 미배정 거래처');

\ir 20261108-01-delivery-eligibility.sql

do $$
begin
  if (select count(*) from public.normalized_customers where delivery_eligibility = 'eligible') <> 2 then
    raise exception 'existing_customers_not_preserved_as_eligible';
  end if;

  insert into public.normalized_customers(id, company_id, customer_name) values
    ('20000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '신규 거래처');

  if not exists (
    select 1 from public.normalized_customers
    where id = '20000000-0000-4000-8000-000000000001'
      and delivery_eligibility = 'not_ready'
  ) then
    raise exception 'new_customer_default_not_ready_failed';
  end if;

  begin
    update public.normalized_customers set delivery_eligibility = 'TEST_ONLY'
    where id = '20000000-0000-4000-8000-000000000001';
    raise exception 'invalid_delivery_eligibility_allowed';
  exception when check_violation then null;
  end;

  begin
    update public.normalized_customers set delivery_eligibility = null
    where id = '20000000-0000-4000-8000-000000000001';
    raise exception 'null_delivery_eligibility_allowed';
  exception when not_null_violation then null;
  end;
end $$;

\ir 20261108-01-delivery-eligibility.down.sql

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'normalized_customers'
      and column_name = 'delivery_eligibility'
  ) then
    raise exception 'down_left_delivery_eligibility_column';
  end if;
  if (select count(*) from public.normalized_customers) <> 3 then
    raise exception 'down_removed_customer_rows';
  end if;
end $$;

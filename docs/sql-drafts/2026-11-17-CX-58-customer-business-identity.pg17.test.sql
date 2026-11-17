-- Disposable PostgreSQL 17 fixture only. Never run against production.
\set ON_ERROR_STOP on

do $$ begin
  if current_setting('server_version_num')::int not between 170000 and 179999 then
    raise exception 'PostgreSQL 17 required';
  end if;
end $$;

create extension if not exists pgcrypto;
create table public.normalized_customers (
  id uuid primary key default gen_random_uuid(), company_id uuid not null,
  customer_name text not null, business_registration_number text
);
create table public.company_profiles (company_id uuid primary key, sub_business_number text);
create table public.store_profiles (id uuid primary key default gen_random_uuid(), company_id uuid not null);
create table public.business_number_exceptions (
  id uuid primary key default gen_random_uuid(), company_id uuid not null,
  business_registration_number text not null, memo text,
  unique (company_id, business_registration_number)
);

insert into public.company_profiles(company_id) values ('10000000-0000-4000-8000-000000000001');
insert into public.business_number_exceptions(company_id, business_registration_number, memo)
values ('10000000-0000-4000-8000-000000000001', '1234567890', '합성 중복 허용');

\ir 2026-11-17-CX-58-customer-business-identity.sql

insert into public.normalized_customers(
  company_id, customer_name, business_registration_number, business_name,
  sub_business_number, business_entity_type, corporate_registration_number
) values
  ('10000000-0000-4000-8000-000000000001', '합성 본점', '1234567890', '합성 주식회사', '0001', 'corporation', '1234567890123'),
  ('10000000-0000-4000-8000-000000000001', '합성 지점', '1234567890', '합성 주식회사', '0002', 'corporation', '1234567890123');
insert into public.store_profiles(company_id, business_name, sub_business_number, business_entity_type)
values ('10000000-0000-4000-8000-000000000001', '합성 주식회사', '0002', 'corporation');

do $$ begin
  if (select count(*) from public.normalized_customers where business_registration_number = '1234567890') <> 2
    or (select count(*) from public.business_number_exceptions) <> 1
    or not exists (
      select 1 from pg_indexes
      where schemaname = 'public'
        and indexname = 'normalized_customers_company_business_sub_number_idx'
        and indexdef not ilike '% unique %'
    ) then
    raise exception 'cx58_same_business_number_or_index_contract_failed';
  end if;

  begin
    insert into public.normalized_customers(company_id, customer_name, sub_business_number)
    values ('10000000-0000-4000-8000-000000000001', '잘못된 종사업장', '123');
    raise exception 'invalid_customer_sub_business_number_accepted';
  exception when check_violation then null; end;
  begin
    update public.company_profiles set sub_business_number = '12A4';
    raise exception 'invalid_company_sub_business_number_accepted';
  exception when check_violation then null; end;
  begin
    update public.store_profiles set business_entity_type = 'government';
    raise exception 'invalid_store_business_entity_type_accepted';
  exception when check_violation then null; end;
  begin
    update public.normalized_customers set corporate_registration_number = '1234' where customer_name = '합성 본점';
    raise exception 'invalid_corporate_registration_number_accepted';
  exception when check_violation then null; end;
end $$;

delete from public.normalized_customers;
delete from public.store_profiles;
\ir 2026-11-17-CX-58-customer-business-identity.down.sql

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'normalized_customers'
      and column_name in ('business_name', 'sub_business_number', 'business_entity_type', 'corporate_registration_number')
  ) or exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'store_profiles'
      and column_name in ('business_name', 'sub_business_number', 'business_entity_type')
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'company_profiles' and column_name = 'sub_business_number'
  ) or (select count(*) from public.business_number_exceptions) <> 1 then
    raise exception 'cx58_down_contract_failed';
  end if;
end $$;

select 'CX-58 customer business identity PG17 checks passed' as result;

\set ON_ERROR_STOP on
create extension if not exists pgcrypto;
create table companies(id uuid primary key);
create table normalized_customers(id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), customer_name text not null);
create table product_suppliers(id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), name text not null, business_number text, is_active boolean not null default true);
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon noinherit; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated noinherit; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role noinherit; end if;
end $$;
insert into companies values ('00000000-0000-4000-8000-000000000001');
insert into product_suppliers(company_id,name,business_number) values
  ('00000000-0000-4000-8000-000000000001','기존 active 매입처',null);
\ir ../../docs/sql-drafts/2026-11-18-CX-126-partner-registration.sql

update product_suppliers set name='기존 active 매입처 저장됨' where name='기존 active 매입처';
insert into normalized_customers(company_id,customer_name,expected_opening_date,tax_invoice_email) values ('00000000-0000-4000-8000-000000000001','합성 개업 매출처','2027-01-01',null);
insert into product_suppliers(company_id,name,business_status,address) values ('00000000-0000-4000-8000-000000000001','합성 개업 매입처','registration_pending','서울 합성로 1');
insert into product_suppliers(company_id,name,business_number,business_status,business_entity_type,tax_invoice_email) values ('00000000-0000-4000-8000-000000000001','합성 확인 매입처','1234567890','active','individual','tax@example.test');
do $$ begin
  if not exists(select 1 from product_suppliers where name='기존 active 매입처 저장됨' and business_status='active' and business_entity_type is null and tax_invoice_email is null)
    then raise exception 'cx126_legacy_active_supplier_not_preserved'; end if;
  if exists(select 1 from pg_constraint where conname='product_suppliers_registration_pending_check')
    then raise exception 'cx126_legacy_blocking_constraint_present'; end if;
  if (select count(*) from product_suppliers where business_status='registration_pending') <> 1 then raise exception 'cx126_pending_missing'; end if;
  if not (select relrowsecurity from pg_class where oid='business_partner_registration_events'::regclass) then raise exception 'cx126_events_rls_off'; end if;
end $$;

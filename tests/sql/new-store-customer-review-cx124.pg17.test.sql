\set ON_ERROR_STOP on
create extension if not exists pgcrypto;
create table companies(id uuid primary key);
create table normalized_customers(id uuid primary key,company_id uuid not null,customer_name text not null,address text);
create table store_accounts(id uuid primary key,company_id uuid not null,customer_id uuid not null,business_registration_number text,customer_review_status text not null,status text not null,created_at timestamptz not null default now());
do $$ begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
\ir ../../docs/sql-drafts/2026-11-18-CX-124-new-store-customer-review.sql
insert into companies values('00000000-0000-4000-8000-000000000001');
insert into normalized_customers values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','확인할 매장','서울 가짜로 1'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','확인 완료 매장','서울 가짜로 2');
insert into store_accounts(id,company_id,customer_id,business_registration_number,customer_review_status,status) values
 ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',null,'needs_review','active'),
 ('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','1234567890','confirmed','active');
do $$ begin
 if (select count(*) from list_pending_store_customer_reviews_v1('00000000-0000-4000-8000-000000000001'))<>1 then raise exception 'cx124_pending_list_wrong'; end if;
 if (select name from list_pending_store_customer_reviews_v1('00000000-0000-4000-8000-000000000001'))<>'확인할 매장' then raise exception 'cx124_pending_name_wrong'; end if;
end $$;

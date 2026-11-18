\set ON_ERROR_STOP on
begin;
do $$ begin
  if current_database()<>'store_promotion_availability_09_test' or current_setting('server_version_num')::int/10000<>17
    then raise exception 'disposable_promotion_availability_pg17_required'; end if;
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
create table public.product_catalog(id uuid primary key,company_id uuid not null,unique(company_id,id));
create table public.pricing_promotions(id uuid primary key,company_id uuid not null,product_id uuid not null,stock bigint,per_store_limit bigint,unique(company_id,id));
create table public.store_orders(id uuid primary key,company_id uuid not null,status text not null,unique(company_id,id));
create table public.store_order_lines(id uuid primary key,company_id uuid not null,order_id uuid not null,promotion_id uuid,quantity numeric(14,3) not null);
\ir ../../docs/sql-drafts/2026-11-18-D4-S-3bc-order-cutoff-promotion-remaining.sql

insert into public.pricing_promotions values
('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011',10,4),
('00000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000012',null,null),
('00000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000013',0,2),
('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000021',99,9);
insert into public.store_orders
select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-4000-8000-000000000001',status
from (values(301,'submitted'),(302,'received'),(303,'in_delivery'),(304,'delivered'),(305,'cancelled')) x(n,status);
insert into public.store_order_lines
select gen_random_uuid(),'00000000-0000-4000-8000-000000000001',('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
'00000000-0000-4000-8000-000000000101',qty from (values(301,0.125),(302,1.250),(303,2.500),(304,3.125),(305,50.000)) x(n,qty);

do $$
declare r record; n bigint;
begin
  select * into r from public.promotion_remaining_v1('00000000-0000-4000-8000-000000000001',array['00000000-0000-4000-8000-000000000101']::uuid[]);
  if r.reserved_quantity<>7.000 or r.remaining_quantity<>3.000 or r.per_store_limit<>4 then raise exception 'reservation_state_or_fraction_mismatch'; end if;
  select * into r from public.promotion_remaining_v1('00000000-0000-4000-8000-000000000001',array['00000000-0000-4000-8000-000000000102']::uuid[]);
  if r.remaining_quantity is not null or r.stock is not null then raise exception 'unlimited_became_zero'; end if;
  select * into r from public.promotion_remaining_v1('00000000-0000-4000-8000-000000000001',array['00000000-0000-4000-8000-000000000103']::uuid[]);
  if r.remaining_quantity<>0 then raise exception 'sold_out_not_zero'; end if;
  select count(*) into n from public.promotion_remaining_v1('00000000-0000-4000-8000-000000000001',array['00000000-0000-4000-8000-000000000201']::uuid[]);
  if n<>0 then raise exception 'other_company_leaked'; end if;
  if has_function_privilege('anon','public.promotion_remaining_v1(uuid,uuid[])','execute')
    or has_function_privilege('authenticated','public.promotion_remaining_v1(uuid,uuid[])','execute')
    or not has_function_privilege('service_role','public.promotion_remaining_v1(uuid,uuid[])','execute') then raise exception 'availability_acl'; end if;
  begin
    perform * from public.promotion_remaining_v1('00000000-0000-4000-8000-000000000001','{}'::uuid[]);
    raise exception 'empty_request_accepted';
  exception when invalid_parameter_value then null; end;
  if (select count(*) from public.store_orders)<>5 or (select count(*) from public.store_order_lines)<>5 then raise exception 'read_mutated_order_data'; end if;
end $$;
\ir ../../docs/sql-drafts/2026-11-18-D4-S-3bc-order-cutoff-promotion-remaining.down.sql
do $$ begin
  if to_regprocedure('public.promotion_remaining_v1(uuid,uuid[])') is not null then raise exception 'availability_down_failed'; end if;
  if (select count(*) from public.store_orders)<>5 then raise exception 'down_removed_order_history'; end if;
end $$;
rollback;
select 'storefront_promotion_availability_pg17_pass';

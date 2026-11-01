\set ON_ERROR_STOP on
-- Dedicated disposable PG17 DB only; never run on an existing application DB.
do $$ begin
  if current_database() !~ '^customer_items_test(_[a-z0-9]+)?$' or current_setting('server_version_num')::int not between 170000 and 179999 then
    raise exception 'Requires disposable customer_items_test* PostgreSQL 17 database';
  end if;
end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role bypassrls; exception when duplicate_object then null; end $$;
alter role service_role bypassrls;
create table public.companies(id uuid primary key);
create table public.normalized_customers(id uuid primary key,company_id uuid not null references public.companies(id),unique(company_id,id));
create table public.product_catalog(id uuid primary key,company_id uuid not null references public.companies(id),purchase_price numeric(14,2),sales_price bigint,unique(company_id,id));
grant usage on schema public to anon,authenticated,service_role;
grant select,update on public.companies to service_role;
grant select on public.normalized_customers,public.product_catalog to service_role;
\ir 20261102-WO-25-customer-items.sql

create function pg_temp.must_fail(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlstate = expected then return; end if;
    raise;
  end;
  raise exception 'Unexpected success: %',statement;
end $$;

insert into public.companies values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into public.normalized_customers values
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000002');
insert into public.product_catalog values
 ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001',800.01,900),
 ('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000002',1000,1200);

set role service_role;
do $$
declare
 company uuid := '00000000-0000-4000-8000-000000000001';
 row jsonb := '{"customer_id":"00000000-0000-4000-8000-000000000011","product_id":"00000000-0000-4000-8000-000000000021","sales_unit":"kg","last_price":0,"last_date":"2026-10-29","tax_type":"unknown","price_includes_tax":null}';
 newer jsonb; response jsonb; changed jsonb; patch jsonb;
begin
 response := public.import_customer_items(company,jsonb_build_array(row));
 if response <> '{"applied":1,"skipped":0}'::jsonb then raise exception 'Initial zero price failed'; end if;
 response := public.import_customer_items(company,jsonb_build_array(row));
 if response <> '{"applied":0,"skipped":1}'::jsonb then raise exception 'Retry is not idempotent'; end if;
 newer := row || '{"last_price":1000,"last_date":"2026-10-30","tax_type":"taxable","price_includes_tax":true}';
 perform public.import_customer_items(company,jsonb_build_array(newer));
 perform public.import_customer_items(company,jsonb_build_array(row));
 if (select last_price from public.customer_items where sales_unit='kg') <> 1000 then raise exception 'Older import overwrote latest price'; end if;
 perform public.import_customer_items(company,jsonb_build_array(newer || '{"sales_unit":"box","last_price":5000}'));
 if (select count(*) from public.customer_items) <> 2 then raise exception 'Sales units merged'; end if;

 -- A conflicting row rolls the whole batch back, including an otherwise valid newer row.
 changed := newer || '{"sales_unit":"box","last_price":6000,"last_date":"2026-10-31"}';
 perform pg_temp.must_fail(format('select public.import_customer_items(%L,%L)',company,jsonb_build_array(changed,newer || '{"last_price":1001}')), '22023');
 if (select last_price from public.customer_items where sales_unit='box') <> 5000 then raise exception 'Partial batch committed'; end if;
 perform pg_temp.must_fail(format('select public.import_customer_items(%L,%L)',company,jsonb_build_array(row,row)), '22023');
 perform pg_temp.must_fail(format('select public.import_customer_items(%L,%L)',company,jsonb_build_array(changed,row || '{"customer_id":"00000000-0000-4000-8000-000000000012"}')), '23503');
 perform pg_temp.must_fail(format('select public.import_customer_items(%L,%L)',company,jsonb_build_array(row || '{"product_id":"00000000-0000-4000-8000-000000000022"}')), '23503');
 perform pg_temp.must_fail(format('insert into public.customer_items select %L,%L,%L,''unit'',100,''2026-10-30'',''excel'',''unknown'',null,now()',company,'00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000021'), '23503');
 perform pg_temp.must_fail(format('insert into public.customer_items select %L,%L,%L,''unit'',100,''2026-10-30'',''excel'',''unknown'',null,now()',company,'00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000022'), '23503');
 for patch in select value from jsonb_array_elements('[{"last_price":-1},{"last_price":1.5},{"last_price":1000000000001},{"last_price":"100"},{"last_date":"9999-01-01"},{"last_date":"2026-2-03"},{"sales_unit":" "},{"base_price":300},{"company_id":"forged"},{"price_includes_tax":false},{"tax_type":"taxable","price_includes_tax":null}]') loop
   perform pg_temp.must_fail(format('select public.import_customer_items(%L,%L)',company,jsonb_build_array(row || patch)), '22023');
 end loop;
 perform pg_temp.must_fail(format('select public.import_customer_items(%L,%L)',company,'[]'), '22023');
 perform pg_temp.must_fail(format('select public.import_customer_items(%L,%L)',company,'{}'), '22023');
 perform pg_temp.must_fail(format('select public.import_customer_items(%L,%L)',company,(select jsonb_agg(row) from generate_series(1,1001))), '22023');
 if (select purchase_price <> 800.01 or sales_price <> 900 from public.product_catalog where id='00000000-0000-4000-8000-000000000021') then raise exception 'Product/base pricing mutated'; end if;
end $$;
reset role;

do $$ declare role_name text; privilege text; begin
 for role_name in select unnest(array['anon','authenticated']) loop
  foreach privilege in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'] loop
   if has_table_privilege(role_name,'public.customer_items',privilege) then raise exception 'Public table grant: % %',role_name,privilege; end if;
  end loop;
  if has_function_privilege(role_name,'public.import_customer_items(uuid,jsonb)','EXECUTE') then raise exception 'Public RPC grant'; end if;
 end loop;
 if not (select relrowsecurity from pg_class where oid='public.customer_items'::regclass) then raise exception 'Missing RLS'; end if;
end $$;
set role anon;
select pg_temp.must_fail('select * from public.customer_items','42501');
select pg_temp.must_fail('select public.import_customer_items(null,null)','42501');
reset role;
set role authenticated;
select pg_temp.must_fail('select * from public.customer_items','42501');
select pg_temp.must_fail('select public.import_customer_items(null,null)','42501');
reset role;
-- Prove deny-by-default RLS still protects rows if a future grant is added accidentally.
begin;
grant select,insert,update,delete on public.customer_items to authenticated;
set local role authenticated;
do $$ declare count_rows integer; begin
 if exists(select 1 from public.customer_items) then raise exception 'RLS leaked rows'; end if;
 update public.customer_items set last_price=1; get diagnostics count_rows=row_count;
 if count_rows<>0 then raise exception 'RLS update allowed'; end if;
 delete from public.customer_items; get diagnostics count_rows=row_count;
 if count_rows<>0 then raise exception 'RLS delete allowed'; end if;
 perform pg_temp.must_fail('insert into public.customer_items(company_id,customer_id,product_id,sales_unit,last_price,last_date,tax_type) values(''00000000-0000-4000-8000-000000000001'',''00000000-0000-4000-8000-000000000011'',''00000000-0000-4000-8000-000000000021'',''unit'',0,''2026-10-30'',''unknown'')','42501');
end $$;
rollback;
delete from public.normalized_customers where id='00000000-0000-4000-8000-000000000011';
do $$ begin if exists(select 1 from public.customer_items) then raise exception 'Customer cascade failed'; end if; end $$;
\ir 20261102-WO-25-customer-items.down.sql
do $$ begin
 if to_regclass('public.customer_items') is not null or to_regprocedure('public.import_customer_items(uuid,jsonb)') is not null then raise exception 'Down incomplete'; end if;
 if (select count(*) from public.product_catalog)<>2 or (select count(*) from public.companies)<>2 then raise exception 'Down changed existing tables'; end if;
end $$;
\echo 'PASS: customer_items PG17 atomicity, latest dates, units, FK, RLS, grants, down'

-- Disposable PostgreSQL 17 fixture only. Never run against production.
\ir ../../tests/sql/pricing-p0-fixture.sql
-- CI는 같은 클러스터에서 앞선 테스트가 service_role 을 bypassrls 없이 만들 수 있어 운영(Supabase)과 같게 맞춘다.
alter role service_role bypassrls;
alter table public.product_catalog
  add column sales_unit text not null default 'EA',
  add column updated_at timestamptz not null default now(),
  alter column purchase_price set default 0,
  alter column purchase_price set not null;
\ir 20261030-pricing-p0.sql
\ir ../db-approval/20261104_purchase_receipt_lines.sql

create table public.product_suppliers(
  id uuid primary key, company_id uuid not null references public.companies(id) on delete cascade,
  unique(company_id,id)
);
create table public.product_catalog_imports(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null, file_name text not null, mapping jsonb not null default '{}'::jsonb,
  total_rows integer not null, updated_count integer not null, status text not null,
  created_by_name text, completed_at timestamptz, unique(company_id,id),
  foreign key(company_id,supplier_id) references public.product_suppliers(company_id,id)
);
create table public.supplier_products(
  id uuid primary key, company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null, latest_cost numeric(14,2), cost_confirmed boolean not null default false,
  last_seen_date date, updated_at timestamptz not null default now(), unique(company_id,id),
  foreign key(company_id,supplier_id) references public.product_suppliers(company_id,id)
);
create table public.supplier_product_matches(
  id uuid primary key default gen_random_uuid(), company_id uuid not null,
  supplier_product_id uuid not null, product_catalog_id uuid not null, match_status text not null,
  foreign key(company_id,supplier_product_id) references public.supplier_products(company_id,id),
  foreign key(company_id,product_catalog_id) references public.product_catalog(company_id,id)
);
create table public.supplier_product_cost_history(
  id uuid primary key default gen_random_uuid(), company_id uuid not null,
  supplier_product_id uuid not null, import_id uuid not null, price_date date not null,
  purchase_price numeric(14,2) not null,
  foreign key(company_id,supplier_product_id) references public.supplier_products(company_id,id) on delete cascade,
  foreign key(company_id,import_id) references public.product_catalog_imports(company_id,id) on delete cascade
);
grant select,insert,update on public.product_catalog,public.supplier_products to service_role;
grant select,insert,update,delete on public.product_catalog_imports to service_role;
grant select,insert on public.product_suppliers,public.supplier_product_matches,public.supplier_product_cost_history to service_role;
grant select,insert,delete on public.purchase_receipt_lines to service_role;
\ir 20261107-purchase-cost-date-v2.sql
-- e2(11/13) 컬럼과 정정 테이블: 운영과 같은 모양만 재현
alter table public.purchase_receipt_lines
  add column source text not null default 'upload',
  add column business_document_id uuid,
  add column invalidated_at timestamptz,
  add column invalidated_reason text,
  add column hold_reason text,
  add column released_at timestamptz;
alter table public.purchase_receipt_lines
  add constraint purchase_receipt_lines_invalid_reason_check check ((invalidated_at is null) = (invalidated_reason is null));
alter table public.supplier_product_cost_history
  add column created_at timestamptz not null default now(),
  add constraint supplier_product_cost_history_key unique(company_id,supplier_product_id,import_id,price_date);
create table public.purchase_receipt_line_overrides(
  company_id uuid not null, receipt_line_id uuid not null, product_catalog_id uuid, product_name text,
  spec text, unit text, unit_cost_ex_vat numeric, revision integer not null default 1,
  primary key(company_id,receipt_line_id));
grant update on public.purchase_receipt_lines to service_role;
grant select on public.purchase_receipt_line_overrides to service_role;

\ir 2026-11-17-purchase-date-replace.sql
\ir 2026-11-17-purchase-date-replace.sql

begin;
insert into public.companies(id) values ('00000000-0000-4000-8000-000000000001');
insert into public.product_catalog(id,company_id,purchase_product_name,purchase_price,purchase_price_date,sales_unit) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','A',100,'2026-11-05','EA');
insert into public.product_suppliers(id,company_id) values
 ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
insert into public.supplier_products(id,company_id,supplier_id,latest_cost,cost_confirmed,last_seen_date) values
 ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',200,true,'2026-11-05');
insert into public.supplier_product_matches(company_id,supplier_product_id,product_catalog_id,match_status) values
 ('00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','confirmed');
insert into public.product_catalog_imports(id,company_id,supplier_id,file_name,total_rows,updated_count,status) values
 ('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','old.xlsx',1,1,'completed');
insert into public.supplier_product_cost_history(id,company_id,supplier_product_id,import_id,price_date,purchase_price) values
 ('41000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','2026-11-05',200),
 ('41000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','2026-11-04',180);
-- 11/05 실제 전표(바뀜) · 11/04로 찍힌 10월 월합계(유지) · 11/06(파일에 없음, 유지) · 다른 회사 같은 날짜(유지)
insert into public.purchase_receipt_lines(id,company_id,receipt_date,dedupe_key,line_key,product_catalog_id,product_name,unit_price,unit_cost_ex_vat,file_name,source_row_number,raw_values) values
 ('70000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','2026-11-05','old:1','A','10000000-0000-4000-8000-000000000001','A',100,100,'old.xlsx',3,'["2026/11/05 -1","A","100"]'),
 ('70000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','2026-11-04','old:2','A','10000000-0000-4000-8000-000000000001','A',90,90,'oct.xlsx',3,'["2026/10  계","A","90"]'),
 ('70000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','2026-11-06','old:3','A','10000000-0000-4000-8000-000000000001','A',110,110,'old.xlsx',4,'["2026/11/06 -2","A","110"]');

set local role service_role;
do $$
declare
  c constant uuid := '00000000-0000-4000-8000-000000000001';
  b1 constant uuid := '50000000-0000-4000-8000-000000000001';
  b2 constant uuid := '50000000-0000-4000-8000-000000000002';
  rows jsonb := '[{"productId":"10000000-0000-4000-8000-000000000001","supplierProductId":"30000000-0000-4000-8000-000000000001","priceDate":"2026-11-05","cost":120,"supplierCost":220,"selectedSourceRowNumber":3,"priceSelected":true,"rawValues":["2026/11/05 -1","A","120"]}]';
begin
  perform public.save_purchase_cost_date_batch_v2(c,b1,'2026-11-17',rows,'tester','nov.xlsx');
  if (select replaced_receipt_count from public.purchase_cost_date_batches_v2 where id=b1)<>1
     or (select invalidated_reason from public.purchase_receipt_lines where id='70000000-0000-4000-8000-000000000001') is distinct from 'replaced_by_purchase_date_batch:'||b1
     or exists(select 1 from public.purchase_receipt_lines where id in('70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000003') and invalidated_at is not null)
  then raise exception 'replace scope mismatch'; end if;
  if (select count(*) from public.purchase_receipt_effective where company_id=c and receipt_date='2026-11-05')<>1
     or (select unit_cost_ex_vat from public.purchase_receipt_effective where company_id=c and receipt_date='2026-11-05')<>120
  then raise exception 'effective view still shows replaced row'; end if;
  if exists(select 1 from public.supplier_product_cost_history where id='41000000-0000-4000-8000-000000000001')
     or not exists(select 1 from public.supplier_product_cost_history where id='41000000-0000-4000-8000-000000000002')
     or (select count(*) from public.supplier_product_cost_history where price_date='2026-11-05')<>1
     or jsonb_array_length((select replaced_cost_history from public.purchase_cost_date_batches_v2 where id=b1))<>1
  then raise exception 'cost history replace mismatch'; end if;
  if (select purchase_price from public.product_catalog where id='10000000-0000-4000-8000-000000000001')<>120
  then raise exception 'same-date correction did not update current price'; end if;

  -- 되돌리기: 원래 11/05 행과 원가 이력이 돌아온다
  perform public.restore_purchase_cost_date_batch_v2(c,b1,'tester');
  if (select invalidated_at from public.purchase_receipt_lines where id='70000000-0000-4000-8000-000000000001') is not null
     or (select purchase_price from public.supplier_product_cost_history where id='41000000-0000-4000-8000-000000000001')<>200
     or (select count(*) from public.purchase_receipt_effective where company_id=c)<>3
  then raise exception 'restore b1 mismatch'; end if;
end $$;
reset role;
do $$ begin
  if has_function_privilege('service_role','public.purchase_cost_date_batch_replace_v2()','execute')
     or has_function_privilege('anon','public.purchase_cost_date_batch_replace_v2()','execute')
  then raise exception 'trigger function privilege mismatch'; end if;
end $$;
rollback;


begin;
insert into public.companies(id) values ('00000000-0000-4000-8000-000000000001');
insert into public.product_catalog(id,company_id,purchase_product_name,purchase_price,purchase_price_date,sales_unit) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','A',100,'2026-11-05','EA');
insert into public.product_suppliers(id,company_id) values
 ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
insert into public.supplier_products(id,company_id,supplier_id,latest_cost,cost_confirmed,last_seen_date) values
 ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',200,true,'2026-11-05');
insert into public.supplier_product_matches(company_id,supplier_product_id,product_catalog_id,match_status) values
 ('00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','confirmed');
insert into public.product_catalog_imports(id,company_id,supplier_id,file_name,total_rows,updated_count,status) values
 ('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','old.xlsx',1,1,'completed');
insert into public.supplier_product_cost_history(id,company_id,supplier_product_id,import_id,price_date,purchase_price) values
 ('41000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','2026-11-05',200),
 ('41000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','2026-11-04',180);
-- 11/05 실제 전표(바뀜) · 11/04로 찍힌 10월 월합계(유지) · 11/06(파일에 없음, 유지) · 다른 회사 같은 날짜(유지)
insert into public.purchase_receipt_lines(id,company_id,receipt_date,dedupe_key,line_key,product_catalog_id,product_name,unit_price,unit_cost_ex_vat,file_name,source_row_number,raw_values) values
 ('70000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','2026-11-05','old:1','A','10000000-0000-4000-8000-000000000001','A',100,100,'old.xlsx',3,'["2026/11/05 -1","A","100"]'),
 ('70000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','2026-11-04','old:2','A','10000000-0000-4000-8000-000000000001','A',90,90,'oct.xlsx',3,'["2026/10  계","A","90"]'),
 ('70000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','2026-11-06','old:3','A','10000000-0000-4000-8000-000000000001','A',110,110,'old.xlsx',4,'["2026/11/06 -2","A","110"]');

set local role service_role;
do $$
declare
  c constant uuid := '00000000-0000-4000-8000-000000000001';
  b1 constant uuid := '50000000-0000-4000-8000-000000000001';
  b2 constant uuid := '50000000-0000-4000-8000-000000000002';
  rows jsonb := '[{"productId":"10000000-0000-4000-8000-000000000001","supplierProductId":"30000000-0000-4000-8000-000000000001","priceDate":"2026-11-05","cost":120,"supplierCost":220,"selectedSourceRowNumber":3,"priceSelected":true,"rawValues":["2026/11/05 -1","A","120"]}]';
begin
  perform public.save_purchase_cost_date_batch_v2(c,b1,'2026-11-17',rows,'tester','nov.xlsx');
  -- 같은 날짜 정정본을 한 번 더: 이전 v2 배치 행이 바뀐다
  perform public.save_purchase_cost_date_batch_v2(c,b2,'2026-11-17',
    jsonb_set(jsonb_set(rows,'{0,cost}','125'),'{0,supplierCost}','225'),'tester','nov-v2.xlsx');
  if (select count(*) from public.purchase_receipt_lines where purchase_cost_date_batch_id=b1 and invalidated_at is not null)<>1
     or (select replaced_receipt_count from public.purchase_cost_date_batches_v2 where id=b2)<>1
     or (select unit_cost_ex_vat from public.purchase_receipt_effective where company_id=c and receipt_date='2026-11-05')<>125
     or (select purchase_price from public.product_catalog where id='10000000-0000-4000-8000-000000000001')<>125
  then raise exception 'second correction mismatch'; end if;

  -- 되돌리기: b2 를 되돌리면 b1 이 다시 유효
  perform public.restore_purchase_cost_date_batch_v2(c,b2,'tester');
  if (select count(*) from public.purchase_receipt_lines where purchase_cost_date_batch_id=b1 and invalidated_at is null)<>1
     or (select count(*) from public.purchase_receipt_effective where company_id=c and receipt_date='2026-11-05')<>1
     or (select purchase_price from public.supplier_product_cost_history h join public.product_catalog_imports i on i.id=h.import_id
          where h.price_date='2026-11-05' and i.id in(select value::text::uuid from jsonb_each_text((select supplier_import_ids from public.purchase_cost_date_batches_v2 where id=b1))))<>220
     or (select count(*) from public.supplier_product_cost_history where price_date='2026-11-05')<>1
  then raise exception 'restore b2 mismatch'; end if;
end $$;
rollback;

\ir 2026-11-17-purchase-date-replace.down.sql
do $$ begin
  if exists(select 1 from pg_trigger where tgname='purchase_cost_date_batch_replace_v2')
     or exists(select 1 from information_schema.columns where table_name='purchase_cost_date_batches_v2' and column_name='replaced_cost_history')
  then raise exception 'down did not remove objects'; end if;
end $$;
\echo 'purchase date replace PG17 test passed'

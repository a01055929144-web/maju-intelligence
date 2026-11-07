-- Disposable PostgreSQL 17 fixture only. Never run against production.
\ir ../../tests/sql/pricing-p0-fixture.sql
alter table public.product_catalog
  add column sales_unit text not null default 'EA',
  add column updated_at timestamptz not null default now();
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

begin;
insert into public.companies(id) values
 ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into public.product_catalog(id,company_id,purchase_product_name,purchase_price,purchase_price_date,sales_unit) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','A',100,'2026-10-10','EA'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','B',50,'2026-10-10','EA');
insert into public.product_suppliers(id,company_id) values
 ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
insert into public.supplier_products(id,company_id,supplier_id,latest_cost,cost_confirmed,last_seen_date) values
 ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',200,true,'2026-10-10');
insert into public.supplier_product_matches(company_id,supplier_product_id,product_catalog_id,match_status) values
 ('00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','confirmed');

set local role service_role;
do $$
declare
  c constant uuid := '00000000-0000-4000-8000-000000000001';
  batch constant uuid := '50000000-0000-4000-8000-000000000001';
  rows jsonb := '[{"productId":"10000000-0000-4000-8000-000000000001","supplierProductId":"30000000-0000-4000-8000-000000000001","priceDate":"2026-10-09","cost":90,"supplierCost":190,"selectedSourceRowNumber":2,"priceSelected":true},{"productId":"10000000-0000-4000-8000-000000000001","supplierProductId":"30000000-0000-4000-8000-000000000001","priceDate":"2026-10-09","cost":95,"supplierCost":195,"selectedSourceRowNumber":3,"priceSelected":false}]';
begin
  perform public.save_purchase_cost_date_batch_v2(c,batch,'2026-11-01',rows,'tester','old.xlsx');
  if (select purchase_price from public.product_catalog where company_id=c and id='10000000-0000-4000-8000-000000000001') <> 100
     or (select latest_cost from public.supplier_products where company_id=c and id='30000000-0000-4000-8000-000000000001') <> 200
  then raise exception 'past date overwrote current price'; end if;
  if (select count(*) from public.purchase_receipt_lines where company_id=c and receipt_date='2026-10-09') <> 2
     or (select count(*) from public.supplier_product_cost_history where company_id=c and price_date='2026-10-09') <> 1
     or (select purchase_price from public.supplier_product_cost_history where company_id=c and price_date='2026-10-09') <> 190
  then raise exception 'past date history was not saved'; end if;
  perform public.save_purchase_cost_date_batch_v2(c,batch,'2026-11-01',rows,'tester','old.xlsx');
  begin
    perform public.save_purchase_cost_date_batch_v2(c,batch,'2026-11-01',rows||'[{"productId":"10000000-0000-4000-8000-000000000001","cost":91,"selectedSourceRowNumber":3}]'::jsonb,'tester','old.xlsx');
    raise exception 'changed replay accepted';
  exception when others then if sqlerrm='changed replay accepted' then raise; end if; end;
  perform public.restore_purchase_cost_date_batch_v2(c,batch,'tester');
  if exists(select 1 from public.purchase_receipt_lines where company_id=c and purchase_cost_date_batch_id=batch)
  then raise exception 'restore left receipts'; end if;
end $$;

do $$
declare c constant uuid := '00000000-0000-4000-8000-000000000001'; before_count bigint;
begin
  select count(*) into before_count from public.purchase_receipt_lines where company_id=c;
  begin
    perform public.save_purchase_cost_date_batch_v2(c,'50000000-0000-4000-8000-000000000002','2026-11-01',
      '[{"productId":"10000000-0000-4000-8000-000000000001","priceDate":"2026-11-01","cost":110,"selectedSourceRowNumber":1,"priceSelected":true},{"productId":"99999999-0000-4000-8000-000000000001","priceDate":"2026-11-01","cost":1,"selectedSourceRowNumber":2,"priceSelected":true}]',
      'tester','atomic.xlsx');
    raise exception 'unknown product accepted';
  exception when others then if sqlerrm='unknown product accepted' then raise; end if; end;
  if (select count(*) from public.purchase_receipt_lines where company_id=c) <> before_count
     or exists(select 1 from public.purchase_cost_date_batches_v2 where company_id=c and id='50000000-0000-4000-8000-000000000002')
  then raise exception 'failed request was not atomic'; end if;
  begin
    perform public.save_purchase_cost_date_batch_v2(c,'50000000-0000-4000-8000-000000000003','2026-11-01',
      '[{"productId":"10000000-0000-4000-8000-000000000001","priceDate":"2026-11-01","cost":110,"selectedSourceRowNumber":1},{"productId":"10000000-0000-4000-8000-000000000001","priceDate":"2026-11-01","cost":120,"selectedSourceRowNumber":2}]',
      'tester','conflict.xlsx');
    raise exception 'unconfirmed conflict accepted';
  exception when others then if sqlerrm='unconfirmed conflict accepted' then raise; end if; end;
  perform public.save_purchase_cost_date_batch_v2(c,'50000000-0000-4000-8000-000000000005','2026-11-01',
    '[{"productId":"10000000-0000-4000-8000-000000000001","cost":110,"selectedSourceRowNumber":11,"priceHeld":true},{"productId":"10000000-0000-4000-8000-000000000001","cost":120,"selectedSourceRowNumber":12}]',
    'tester','held.xlsx');
  if (select purchase_price from public.product_catalog where company_id=c and id='10000000-0000-4000-8000-000000000001') <> 100
     or (select count(*) from public.purchase_receipt_lines where purchase_cost_date_batch_id='50000000-0000-4000-8000-000000000005') <> 2
  then raise exception 'held conflict changed current price or lost receipts'; end if;
  perform public.restore_purchase_cost_date_batch_v2(c,'50000000-0000-4000-8000-000000000005','tester');
end $$;

-- Functional proof that one transaction accepts the representative 745 mapped products / 3,417 selected rows.
insert into public.product_catalog(id,company_id,purchase_product_name,purchase_price,purchase_price_date,sales_unit)
select ('60000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,
 '00000000-0000-4000-8000-000000000001','bulk-'||g,1,'2026-01-01','EA'
from generate_series(1,745) g;
do $$
declare payload jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'productId','60000000-0000-4000-8000-'||lpad((((g-1)%745)+1)::text,12,'0'),
    'priceDate','2026-11-01',
    'cost',g,'selectedSourceRowNumber',g,'priceSelected',g<=745) order by g) into payload
  from generate_series(1,3417) g;
  perform public.save_purchase_cost_date_batch_v2(
    '00000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000004',
    '2026-11-01',payload,'tester','3417.xlsx');
  if (select count(*) from public.purchase_receipt_lines where purchase_cost_date_batch_id='50000000-0000-4000-8000-000000000004') <> 3417
  then raise exception '3417-row save incomplete'; end if;
end $$;

reset role;
do $$ begin
  if has_function_privilege('anon','public.save_purchase_cost_date_batch_v2(uuid,uuid,date,jsonb,text,text)','execute')
     or has_function_privilege('authenticated','public.save_purchase_cost_date_batch_v2(uuid,uuid,date,jsonb,text,text)','execute')
     or not has_function_privilege('service_role','public.save_purchase_cost_date_batch_v2(uuid,uuid,date,jsonb,text,text)','execute')
  then raise exception 'function privilege mismatch'; end if;
end $$;
rollback;

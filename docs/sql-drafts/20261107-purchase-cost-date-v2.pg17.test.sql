-- Disposable PostgreSQL 17 fixture only. Never run against production.
\ir ../../tests/sql/pricing-p0-fixture.sql
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

begin;
insert into public.companies(id) values
 ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into public.product_catalog(id,company_id,purchase_product_name,purchase_price,purchase_price_date,sales_unit) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','A',100,'2026-10-10','EA'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','B',50,'2026-10-10','EA'),
 ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','신규 미가격',0,null,'EA');
insert into public.product_suppliers(id,company_id) values
 ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
insert into public.supplier_products(id,company_id,supplier_id,latest_cost,cost_confirmed,last_seen_date) values
 ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',200,true,'2026-10-10'),
 ('30000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',300,true,'2026-11-01');
insert into public.supplier_product_matches(company_id,supplier_product_id,product_catalog_id,match_status) values
 ('00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','confirmed'),
 ('00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','confirmed');

set local role service_role;
do $$
declare
  c constant uuid := '00000000-0000-4000-8000-000000000001';
  batch constant uuid := '50000000-0000-4000-8000-000000000001';
  rows jsonb := '[{"productId":"10000000-0000-4000-8000-000000000001","supplierProductId":"30000000-0000-4000-8000-000000000001","priceDate":"2026-10-09","cost":90,"supplierCost":190,"selectedSourceRowNumber":2,"priceSelected":true},{"productId":"10000000-0000-4000-8000-000000000001","supplierProductId":"30000000-0000-4000-8000-000000000001","priceDate":"2026-10-09","cost":95,"supplierCost":195,"selectedSourceRowNumber":3,"priceSelected":false},{"productId":"10000000-0000-4000-8000-000000000001","supplierProductId":"30000000-0000-4000-8000-000000000001","priceDate":"2026-10-09","cost":90,"supplierCost":190,"selectedSourceRowNumber":4,"priceSelected":false}]';
  before_price bigint;
  applied jsonb;
begin
  perform public.pricing_p0_command(c,'{"action":"defaults","margin":20,"rounding":10}');
  perform public.pricing_p0_command(c,'{"action":"recalculate"}');
  select price into before_price from public.pricing_items
    where company_id=c and product_id='10000000-0000-4000-8000-000000000001';
  applied:=public.save_purchase_cost_date_batch_v2(c,batch,'2026-11-01',rows,'tester','old.xlsx');
  if (applied->>'historyOnlyProductCount')::integer<>1
  then raise exception 'past-date history-only count mismatch'; end if;
  if (select purchase_price from public.product_catalog where company_id=c and id='10000000-0000-4000-8000-000000000001') <> 100
     or (select latest_cost from public.supplier_products where company_id=c and id='30000000-0000-4000-8000-000000000001') <> 200
  then raise exception 'past date overwrote current price'; end if;
  if (select count(*) from public.purchase_receipt_lines where company_id=c and receipt_date='2026-10-09') <> 3
     or (select array_agg(source_row_number order by source_row_number) from public.purchase_receipt_lines
         where company_id=c and receipt_date='2026-10-09') <> array[2,3,4]
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
  applied:=public.save_purchase_cost_date_batch_v2(c,'50000000-0000-4000-8000-000000000010','2026-11-07',
    '[{"productId":"10000000-0000-4000-8000-000000000001","supplierProductId":"30000000-0000-4000-8000-000000000001","priceDate":"2026-11-07","cost":140,"supplierCost":240,"selectedSourceRowNumber":101,"priceSelected":true},{"productId":"10000000-0000-4000-8000-000000000001","supplierProductId":"30000000-0000-4000-8000-000000000003","priceDate":"2026-11-06","cost":130,"supplierCost":330,"selectedSourceRowNumber":102,"priceSelected":true}]',
    'tester','two-suppliers.xlsx');
  if (select purchase_price from public.product_catalog where company_id=c and id='10000000-0000-4000-8000-000000000001')<>140
     or (select latest_cost from public.supplier_products where company_id=c and id='30000000-0000-4000-8000-000000000003')<>330
     or (select last_seen_date from public.supplier_products where company_id=c and id='30000000-0000-4000-8000-000000000003')<>'2026-11-06'
  then raise exception 'supplier latest cost was incorrectly tied to product latest date'; end if;
  perform public.restore_purchase_cost_date_batch_v2(c,'50000000-0000-4000-8000-000000000010','tester');
  if (select latest_cost from public.supplier_products where company_id=c and id='30000000-0000-4000-8000-000000000003')<>300
     or (select last_seen_date from public.supplier_products where company_id=c and id='30000000-0000-4000-8000-000000000003')<>'2026-11-01'
  then raise exception 'supplier-specific snapshot restore failed'; end if;

  update public.product_catalog set purchase_price_date='2026-11-01'
    where company_id=c and id='10000000-0000-4000-8000-000000000001';
  applied:=public.save_purchase_cost_date_batch_v2(c,'50000000-0000-4000-8000-000000000008','2026-11-07',
    '[{"productId":"10000000-0000-4000-8000-000000000001","priceDate":"2026-11-06","cost":110,"selectedSourceRowNumber":81,"priceSelected":true},{"productId":"10000000-0000-4000-8000-000000000001","priceDate":"2026-11-07","cost":120,"selectedSourceRowNumber":82,"priceHeld":true}]',
    'tester','latest-held.xlsx');
  if applied->>'recalcRunId' is not null or (applied->>'historyOnlyProductCount')::integer<>1
     or (select purchase_price from public.product_catalog where company_id=c and id='10000000-0000-4000-8000-000000000001')<>100
     or (select price from public.pricing_items where company_id=c and product_id='10000000-0000-4000-8000-000000000001')<>before_price
  then raise exception 'latest held date promoted an older selected price'; end if;
  perform public.restore_purchase_cost_date_batch_v2(c,'50000000-0000-4000-8000-000000000008','tester');

  update public.product_catalog set purchase_price_date=null
    where company_id=c and id='10000000-0000-4000-8000-000000000001';
  applied:=public.save_purchase_cost_date_batch_v2(c,'50000000-0000-4000-8000-000000000009','2026-11-08',
    '[{"productId":"10000000-0000-4000-8000-000000000001","cost":130,"selectedSourceRowNumber":91,"priceSelected":true}]',
    'tester','unknown-baseline-date.xlsx');
  if applied->>'recalcRunId' is not null or (applied->>'historyOnlyProductCount')::integer<>1
     or (select purchase_price from public.product_catalog where company_id=c and id='10000000-0000-4000-8000-000000000001')<>100
  then raise exception 'undated existing current price was overwritten'; end if;
  perform public.restore_purchase_cost_date_batch_v2(c,'50000000-0000-4000-8000-000000000009','tester');
  applied:=public.save_purchase_cost_date_batch_v2(c,'50000000-0000-4000-8000-000000000013','2026-11-08',
    '[{"productId":"10000000-0000-4000-8000-000000000001","cost":130,"selectedSourceRowNumber":131,"priceSelected":true,"replaceUndatedCurrent":true,"expectedPurchasePrice":100}]',
    'tester','confirmed-undated-baseline.xlsx');
  if applied->>'recalcRunId' is null or (applied->>'historyOnlyProductCount')::integer<>0
     or not exists(select 1 from public.product_catalog
       where company_id=c and id='10000000-0000-4000-8000-000000000001'
       and purchase_price=130 and purchase_price_date='2026-11-08')
  then raise exception 'confirmed undated baseline was not replaced'; end if;
  perform public.restore_purchase_cost_date_batch_v2(c,'50000000-0000-4000-8000-000000000013','tester');
  begin
    perform public.save_purchase_cost_date_batch_v2(c,'50000000-0000-4000-8000-000000000014','2026-11-08',
      '[{"productId":"10000000-0000-4000-8000-000000000001","cost":130,"selectedSourceRowNumber":141,"priceSelected":true,"replaceUndatedCurrent":true,"expectedPurchasePrice":99}]',
      'tester','stale-undated-baseline.xlsx');
    raise exception 'stale expected purchase price accepted';
  exception when others then
    if sqlerrm='stale expected purchase price accepted' then raise; end if;
  end;
  if exists(select 1 from public.purchase_cost_date_batches_v2
      where company_id=c and id='50000000-0000-4000-8000-000000000014')
  then raise exception 'stale expected purchase price left a partial batch'; end if;
  update public.product_catalog set purchase_price_date='2026-10-10'
    where company_id=c and id='10000000-0000-4000-8000-000000000001';

  update public.product_catalog set purchase_price=180
    where company_id=c and id='10000000-0000-4000-8000-000000000001';
  if (select purchase_price_date from public.product_catalog
      where company_id=c and id='10000000-0000-4000-8000-000000000001') is not null
  then raise exception 'undated legacy writer left a stale price date'; end if;
  applied:=public.save_purchase_cost_date_batch_v2(c,'50000000-0000-4000-8000-000000000012','2026-11-09',
    '[{"productId":"10000000-0000-4000-8000-000000000001","cost":170,"selectedSourceRowNumber":121,"priceSelected":true}]',
    'tester','after-manual-write.xlsx');
  if (select purchase_price from public.product_catalog
      where company_id=c and id='10000000-0000-4000-8000-000000000001')<>180
  then raise exception 'dated import overwrote an undated manual current price'; end if;
  perform public.restore_purchase_cost_date_batch_v2(c,'50000000-0000-4000-8000-000000000012','tester');
  update public.product_catalog set purchase_price=100,purchase_price_date='2026-10-10'
    where company_id=c and id='10000000-0000-4000-8000-000000000001';

  applied:=public.save_purchase_cost_date_batch_v2(c,'50000000-0000-4000-8000-000000000011','2026-11-08',
    '[{"productId":"10000000-0000-4000-8000-000000000003","cost":77,"selectedSourceRowNumber":111,"priceSelected":true}]',
    'tester','new-zero-priced.xlsx');
  if applied->>'recalcRunId' is null
     or not exists(select 1 from public.product_catalog
       where company_id=c and id='10000000-0000-4000-8000-000000000003'
       and purchase_price=77 and purchase_price_date='2026-11-08')
  then raise exception 'zero-priced new product did not receive dated current price'; end if;
  perform public.restore_purchase_cost_date_batch_v2(c,'50000000-0000-4000-8000-000000000011','tester');
  if not exists(select 1 from public.product_catalog
      where company_id=c and id='10000000-0000-4000-8000-000000000003'
      and purchase_price=0 and purchase_price_date is null)
  then raise exception 'zero-priced new product restore failed'; end if;

  applied:=public.save_purchase_cost_date_batch_v2(c,'50000000-0000-4000-8000-000000000006','2026-11-01',
    '[{"productId":"10000000-0000-4000-8000-000000000001","cost":150,"selectedSourceRowNumber":6,"priceSelected":true}]',
    'tester','new.xlsx');
  if applied->>'recalcRunId' is null
     or (select purchase_price from public.product_catalog where company_id=c and id='10000000-0000-4000-8000-000000000001')<>150
     or (select price from public.pricing_items where company_id=c and product_id='10000000-0000-4000-8000-000000000001')=before_price
  then raise exception 'cost and sales-price transaction incomplete'; end if;
  perform public.restore_purchase_cost_date_batch_v2(c,'50000000-0000-4000-8000-000000000006','tester');
  if (select purchase_price from public.product_catalog where company_id=c and id='10000000-0000-4000-8000-000000000001')<>100
     or (select price from public.pricing_items where company_id=c and product_id='10000000-0000-4000-8000-000000000001')<>before_price
  then raise exception 'restore did not restore cost and sales price'; end if;
end $$;

do $$
declare c constant uuid := '00000000-0000-4000-8000-000000000001'; before_count bigint;
begin
  select count(*) into before_count from public.purchase_receipt_lines where company_id=c;
  begin
    perform public.save_purchase_cost_date_batch_v2(c,'50000000-0000-4000-8000-000000000002','2026-11-01',
      '[{"productId":"10000000-0000-4000-8000-000000000001","priceDate":"2026-11-01","cost":110,"selectedSourceRowNumber":1,"priceSelected":true},{"productId":"10000000-0000-4000-8000-000000000002","priceDate":"2026-11-01","cost":1,"selectedSourceRowNumber":2,"priceSelected":true}]',
      'tester','atomic.xlsx');
    raise exception 'cross-company product accepted';
  exception when others then if sqlerrm='cross-company product accepted' then raise; end if; end;
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
\timing on
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
     or (select history_only_product_count from public.purchase_cost_date_batches_v2
         where company_id='00000000-0000-4000-8000-000000000001'
           and id='50000000-0000-4000-8000-000000000004')<>0
  then raise exception '3417-row save incomplete or history-only count mismatch'; end if;
end $$;
\timing off

reset role;
create function pg_temp.reject_recalc_run() returns trigger language plpgsql as $$
begin raise exception 'forced_recalc_failure'; end $$;
create trigger reject_recalc_run before insert on public.price_recalc_runs
for each row execute function pg_temp.reject_recalc_run();
set local role service_role;
do $$
declare c constant uuid := '00000000-0000-4000-8000-000000000001';
begin
  begin
    perform public.save_purchase_cost_date_batch_v2(c,'50000000-0000-4000-8000-000000000007','2026-11-02',
      '[{"productId":"10000000-0000-4000-8000-000000000001","cost":160,"selectedSourceRowNumber":7,"priceSelected":true}]',
      'tester','recalc-fails.xlsx');
    raise exception 'recalc failure accepted';
  exception when others then
    if sqlerrm='recalc failure accepted' then raise; end if;
  end;
  if (select purchase_price from public.product_catalog where company_id=c and id='10000000-0000-4000-8000-000000000001')<>100
     or exists(select 1 from public.purchase_cost_date_batches_v2 where company_id=c and id='50000000-0000-4000-8000-000000000007')
     or exists(select 1 from public.purchase_receipt_lines where company_id=c and purchase_cost_date_batch_id='50000000-0000-4000-8000-000000000007')
  then raise exception 'recalc failure left partial cost state'; end if;
end $$;

reset role;
do $$ begin
  if has_function_privilege('anon','public.save_purchase_cost_date_batch_v2(uuid,uuid,date,jsonb,text,text)','execute')
     or has_function_privilege('authenticated','public.save_purchase_cost_date_batch_v2(uuid,uuid,date,jsonb,text,text)','execute')
     or not has_function_privilege('service_role','public.save_purchase_cost_date_batch_v2(uuid,uuid,date,jsonb,text,text)','execute')
  then raise exception 'function privilege mismatch'; end if;
end $$;
rollback;

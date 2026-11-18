\set ON_ERROR_STOP on
do $$ begin
  assert current_database() = 'cx41_order_return_test';
  assert current_setting('server_version_num')::int / 10000 = 17;
end $$;

-- CX-62's test intentionally exercises its down file. Reapply the approved draft
-- into the same disposable fixture before testing dispatch.
\ir 2026-11-17-CX-62-order-receipt.sql
create function public.inventory_resolve_document_lines(p_company_id uuid, p_document_id uuid)
returns table(line_id uuid, product_catalog_id uuid, base_quantity numeric, line_value bigint, resolve_status text)
language sql stable set search_path = public as $$
  select l.id, l.product_catalog_id, l.quantity, l.supply_amount,
    case when l.product_name_snapshot = '환산 실패' then 'no_conversion'
         when l.product_catalog_id is null then 'no_product' else 'ok' end
  from business_document_lines l where l.company_id=p_company_id and l.document_id=p_document_id
$$;
\ir 2026-11-18-CX-66-order-dispatch.sql

\set company '00000000-0000-0000-0000-0000000000c1'
\set customer '00000000-0000-0000-0000-0000000000a1'
\set product '00000000-0000-0000-0000-0000000000a3'
\set order1 '00000000-0000-0000-0000-0000000000f1'
\set order2 '00000000-0000-0000-0000-0000000000f2'
\set order3 '00000000-0000-0000-0000-0000000000f3'
\set key1 '10000000-0000-4000-8000-000000000001'
\set key2 '10000000-0000-4000-8000-000000000002'

insert into store_orders(id,company_id,customer_id,delivery_date,status,delivery_fee,known_total)
values (:'order1',:'company',:'customer','2026-11-18','submitted',0,2420),
       (:'order2',:'company',:'customer','2026-11-18','submitted',0,1210);
insert into store_order_lines(company_id,order_id,product_id,product_name,sales_unit,quantity,unit_price,tax_type,is_market_price)
values (:'company',:'order1',:'product','출고 상품','개',2,1100,'taxable',false),
       (:'company',:'order2',:'product','출고 상품','개',1,1100,'taxable',false);
select receive_store_order_with_sale_document(:'company',:'order1',1,null,'합성 담당');
select receive_store_order_with_sale_document(:'company',:'order2',1,null,'합성 담당');

-- Manual confirmation is blocked; batch dispatch produces each effect once.
do $$ declare d business_documents%rowtype; begin
  select * into strict d from business_documents where source_id='00000000-0000-0000-0000-0000000000f1';
  begin perform confirm_business_document(d.company_id,d.id,null,'우회');
    raise exception 'manual confirmation bypassed dispatch';
  exception when raise_exception then assert sqlerrm='order_sale_document_requires_dispatch'; end;
end $$;
select dispatch_store_orders(:'company',array[:'order1'::uuid,:'order2'::uuid],:'key1',null,'합성 출고');
select dispatch_store_orders(:'company',array[:'order2'::uuid,:'order1'::uuid],:'key1',null,'합성 출고');
do $$ begin
  assert (select count(*) from store_orders where id in
    ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000f2') and status='in_delivery')=2;
  assert (select count(*) from business_documents where source_id in
    ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000f2') and status='confirmed')=2;
  assert (select count(*) from partner_ledger_entries where source_document_id in
    (select id from business_documents where source_id in
      ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000f2')))=2;
  assert (select count(*) from inventory_movements where source_document_id in
    (select id from business_documents where source_id in
      ('00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000f2')))=2;
  begin perform dispatch_store_orders('00000000-0000-0000-0000-0000000000c1',
    array['00000000-0000-0000-0000-0000000000f1'::uuid],
    '10000000-0000-4000-8000-000000000001',null,'합성');
    raise exception 'idempotency conflict accepted';
  exception when raise_exception then assert sqlerrm='order_dispatch_idempotency_conflict'; end;
end $$;

-- A foreign-company order and its draft never enter the caller company's batch.
insert into product_catalog values
 ('00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000c2','OTHER',1000);
insert into pricing_effective_source values
 ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a5',1000,1000,10);
insert into store_orders(id,company_id,customer_id,delivery_date,status,delivery_fee,known_total)
values ('00000000-0000-0000-0000-0000000000f7','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a2','2026-11-18','submitted',0,1210);
insert into store_order_lines(company_id,order_id,product_id,product_name,sales_unit,quantity,unit_price,tax_type,is_market_price)
values ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000f7','00000000-0000-0000-0000-0000000000a5','타사 상품','개',1,1100,'taxable',false);
select receive_store_order_with_sale_document('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000f7',1,null,'타사 담당');
do $$ declare ledger_before bigint; inventory_before bigint; begin
  select count(*) into ledger_before from partner_ledger_entries;
  select count(*) into inventory_before from inventory_movements;
  begin perform dispatch_store_orders('00000000-0000-0000-0000-0000000000c1',
    array['00000000-0000-0000-0000-0000000000f7'::uuid],
    '10000000-0000-4000-8000-000000000007',null,'회사 혼합');
    raise exception 'cross-company order accepted';
  exception when raise_exception then assert sqlerrm='order_dispatch_order_not_found'; end;
  assert (select status='received' from store_orders where company_id='00000000-0000-0000-0000-0000000000c2' and id='00000000-0000-0000-0000-0000000000f7');
  assert (select status='draft' from business_documents where company_id='00000000-0000-0000-0000-0000000000c2' and source_id='00000000-0000-0000-0000-0000000000f7');
  assert (select count(*) from partner_ledger_entries)=ledger_before;
  assert (select count(*) from inventory_movements)=inventory_before;
  assert not exists(select 1 from order_dispatch_requests where idempotency_key='10000000-0000-4000-8000-000000000007');
end $$;

-- A one-won document discrepancy rejects the order before any new effect.
insert into store_orders(id,company_id,customer_id,delivery_date,status,delivery_fee,known_total)
values (:'order3',:'company',:'customer','2026-11-18','submitted',0,1210);
insert into store_order_lines(company_id,order_id,product_id,product_name,sales_unit,quantity,unit_price,tax_type,is_market_price)
values (:'company',:'order3',:'product','출고 상품','개',1,1100,'taxable',false);
select receive_store_order_with_sale_document(:'company',:'order3',1,null,'합성 담당');
update business_document_lines set unit_price=1099
where document_id=(select id from business_documents where source_id=:'order3');
do $$ declare before_ledger bigint; before_inventory bigint; begin
  select count(*) into before_ledger from partner_ledger_entries;
  select count(*) into before_inventory from inventory_movements;
  begin perform dispatch_store_orders('00000000-0000-0000-0000-0000000000c1',
    array['00000000-0000-0000-0000-0000000000f3'::uuid],
    '10000000-0000-4000-8000-000000000002',null,'합성');
    raise exception 'amount mismatch accepted';
  exception when raise_exception then assert sqlerrm='order_dispatch_amount_mismatch'; end;
  assert (select status='received' from store_orders where id='00000000-0000-0000-0000-0000000000f3');
  assert (select status='draft' from business_documents where source_id='00000000-0000-0000-0000-0000000000f3');
  assert (select count(*) from partner_ledger_entries)=before_ledger;
  assert (select count(*) from inventory_movements)=before_inventory;
end $$;

-- Two real connections with the same key converge on one result and one financial effect.
insert into store_orders(id,company_id,customer_id,delivery_date,status,delivery_fee,known_total)
values ('00000000-0000-0000-0000-0000000000f6',:'company',:'customer','2026-11-18','submitted',0,1210);
insert into store_order_lines(company_id,order_id,product_id,product_name,sales_unit,quantity,unit_price,tax_type,is_market_price)
values (:'company','00000000-0000-0000-0000-0000000000f6',:'product','동시 출고','개',1,1100,'taxable',false);
select receive_store_order_with_sale_document(:'company','00000000-0000-0000-0000-0000000000f6',1,null,'합성 담당');
select dblink_connect('dispatch_a',format('dbname=%L user=%L',current_database(),current_user));
select dblink_connect('dispatch_b',format('dbname=%L user=%L',current_database(),current_user));
select dblink_send_query('dispatch_a',$q$select public.dispatch_store_orders(
  '00000000-0000-0000-0000-0000000000c1',array['00000000-0000-0000-0000-0000000000f6'::uuid],
  '10000000-0000-4000-8000-000000000006',null,'동시 A')$q$);
select dblink_send_query('dispatch_b',$q$select public.dispatch_store_orders(
  '00000000-0000-0000-0000-0000000000c1',array['00000000-0000-0000-0000-0000000000f6'::uuid],
  '10000000-0000-4000-8000-000000000006',null,'동시 B')$q$);
create temporary table cx66_concurrent_results as
  select result from dblink_get_result('dispatch_a') as t(result jsonb)
  union all select result from dblink_get_result('dispatch_b') as t(result jsonb);
select dblink_disconnect('dispatch_a'), dblink_disconnect('dispatch_b');
do $$ declare d uuid; begin
  assert (select count(*)=2 and count(distinct result)=1 from cx66_concurrent_results);
  select id into strict d from business_documents where source_id='00000000-0000-0000-0000-0000000000f6';
  assert (select count(*) from partner_ledger_entries where source_document_id=d)=1;
  assert (select count(*) from inventory_movements where source_document_id=d)=1;
end $$;

-- If the second order fails while posting inventory, the first order's document,
-- ledger, inventory and status all roll back with the batch.
insert into store_orders(id,company_id,customer_id,delivery_date,status,delivery_fee,known_total)
values ('00000000-0000-0000-0000-0000000000f4',:'company',:'customer','2026-11-18','submitted',0,1210),
       ('00000000-0000-0000-0000-0000000000f5',:'company',:'customer','2026-11-18','submitted',0,1210);
insert into store_order_lines(company_id,order_id,product_id,product_name,sales_unit,quantity,unit_price,tax_type,is_market_price)
values (:'company','00000000-0000-0000-0000-0000000000f4',:'product','묶음 첫 주문','개',1,1100,'taxable',false),
       (:'company','00000000-0000-0000-0000-0000000000f5',:'product','묶음 둘째 주문','개',1,1100,'taxable',false);
select receive_store_order_with_sale_document(:'company','00000000-0000-0000-0000-0000000000f4',1,null,'합성 담당');
select receive_store_order_with_sale_document(:'company','00000000-0000-0000-0000-0000000000f5',1,null,'합성 담당');
create function cx66_fail_second_inventory() returns trigger language plpgsql as $$
begin
  if new.source_document_id=(select id from business_documents
    where source_id='00000000-0000-0000-0000-0000000000f5') then
    raise exception 'cx66_forced_inventory_failure';
  end if;
  return new;
end $$;
create trigger cx66_fail_second_inventory before insert on inventory_movements
for each row execute function cx66_fail_second_inventory();
do $$ declare ledger_before bigint; inventory_before bigint; begin
  select count(*) into ledger_before from partner_ledger_entries;
  select count(*) into inventory_before from inventory_movements;
  begin
    perform dispatch_store_orders('00000000-0000-0000-0000-0000000000c1',array[
      '00000000-0000-0000-0000-0000000000f4'::uuid,
      '00000000-0000-0000-0000-0000000000f5'::uuid],
      '10000000-0000-4000-8000-000000000045',null,'묶음 출고');
    raise exception 'forced inventory failure accepted';
  exception when raise_exception then assert sqlerrm='cx66_forced_inventory_failure'; end;
  assert (select count(*) from store_orders where id in
    ('00000000-0000-0000-0000-0000000000f4','00000000-0000-0000-0000-0000000000f5') and status='received')=2;
  assert (select count(*) from business_documents where source_id in
    ('00000000-0000-0000-0000-0000000000f4','00000000-0000-0000-0000-0000000000f5') and status='draft')=2;
  assert (select count(*) from partner_ledger_entries)=ledger_before;
  assert (select count(*) from inventory_movements)=inventory_before;
end $$;
drop trigger cx66_fail_second_inventory on inventory_movements;
drop function cx66_fail_second_inventory();

-- Down must preserve idempotency history after any real dispatch.
\set ON_ERROR_STOP off
\ir 2026-11-18-CX-66-order-dispatch.down.sql
\set ON_ERROR_STOP on
do $$ begin
  assert to_regprocedure('public.dispatch_store_orders(uuid,uuid[],uuid,uuid,text)') is not null;
  assert to_regclass('public.order_dispatch_requests') is not null;
  assert exists(select 1 from public.order_dispatch_requests);
end $$;
delete from public.order_dispatch_requests;
\ir 2026-11-18-CX-66-order-dispatch.down.sql
do $$ begin
  assert to_regprocedure('public.dispatch_store_orders(uuid,uuid[],uuid,uuid,text)') is null;
  assert to_regclass('public.order_dispatch_requests') is null;
end $$;
select 'CX-66 atomic order dispatch PG17 checks passed' as result;

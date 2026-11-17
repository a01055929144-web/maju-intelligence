-- Run after the disposable CX-41 PG17 fixture has exercised CX-38 down.
\set ON_ERROR_STOP on
do $$ begin
  assert current_database() = 'cx41_order_return_test' and current_setting('server_version_num')::int / 10000 = 17,
    'disposable PG17 database required';
end $$;
\ir 2026-11-16-CX-38-order-sale-documents.sql
alter table public.store_orders add column updated_at timestamptz, add column known_total bigint not null default 0;
alter table public.normalized_customers add column business_name text, add column delivery_base_address text;
\ir 2026-11-17-CX-62-order-receipt.sql
do $$ begin
  assert not exists(select 1 from pg_trigger where tgrelid='public.business_documents'::regclass
    and tgname='order_sale_document_requires_dispatch'), 'receipt-only SQL must leave existing confirmation available';
end $$;
create extension dblink;

\set company '00000000-0000-0000-0000-0000000000c1'
\set customer '00000000-0000-0000-0000-0000000000a1'
\set product '00000000-0000-0000-0000-0000000000a3'
\set edited_order '00000000-0000-0000-0000-0000000000d3'
\set blocked_order '00000000-0000-0000-0000-0000000000d4'
\set mismatch_order '00000000-0000-0000-0000-0000000000d5'
update normalized_customers set customer_name='관리 매장명', business_name='  등록증 상호  ', business_registration_number='1234567890',
  address=null, delivery_base_address='합성 배송 주소' where id=:'customer' and company_id=:'company';
insert into store_orders(id,company_id,customer_id,delivery_date,status,delivery_fee,known_total)
values (:'edited_order',:'company',:'customer','2026-11-17','submitted',110,1920),
       (:'blocked_order',:'company',:'customer','2026-11-17','submitted',0,1210),
       (:'mismatch_order',:'company',:'customer','2026-11-17','submitted',0,1209);
insert into store_order_lines(company_id,order_id,product_id,product_name,sales_unit,quantity,unit_price,tax_type,is_market_price)
values (:'company',:'edited_order',:'product','접수 경합 품목','개',1,1100,'taxable',false),
       (:'company',:'edited_order','00000000-0000-0000-0000-0000000000a4','면세 품목','개',1,600,'exempt',false),
       (:'company',:'blocked_order',:'product','접수 거부 품목','개',1,1100,'taxable',false),
       (:'company',:'mismatch_order',:'product','금액 불일치','개',1,1100,'taxable',false);

create temporary table cx62_before as
select (select count(*) from partner_ledger_entries) as ledger,
       (select count(*) from inventory_movements) as inventory;
do $$ begin
  assert not has_function_privilege('authenticated','public.receive_store_order_with_sale_document(uuid,uuid,integer,uuid,text)','execute');
  assert has_function_privilege('service_role','public.receive_store_order_with_sale_document(uuid,uuid,integer,uuid,text)','execute');
  assert not exists(select 1 from business_documents where source_id in
    ('00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000d4'));
  begin
    perform receive_store_order_with_sale_document('00000000-0000-0000-0000-0000000000c2',
      '00000000-0000-0000-0000-0000000000d3',1,null,'합성 담당');
    raise exception 'cross-company receipt accepted';
  exception when raise_exception then assert sqlerrm = 'order_receipt_conflict'; end;
end $$;

-- Simulate the existing order status guard rejecting receipt after ERP writes.
create function cx62_refuse_receipt() returns trigger language plpgsql as $$
begin raise exception 'store_customer_review_required'; end $$;
create trigger cx62_refuse_receipt before update on public.store_orders for each row
  when (new.id = '00000000-0000-0000-0000-0000000000d4' and new.status = 'received')
  execute function cx62_refuse_receipt();
do $$ begin
  begin
    perform receive_store_order_with_sale_document('00000000-0000-0000-0000-0000000000c1',
      '00000000-0000-0000-0000-0000000000d4',1,null,'합성 담당');
    raise exception 'status guard bypassed';
  exception when raise_exception then assert sqlerrm = 'store_customer_review_required'; end;
  begin
    perform receive_store_order_with_sale_document('00000000-0000-0000-0000-0000000000c1',
      '00000000-0000-0000-0000-0000000000d5',1,null,'합성 담당');
    raise exception 'amount discrepancy accepted';
  exception when raise_exception then assert sqlerrm = 'order_receipt_amount_mismatch'; end;
  assert (select count(*) from store_orders where status = 'submitted' and id in
    ('00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-0000000000d5')) = 2;
  assert not exists(select 1 from business_documents where source_id='00000000-0000-0000-0000-0000000000d5');
  assert not exists(select 1 from business_documents where source_id='00000000-0000-0000-0000-0000000000d4');
  assert (select count(*) from partner_ledger_entries) = (select ledger from cx62_before);
  assert (select count(*) from inventory_movements) = (select inventory from cx62_before);
end $$;

-- Send receipt while another session holds a store edit lock; the stale revision must lose.
select dblink_connect('edit',format('dbname=%L user=%L',current_database(),current_user));
select dblink_connect('receipt_a',format('dbname=%L user=%L',current_database(),current_user));
select dblink_connect('receipt_b',format('dbname=%L user=%L',current_database(),current_user));
select dblink_exec('edit','begin');
select dblink_exec('edit',format('update public.store_orders set revision=2, known_total=4340 where id=%L',:'edited_order'));
select dblink_exec('edit',format('update public.store_order_lines set quantity=3 where tax_type=''taxable'' and order_id=%L',:'edited_order'));
select dblink_send_query('receipt_a',format('select public.receive_store_order_with_sale_document(%L,%L,1,null,%L)',:'company',:'edited_order','합성 담당'));
select dblink_exec('edit','commit');
select * from dblink_get_result('receipt_a',false) as t(result jsonb);
select * from dblink_get_result('receipt_a',false) as t(result jsonb);
do $$ begin
  assert dblink_error_message('receipt_a') like '%order_receipt_conflict%';
  assert not exists(select 1 from business_documents where source_id='00000000-0000-0000-0000-0000000000d3');
  assert (select count(*) from partner_ledger_entries) = (select ledger from cx62_before);
  assert (select count(*) from inventory_movements) = (select inventory from cx62_before);
end $$;

-- Two callers receiving the latest revision get the same receipt and a single set of financial effects.
select dblink_send_query('receipt_a',format('select public.receive_store_order_with_sale_document(%L,%L,2,null,%L)',:'company',:'edited_order','합성 담당'));
select dblink_send_query('receipt_b',format('select public.receive_store_order_with_sale_document(%L,%L,2,null,%L)',:'company',:'edited_order','합성 담당'));
create temporary table cx62_results as select result from dblink_get_result('receipt_a') as t(result jsonb)
  union all select result from dblink_get_result('receipt_b') as t(result jsonb);
select dblink_disconnect('edit'),dblink_disconnect('receipt_a'),dblink_disconnect('receipt_b');
do $$ declare d public.business_documents%rowtype; begin
  assert (select count(*)=2 and count(distinct result)=1 from cx62_results);
  assert (select status='received' and revision=3 from store_orders where id='00000000-0000-0000-0000-0000000000d3');
  select * into strict d from business_documents where source_id='00000000-0000-0000-0000-0000000000d3';
  assert d.status = 'draft' and d.taxable_supply_amount = 3400 and d.exempt_supply_amount = 600 and d.tax_amount = 340;
  assert d.total_amount = (select known_total from store_orders where id=d.source_id) and d.total_amount = 4340;
  assert (select quantity from business_document_lines where document_id=d.id and product_name_snapshot='접수 경합 품목')=3;
  assert d.partner_name_snapshot = '등록증 상호' and d.partner_business_number_snapshot = '1234567890';
  assert d.partner_address_snapshot is not distinct from '';
  assert (select count(*) from partner_ledger_entries) = (select ledger from cx62_before);
  assert (select count(*) from inventory_movements) = (select inventory from cx62_before);
end $$;
-- Exercise the detached CX-66 contract separately from the receipt activation.
begin;
\ir 2026-11-17-CX-62-dispatch-guard.handoff.sql
do $$ declare d public.business_documents%rowtype; begin
  select * into strict d from business_documents where source_id='00000000-0000-0000-0000-0000000000d3';
  perform set_config('maju.dispatch_confirm_order','00000000-0000-0000-0000-0000000000d4',true);
  begin
    perform confirm_business_document(d.company_id,d.id,null,'합성 담당');
    raise exception 'manual confirmation bypassed dispatch';
  exception when raise_exception then assert sqlerrm = 'order_sale_document_requires_dispatch'; end;
  perform set_config('maju.dispatch_confirm_order',d.source_id::text,true);
  perform confirm_business_document(d.company_id,d.id,null,'합성 출고');
  assert (select status='confirmed' from business_documents where id=d.id);
end $$;
\ir 2026-11-17-CX-62-dispatch-guard.handoff.down.sql
rollback;

\set ON_ERROR_STOP off
\ir 2026-11-17-CX-62-order-receipt.down.sql
\set ON_ERROR_STOP on
do $$ begin
  assert to_regprocedure('public.receive_store_order_with_sale_document(uuid,uuid,integer,uuid,text)') is not null;
end $$;
-- Verify cancellation removes the linked draft and lines without financial effects.
create temporary table cx62_cancelled_document as select id from business_documents where source_id=:'edited_order';
update store_orders set status='cancelled', revision=revision+1 where id=:'edited_order' and status='received';
do $$ begin
  assert not exists(select 1 from business_documents where id=(select id from cx62_cancelled_document));
  assert not exists(select 1 from business_document_lines where document_id=(select id from cx62_cancelled_document));
  assert (select count(*) from partner_ledger_entries) = (select ledger from cx62_before);
  assert (select count(*) from inventory_movements) = (select inventory from cx62_before);
end $$;
\ir 2026-11-17-CX-62-order-receipt.down.sql
do $$ begin
  assert to_regprocedure('public.receive_store_order_with_sale_document(uuid,uuid,integer,uuid,text)') is null;
  assert (select status='cancelled' from store_orders where id='00000000-0000-0000-0000-0000000000d3');
end $$;
select 'CX-62 atomic order receipt PG17 checks passed' as result;

\set ON_ERROR_STOP on
do $$ begin
  assert current_database()='cx41_order_return_test';
  assert current_setting('server_version_num')::int/10000=17;
end $$;
\ir 2026-11-18-CX-66-order-dispatch.sql
\ir 2026-11-18-CX-66-partial-dispatch-final-cancel.sql
begin;

\set company '00000000-0000-0000-0000-0000000000c1'
\set customer '00000000-0000-0000-0000-0000000000a1'
\set product '00000000-0000-0000-0000-0000000000a3'
\set partial_order '20000000-0000-4000-8000-000000000001'
\set cancel_order '20000000-0000-4000-8000-000000000002'
\set zero_order '20000000-0000-4000-8000-000000000003'
\set batch_a '20000000-0000-4000-8000-000000000004'
\set batch_b '20000000-0000-4000-8000-000000000005'
\set ambiguous_order '20000000-0000-4000-8000-000000000006'
\set line_a '30000000-0000-4000-8000-000000000001'
\set line_b '30000000-0000-4000-8000-000000000002'

insert into store_orders(id,company_id,customer_id,delivery_date,status,delivery_fee,known_total)
values (:'partial_order',:'company',:'customer','2026-11-18','submitted',110,5610),
       (:'cancel_order',:'company',:'customer','2026-11-18','submitted',0,1210),
       (:'zero_order',:'company',:'customer','2026-11-18','submitted',0,0),
       (:'batch_a',:'company',:'customer','2026-11-18','submitted',0,1210),
       (:'batch_b',:'company',:'customer','2026-11-18','submitted',0,1210),
       (:'ambiguous_order',:'company',:'customer','2026-11-18','submitted',0,2200);
insert into store_order_lines(id,company_id,order_id,product_id,product_name,sales_unit,quantity,unit_price,tax_type,is_market_price)
values (:'line_b',:'company',:'partial_order',:'product','동일 상품','개',2,1100,'taxable',false),
       (:'line_a',:'company',:'partial_order',:'product','동일 상품','개',3,1100,'taxable',false),
       ('30000000-0000-4000-8000-000000000003',:'company',:'cancel_order',:'product','전량 취소','개',1,1100,'taxable',false),
       ('30000000-0000-4000-8000-000000000004',:'company',:'zero_order',:'product','0원 거부','개',1,0,'exempt',false),
       ('30000000-0000-4000-8000-000000000005',:'company',:'batch_a',:'product','묶음 정상','개',1,1100,'taxable',false),
       ('30000000-0000-4000-8000-000000000006',:'company',:'batch_b',:'product','묶음 실패','개',1,1100,'taxable',false),
       ('30000000-0000-4000-8000-000000000007',:'company',:'ambiguous_order',:'product','완전 동일','개',1,1000,'exempt',false),
       ('30000000-0000-4000-8000-000000000008',:'company',:'ambiguous_order',:'product','완전 동일','개',1,1000,'exempt',false);
select receive_store_order_with_sale_document(:'company',:'partial_order',1,null,'합성 담당');
select receive_store_order_with_sale_document(:'company',:'cancel_order',1,null,'합성 담당');
select receive_store_order_with_sale_document(:'company',:'zero_order',1,null,'합성 담당');
select receive_store_order_with_sale_document(:'company',:'batch_a',1,null,'합성 담당');
select receive_store_order_with_sale_document(:'company',:'batch_b',1,null,'합성 담당');
select receive_store_order_with_sale_document(:'company',:'ambiguous_order',1,null,'합성 담당');

\set partial_payload '[{"orderId":"20000000-0000-4000-8000-000000000001","lines":[{"orderLineId":"30000000-0000-4000-8000-000000000001","shippedQuantity":1.505},{"orderLineId":"30000000-0000-4000-8000-000000000002","shippedQuantity":0}]}]'
select dispatch_store_orders_partial_final_cancel(:'company',:'partial_payload'::jsonb,
  '40000000-0000-4000-8000-000000000001',null,'부분 출고');
select dispatch_store_orders_partial_final_cancel(:'company',:'partial_payload'::jsonb,
  '40000000-0000-4000-8000-000000000001',null,'재시도');
do $$ declare d business_documents%rowtype; begin
  select * into strict d from business_documents where source_id='20000000-0000-4000-8000-000000000001';
  assert d.status='confirmed' and d.taxable_supply_amount=1605 and d.exempt_supply_amount=0
    and d.tax_amount=161 and d.total_amount=1766;
  assert (select known_total=5610 and status='in_delivery' and sale_document_id=d.id
    from store_orders where id='20000000-0000-4000-8000-000000000001');
  assert (select shipped_quantity=1.505 and cancelled_quantity=1.495 from store_order_lines where id='30000000-0000-4000-8000-000000000001');
  assert (select shipped_quantity=0 and cancelled_quantity=2 from store_order_lines where id='30000000-0000-4000-8000-000000000002');
  assert (select count(*) from business_document_lines where document_id=d.id)=2;
  assert (select count(*) from business_document_lines where document_id=d.id and source_order_line_id is not null)=1;
  assert (select count(*) from partner_ledger_entries where source_document_id=d.id)=1;
  assert (select sum(amount)=1766 from partner_ledger_entries where source_document_id=d.id);
  assert (select count(*) from inventory_movements where source_document_id=d.id)=1;
  begin
    perform dispatch_store_orders_partial_final_cancel('00000000-0000-0000-0000-0000000000c1','[{"orderId":"20000000-0000-4000-8000-000000000001","lines":[]}]','40000000-0000-4000-8000-000000000009',null,'추가 출고');
    raise exception 'same order additional dispatch accepted';
  exception when raise_exception then assert sqlerrm='order_dispatch_state_conflict'; end;
  begin
    perform dispatch_store_orders_partial_final_cancel('00000000-0000-0000-0000-0000000000c1','[{"orderId":"20000000-0000-4000-8000-000000000001","lines":[]}]','40000000-0000-4000-8000-000000000001',null,'key conflict');
    raise exception 'same key different payload accepted';
  exception when raise_exception then assert sqlerrm='order_dispatch_idempotency_conflict'; end;
end $$;

do $$ declare ledger_before bigint; inventory_before bigint; begin
  select count(*) into ledger_before from partner_ledger_entries; select count(*) into inventory_before from inventory_movements;
  perform dispatch_store_orders_partial_final_cancel('00000000-0000-0000-0000-0000000000c1','[{"orderId":"20000000-0000-4000-8000-000000000002","lines":[]}]','40000000-0000-4000-8000-000000000002',null,'전량 취소');
  assert (select status='cancelled' from store_orders where id='20000000-0000-4000-8000-000000000002');
  assert not exists(select 1 from business_documents where source_id='20000000-0000-4000-8000-000000000002');
  assert (select count(*) from partner_ledger_entries)=ledger_before;
  assert (select count(*) from inventory_movements)=inventory_before;
end $$;

do $$ begin
  begin
    perform dispatch_store_orders_partial_final_cancel('00000000-0000-0000-0000-0000000000c1','[{"orderId":"20000000-0000-4000-8000-000000000003","lines":[{"orderLineId":"30000000-0000-4000-8000-000000000004","shippedQuantity":1}]}]','40000000-0000-4000-8000-000000000003',null,'0원');
    raise exception 'zero amount accepted';
  exception when raise_exception then assert sqlerrm='partial_dispatch_zero_amount'; end;
  assert (select status='received' from store_orders where id='20000000-0000-4000-8000-000000000003');
end $$;

do $$ declare ledger_before bigint; inventory_before bigint; begin
  select count(*) into ledger_before from partner_ledger_entries; select count(*) into inventory_before from inventory_movements;
  begin
    perform dispatch_store_orders_partial_final_cancel('00000000-0000-0000-0000-0000000000c1','[{"orderId":"20000000-0000-4000-8000-000000000004","lines":[{"orderLineId":"30000000-0000-4000-8000-000000000005","shippedQuantity":1}]},{"orderId":"20000000-0000-4000-8000-000000000005","lines":[{"orderLineId":"30000000-0000-4000-8000-000000000006","shippedQuantity":2}]}]','40000000-0000-4000-8000-000000000004',null,'묶음');
    raise exception 'invalid batch accepted';
  exception when raise_exception then assert sqlerrm='partial_dispatch_quantity_invalid'; end;
  assert (select count(*) from store_orders where id in ('20000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000005') and status='received')=2;
  assert (select count(*) from partner_ledger_entries)=ledger_before;
  assert (select count(*) from inventory_movements)=inventory_before;
end $$;

do $$ begin
  begin
    perform dispatch_store_orders_partial_final_cancel('00000000-0000-0000-0000-0000000000c2','[{"orderId":"20000000-0000-4000-8000-000000000004","lines":[]}]','40000000-0000-4000-8000-000000000005',null,'타사');
    raise exception 'cross-company dispatch accepted';
  exception when raise_exception then assert sqlerrm='order_dispatch_order_not_found'; end;
end $$;

do $$ begin
  begin
    perform dispatch_store_orders_partial_final_cancel('00000000-0000-0000-0000-0000000000c1','[{"orderId":"20000000-0000-4000-8000-000000000006","lines":[{"orderLineId":"30000000-0000-4000-8000-000000000007","shippedQuantity":1}]}]','40000000-0000-4000-8000-000000000006',null,'중복 줄');
    raise exception 'ambiguous identical lines accepted';
  exception when raise_exception then assert sqlerrm='partial_dispatch_snapshot_ambiguous'; end;
  assert (select status='received' from store_orders where id='20000000-0000-4000-8000-000000000006');
end $$;

\set ON_ERROR_STOP off
\ir 2026-11-18-CX-66-partial-dispatch-final-cancel.down.sql
\set ON_ERROR_STOP on
do $$ begin
  assert to_regprocedure('public.dispatch_store_orders_partial_final_cancel(uuid,jsonb,uuid,uuid,text)') is not null;
  assert not exists(select 1 from public.order_dispatch_requests where request_payload is not null);
end $$;
\ir 2026-11-18-CX-66-partial-dispatch-final-cancel.down.sql
\ir 2026-11-18-CX-66-order-dispatch.down.sql
select 'CX-66 partial dispatch final-cancel PG17 checks passed' result;

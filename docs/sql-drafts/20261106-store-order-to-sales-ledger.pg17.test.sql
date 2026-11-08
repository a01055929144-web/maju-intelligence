\set ON_ERROR_STOP on

do $$
begin
  if current_database() <> 'store_order_sales_ledger_test'
    or current_setting('server_version_num')::integer not between 170000 and 179999
    or inet_server_addr() is null
    or not (inet_server_addr() <<= inet '127.0.0.0/8' or inet_server_addr() = inet '::1') then
    raise exception 'Requires loopback PostgreSQL 17 database store_order_sales_ledger_test';
  end if;
end $$;

drop schema if exists public cascade;
create schema public;
grant usage on schema public to public;
create extension if not exists pgcrypto;

-- Real migrations provide ERP triggers, RPCs, and GENERATED ALWAYS amounts.
\ir ../../tests/sql/pricing-p1-fixture.sql
\ir 20261030-pricing-p0.sql
\ir 20261030-pricing-p1.sql
\ir ../../tests/sql/store-order-sales-ledger-fixture.pg17.sql
\ir ../../supabase/migrations/20261016190000_erp_phase_1_documents_ledger.sql
\ir ../../supabase/migrations/20261016200000_erp_phase_1b_v2.sql
\ir ../../supabase/migrations/20261102114602_pricing_p2_store_ordering.sql
\ir 20261106-store-order-to-sales-ledger.sql

insert into public.companies(id) values
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002');
insert into public.normalized_customers(id,company_id,customer_name,address,phone) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','alpha','Seoul','01000000000');
insert into public.product_catalog(
  id,company_id,purchase_product_name,purchase_price,sales_product_name,sales_unit,tax_type
) values (
  '20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',
  'item',500,'item','BOX','taxable'
);
insert into public.pricing_documents(id,company_id,owner_key,kind,revision,content) values (
  '30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',repeat('a',64),'sheet',1,
  '{"showPrice":true,"validUntil":"2099-01-01","lines":[{"productId":"20000000-0000-4000-8000-000000000001","promotionId":null,"displayName":"item","spec":"","unit":"BOX","price":1000,"taxType":"taxable","visible":true}]}'
);
insert into public.pricing_document_versions(id,company_id,document_id,version,revision,content)
select '31000000-0000-4000-8000-000000000001',company_id,id,1,1,content
from public.pricing_documents where id='30000000-0000-4000-8000-000000000001';
insert into public.store_order_settings(company_id,cutoff_days_before,cutoff_time)
values('00000000-0000-4000-8000-000000000001',0,'23:59');
insert into public.store_order_customer_rules(company_id,customer_id,delivery_weekdays)
values('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',array[0,1,2,3,4,5,6]::smallint[]);

insert into public.storefront_links(
 id,company_id,customer_id,document_version_id,token_nonce,token_hash,expires_at
) values
 ('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001',repeat('1',32),repeat('1',64),'2099-01-01');

insert into public.store_orders(
 id,company_id,customer_id,link_id,document_version_id,delivery_date,status,idempotency_key,
 taxable_supply,exempt_supply,tax_amount,delivery_fee,known_total,has_market_price
) values
 ('50000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','2099-01-01','received','60000000-0000-4000-8000-000000000001',1000,0,100,0,1100,false),
 ('50000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','2099-01-01','received','60000000-0000-4000-8000-000000000002',1000,0,100,100,1200,false),
 ('50000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','2099-01-01','cancelled','60000000-0000-4000-8000-000000000003',1000,0,100,0,1100,false),
 ('50000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','2099-01-01','received','60000000-0000-4000-8000-000000000004',909,0,91,0,1000,false),
 ('50000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','2099-01-01','submitted','60000000-0000-4000-8000-000000000005',1000,0,100,0,1100,false);
insert into public.store_order_lines(
 id,company_id,order_id,product_id,product_name,sales_unit,quantity,unit_price,tax_type,price_includes_tax,is_market_price
) values
 ('70000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','item','BOX',1,1000,'taxable',false,false),
 ('70000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','item','BOX',1,1000,'taxable',false,false),
 ('70000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','item','BOX',1,1000,'taxable',false,false),
 ('70000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000001','item','BOX',1,1000,'taxable',true,false),
 ('70000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000001','item','BOX',1,1000,'taxable',false,false);

do $$ declare a jsonb; b jsonb; v_document uuid; begin
 a:=public.create_sales_document_from_store_order('00000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',gen_random_uuid(),'tester');
 b:=public.create_sales_document_from_store_order('00000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',gen_random_uuid(),'tester');
 v_document:=(a->>'salesDocumentId')::uuid;
 if a->>'alreadyCreated'<>'false' or b->>'alreadyCreated'<>'true' or a->>'salesDocumentId'<>b->>'salesDocumentId' then raise exception 'idempotency failed'; end if;
 if (select total_amount from public.business_documents where id=v_document)<>1100 then raise exception 'document total failed'; end if;
 if (select total_amount from public.business_document_lines where document_id=v_document)<>1100 then raise exception 'generated line total failed'; end if;
 if exists(select 1 from public.partner_ledger_entries where source_document_id=v_document) then raise exception 'draft posted ledger'; end if;
 -- Once the draft exists, the order is non-editable; the real P2 RPC must reject a revision.
 begin
  perform public.place_store_order(repeat('1',64),'2099-01-01','[{"productId":"20000000-0000-4000-8000-000000000001","promotionId":null,"quantity":2}]','80000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',1,'edit');
  raise exception 'order changed after document draft';
 exception when others then if sqlerrm='order changed after document draft' then raise; end if; end;
 perform public.confirm_business_document('00000000-0000-4000-8000-000000000001',v_document,gen_random_uuid(),'tester');
 b:=public.create_sales_document_from_store_order('00000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',gen_random_uuid(),'tester');
 if b->>'status'<>'confirmed' or b->>'ledgerPosted'<>'true' then raise exception 'confirmed ledger result failed'; end if;
 if (select count(*) from public.partner_ledger_entries where source_document_id=v_document)<>1 then raise exception 'ledger count failed'; end if;
 perform public.cancel_business_document('00000000-0000-4000-8000-000000000001',v_document,gen_random_uuid(),'tester','cancel regression');
 b:=public.create_sales_document_from_store_order('00000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',gen_random_uuid(),'tester');
 if b->>'status'<>'cancelled' or b->>'alreadyCreated'<>'true' or b->>'ledgerPosted'<>'true' then raise exception 'cancelled retry result failed'; end if;
 if (select count(*) from public.partner_ledger_entries where source_document_id=v_document)<>2
   or (select sum(amount) from public.partner_ledger_entries where source_document_id=v_document)<>0
   then raise exception 'cancel reversal failed'; end if;
end $$;

do $$ begin
 begin perform public.create_sales_document_from_store_order('00000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001',gen_random_uuid(),'tester'); raise exception 'cross-company accepted'; exception when others then if sqlerrm='cross-company accepted' then raise; end if; end;
 begin perform public.create_sales_document_from_store_order('00000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',gen_random_uuid(),'tester'); raise exception 'delivery fee accepted'; exception when others then if sqlerrm='delivery fee accepted' then raise; end if; end;
 begin perform public.create_sales_document_from_store_order('00000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003',gen_random_uuid(),'tester'); raise exception 'cancelled accepted'; exception when others then if sqlerrm='cancelled accepted' then raise; end if; end;
 begin perform public.create_sales_document_from_store_order('00000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000004',gen_random_uuid(),'tester'); raise exception 'tax-included accepted'; exception when others then if sqlerrm='tax-included accepted' then raise; end if; end;
 begin perform public.create_sales_document_from_store_order('00000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000005',gen_random_uuid(),'tester'); raise exception 'editable submitted order accepted'; exception when others then if sqlerrm='editable submitted order accepted' then raise; end if; end;
end $$;

do $$ begin
 if has_function_privilege('anon','public.create_sales_document_from_store_order(uuid,uuid,uuid,text)','execute') then raise exception 'anon can execute'; end if;
 if has_function_privilege('authenticated','public.create_sales_document_from_store_order(uuid,uuid,uuid,text)','execute') then raise exception 'authenticated can execute'; end if;
 if not has_function_privilege('service_role','public.create_sales_document_from_store_order(uuid,uuid,uuid,text)','execute') then raise exception 'service role cannot execute'; end if;
end $$;

\ir 20261106-store-order-to-sales-ledger.down.sql
do $$ begin
 if to_regprocedure('public.create_sales_document_from_store_order(uuid,uuid,uuid,text)') is not null then raise exception 'down left function'; end if;
 if (select count(*) from public.business_documents where source_type='order')<>1 then raise exception 'down removed document'; end if;
 if (select count(*) from public.partner_ledger_entries)<>2 then raise exception 'down removed ledger'; end if;
end $$;

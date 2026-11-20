\set ON_ERROR_STOP on
-- Runs immediately after store-order-core-cx75.pg17.test.sql in its disposable PG17 database.
do $$ begin
  if current_database() !~ '^store_member_order_test' or current_setting('server_version_num')::integer/10000<>17
    then raise exception 'disposable_pg17_required'; end if;
end $$;

-- CC-29b's production dependency is not present in the older member-order fixture.
alter table public.product_catalog add column if not exists default_sales_price numeric(14,2);

delete from public.customer_price_agreements
 where company_id='00000000-0000-4000-8000-000000000001'
   and customer_id='20000000-0000-4000-8000-000000000001'
   and product_catalog_id='60000000-0000-4000-8000-000000000001';
update public.product_catalog set tax_type='taxable'
 where company_id='00000000-0000-4000-8000-000000000001' and id='60000000-0000-4000-8000-000000000001';
insert into public.product_catalog(id,company_id,purchase_product_name,purchase_price,sales_unit,tax_type)
values('60000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','면세 계란',50,'BOX','exempt');
insert into public.customer_price_agreements(id,company_id,customer_id,product_catalog_id,sales_unit,unit_price,tax_type,price_includes_tax,effective_from,status)
values('c0760000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','BOX',9999,'taxable',false,current_date-1,'active');
insert into public.pricing_promotions(id,company_id,product_id,name,display_name,starts_on,ends_on,purchase_cost,margin_bp,price,stock,per_store_limit,tax_type,allow_sheet,badge,revision)
values
 ('c0760000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','VAT fixed','VAT fixed',current_date-1,'2099-12-31',800,0,1100,null,null,'taxable',true,'행사',1),
 ('c0760000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002','면세 계란','면세 계란',current_date-1,'2099-12-31',50,0,60,null,null,'exempt',true,'행사',1);

insert into public.pricing_document_versions(id,company_id,document_id,version,revision,content)
select 'c0760000-0000-4000-8000-000000000003',company_id,document_id,201,201,
 jsonb_set(content,'{lines}',jsonb_build_array(
   (content->'lines'->0)||jsonb_build_object('price',1100,'taxType','taxable','promotionId','c0760000-0000-4000-8000-000000000002','priceIncludesTax',true),
   ((content->'lines'->0)-'promotionId')||jsonb_build_object('price',1000,'taxType','taxable','priceIncludesTax',false)))
from public.pricing_document_versions where id='80000000-0000-4000-8000-000000000001';
insert into public.pricing_document_versions(id,company_id,document_id,version,revision,content)
select 'c0760000-0000-4000-8000-000000000004',company_id,document_id,202,202,
 jsonb_set(jsonb_set(content,'{lines,0,price}',to_jsonb(1100)),'{lines,0,taxType}',to_jsonb('taxable'::text))
from public.pricing_document_versions where id='80000000-0000-4000-8000-000000000001';
insert into public.pricing_document_versions(id,company_id,document_id,version,revision,content)
select 'c0760000-0000-4000-8000-000000000011',company_id,document_id,203,203,
 jsonb_set(content,'{lines}',jsonb_build_array((content->'lines'->0)||jsonb_build_object(
   'productId','60000000-0000-4000-8000-000000000002','displayName','면세 계란','price',60,'taxType','exempt','promotionId','c0760000-0000-4000-8000-000000000003','priceIncludesTax',true)))
from public.pricing_document_versions where id='80000000-0000-4000-8000-000000000001';
insert into public.pricing_document_versions(id,company_id,document_id,version,revision,content)
select 'c0760000-0000-4000-8000-000000000014',company_id,document_id,204,204,
 jsonb_set(content,'{lines}',jsonb_build_array((content->'lines'->0)||jsonb_build_object(
   'displayName','과세 임박','price',60,'taxType','taxable','promotionId','c0760000-0000-4000-8000-000000000002','priceIncludesTax',true)))
from public.pricing_document_versions where id='80000000-0000-4000-8000-000000000001';
insert into public.storefront_links(id,company_id,customer_id,document_version_id,token_nonce,token_hash,expires_at)
values
 ('c0760000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','c0760000-0000-4000-8000-000000000003',repeat('b',31)||'1',repeat('b',63)||'1','2099-12-31'),
 ('c0760000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','c0760000-0000-4000-8000-000000000004',repeat('b',31)||'2',repeat('b',63)||'2','2099-12-31'),
 ('c0760000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','c0760000-0000-4000-8000-000000000011',repeat('b',31)||'3',repeat('b',63)||'3','2099-12-31'),
 ('c0760000-0000-4000-8000-000000000015','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','c0760000-0000-4000-8000-000000000014',repeat('b',31)||'4',repeat('b',63)||'4','2099-12-31');
update public.store_order_settings set minimum_policy='fee',minimum_amount=999999,delivery_fee=7,self_order_enabled=true
 where company_id='00000000-0000-4000-8000-000000000001';

\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/2026-11-19-store-order-line-vat-consistency.sql
\set ON_ERROR_STOP on
do $$ begin
  if exists(select 1 from pg_proc where oid='public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)'::regprocedure and strpos(pg_get_functiondef(oid),'-- cx-vat-row-snapshot')>0)
    then raise exception 'producer_applied_without_consumers'; end if;
end $$;
\ir ../../docs/sql-drafts/2026-11-16-CX-38-order-sale-documents.sql
\ir ../../docs/sql-drafts/2026-11-19-CX-38b-order-document-money-snapshot.sql
create function public.dispatch_store_orders_partial_final_cancel(uuid,jsonb,uuid,uuid,text)
 returns jsonb language sql as 'select ''{}''::jsonb';
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/2026-11-19-store-order-line-vat-consistency.sql
\set ON_ERROR_STOP on
do $$ begin
  if exists(select 1 from pg_proc where oid='public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)'::regprocedure and strpos(pg_get_functiondef(oid),'-- cx-vat-row-snapshot')>0)
    then raise exception 'producer_accepted_legacy_cx66_signature'; end if;
end $$;
drop function public.dispatch_store_orders_partial_final_cancel(uuid,jsonb,uuid,uuid,text);
\ir ../../docs/sql-drafts/2026-11-17-CX-62-order-receipt.sql
\ir ../../docs/sql-drafts/2026-11-18-CX-66-order-dispatch.sql
\ir ../../docs/sql-drafts/2026-11-18-CX-66-partial-dispatch-final-cancel.sql
\ir ../../docs/sql-drafts/20261112-CC-29b-promotion-audience-orders.sql
\ir ../../docs/sql-drafts/2026-11-19-store-order-line-vat-consistency.sql

-- A taxable promotion that already existed before up is enough to block down,
-- even before this patch has accepted a single order. Temporarily remove the
-- independent live-link blocker so this specifically proves the promotion gate.
update public.storefront_links set revoked_at=clock_timestamp()
 where id in ('c0760000-0000-4000-8000-000000000005','c0760000-0000-4000-8000-000000000006','c0760000-0000-4000-8000-000000000012','c0760000-0000-4000-8000-000000000015');
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/2026-11-19-store-order-line-vat-consistency.down.sql
\set ON_ERROR_STOP on
do $$ begin
  if not exists(select 1 from pg_proc where oid='public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)'::regprocedure and strpos(pg_get_functiondef(oid),'-- cx-vat-row-snapshot')>0)
    then raise exception 'preexisting_promotion_down_guard_did_not_preserve_patch'; end if;
  if exists(select 1 from public.store_orders where id::text like 'c076%')
    then raise exception 'preexisting_promotion_guard_was_not_zero_new_orders'; end if;
end $$;
update public.storefront_links set revoked_at=null
 where id in ('c0760000-0000-4000-8000-000000000005','c0760000-0000-4000-8000-000000000006','c0760000-0000-4000-8000-000000000012','c0760000-0000-4000-8000-000000000015');

do $$
declare fixed jsonb; replay jsonb; legacy jsonb; account_result jsonb; fallback jsonb; near_result jsonb; exempt_result jsonb; fixed_id uuid;
begin
  fixed:=public.place_store_order(repeat('b',63)||'1','2099-01-05','[{"productId":"60000000-0000-4000-8000-000000000001","promotionId":"c0760000-0000-4000-8000-000000000002","quantity":1.5}]','c0760000-0000-4000-8000-000000000007',null,null,'vat fixed');
  replay:=public.place_store_order(repeat('b',63)||'1','2099-01-05','[{"productId":"60000000-0000-4000-8000-000000000001","promotionId":"c0760000-0000-4000-8000-000000000002","quantity":1.5}]','c0760000-0000-4000-8000-000000000007',null,null,'vat fixed');
  fixed_id:=(fixed->>'id')::uuid;
  if fixed is distinct from replay or (select count(*) from public.store_orders where id=fixed_id)<>1
    or not exists(select 1 from public.store_order_lines where order_id=fixed_id and unit_price=1100 and price_includes_tax and supply_amount=1500 and tax_amount=150 and total_amount=1650)
    or not exists(select 1 from public.store_orders where id=fixed_id and taxable_supply=1500 and tax_amount=150 and delivery_fee=7 and known_total=1657)
    then raise exception 'fixed_final_price_or_replay_reconciliation_failed: %',fixed; end if;

  legacy:=public.place_store_order(repeat('b',63)||'2','2099-01-05','[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1.5}]','c0760000-0000-4000-8000-000000000008',null,null,'legacy row');
  if not exists(select 1 from public.store_order_lines where order_id=(legacy->>'id')::uuid and unit_price=9999 and not price_includes_tax and total_amount=16499)
    then raise exception 'legacy_or_promise_semantics_changed: %',legacy; end if;

  account_result:=public.place_store_account_order('00000000-0000-4000-8000-000000000001','2099-01-05',
    '[{"productId":"60000000-0000-4000-8000-000000000001","promotionId":"c0760000-0000-4000-8000-000000000002","quantity":1.5}]',
    'c0760000-0000-4000-8000-000000000009',null,null,'account fixed','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001');
  if not exists(select 1 from public.store_order_lines where order_id=(account_result->>'id')::uuid and unit_price=1100 and price_includes_tax and supply_amount=1500 and tax_amount=150 and total_amount=1650)
    or not exists(select 1 from public.store_orders where id=(account_result->>'id')::uuid and known_total=1657)
    then raise exception 'account_promotion_final_price_failed: %',account_result; end if;

  delete from public.customer_price_agreements where id='c0760000-0000-4000-8000-000000000001';
  update public.pricing_promotions set audience='only' where id='c0760000-0000-4000-8000-000000000002';
  insert into public.pricing_promotion_targets(company_id,promotion_id,customer_id)
  values('00000000-0000-4000-8000-000000000001','c0760000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002');
  fallback:=public.place_store_order(repeat('b',63)||'1','2099-01-05','[{"productId":"60000000-0000-4000-8000-000000000001","promotionId":"c0760000-0000-4000-8000-000000000002","quantity":1.5}]','c0760000-0000-4000-8000-000000000010',null,null,'vat fallback');
  if (fallback->>'promotionNotApplied')::integer<>1
    or not exists(select 1 from public.store_order_lines where order_id=(fallback->>'id')::uuid and promotion_id is null and unit_price=1000 and not price_includes_tax and supply_amount=1500 and tax_amount=150 and total_amount=1650)
    then raise exception 'non_target_fallback_inherited_promotion_vat: %',fallback; end if;

  delete from public.pricing_promotion_targets where promotion_id='c0760000-0000-4000-8000-000000000002';
  update public.pricing_promotions set audience='all',price=60,tax_type='taxable' where id='c0760000-0000-4000-8000-000000000002';
  near_result:=public.place_store_order(repeat('b',63)||'4','2099-01-05','[{"productId":"60000000-0000-4000-8000-000000000001","promotionId":"c0760000-0000-4000-8000-000000000002","quantity":1.5}]','c0760000-0000-4000-8000-000000000016',null,null,'near expiry');
  if not exists(select 1 from public.store_order_lines where order_id=(near_result->>'id')::uuid and product_name='과세 임박' and unit_price=60 and price_includes_tax and supply_amount=82 and tax_amount=8 and total_amount=90)
    or not exists(select 1 from public.store_orders where id=(near_result->>'id')::uuid and taxable_supply=82 and exempt_supply=0 and tax_amount=8 and delivery_fee=7 and known_total=97)
    then raise exception 'near_expiry_fixed_price_changed: %',near_result; end if;

  exempt_result:=public.place_store_order(repeat('b',63)||'3','2099-01-05','[{"productId":"60000000-0000-4000-8000-000000000002","promotionId":"c0760000-0000-4000-8000-000000000003","quantity":1.5}]','c0760000-0000-4000-8000-000000000013',null,null,'exempt egg');
  if not exists(select 1 from public.store_order_lines where order_id=(exempt_result->>'id')::uuid and product_name='면세 계란' and unit_price=60 and price_includes_tax and supply_amount=90 and tax_amount=0 and total_amount=90)
    or not exists(select 1 from public.store_orders where id=(exempt_result->>'id')::uuid and taxable_supply=0 and exempt_supply=90 and tax_amount=0 and delivery_fee=7 and known_total=97)
    then raise exception 'exempt_promotion_changed_amount: %',exempt_result; end if;
end $$;

-- The conversion boundary must consume the stored supply/tax/total snapshot. Re-dividing
-- total_amount later is deliberately forbidden by the approval checklist below.
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/2026-11-19-store-order-line-vat-consistency.down.sql
\set ON_ERROR_STOP on
do $$ begin
  if not exists(select 1 from pg_proc where oid='public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)'::regprocedure and strpos(pg_get_functiondef(oid),'-- cx-vat-row-snapshot')>0)
    then raise exception 'down_guard_did_not_preserve_patch'; end if;
end $$;
update public.storefront_links set revoked_at=clock_timestamp() where id in ('c0760000-0000-4000-8000-000000000005','c0760000-0000-4000-8000-000000000006','c0760000-0000-4000-8000-000000000012','c0760000-0000-4000-8000-000000000015');
update public.pricing_promotions set audience='all',starts_on=current_date-2,ends_on=current_date-1 where tax_type='taxable' and starts_on<=current_date and ends_on>=current_date;
delete from public.pricing_promotion_targets where promotion_id='c0760000-0000-4000-8000-000000000002';
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/2026-11-19-store-order-line-vat-consistency.down.sql
\set ON_ERROR_STOP on
do $$ begin
  if not exists(select 1 from pg_proc where oid='public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)'::regprocedure and strpos(pg_get_functiondef(oid),'-- cx-vat-row-snapshot')>0)
    then raise exception 'pending_snapshot_order_guard_did_not_preserve_patch'; end if;
end $$;
update public.store_orders o set status='cancelled',revision=revision+1,updated_at=clock_timestamp()
 where status='submitted' and request_memo<>'vat fixed' and exists(
   select 1 from public.store_order_lines l where l.company_id=o.company_id and l.order_id=o.id and l.price_includes_tax
 );
select public.receive_store_order_with_sale_document(company_id,id,revision,null,'VAT guard test')
 from public.store_orders where request_memo='vat fixed';
create temp table saved_vat_document_lines as
 select l.* from public.business_document_lines l join public.business_documents d on d.company_id=l.company_id and d.id=l.document_id
 where d.source_type='order' and d.source_id=(select id from public.store_orders where request_memo='vat fixed');
delete from public.business_document_lines where (company_id,document_id) in
 (select company_id,id from public.business_documents where source_type='order' and source_id=(select id from public.store_orders where request_memo='vat fixed'));
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/2026-11-19-store-order-line-vat-consistency.down.sql
\set ON_ERROR_STOP on
do $$ begin if not exists(select 1 from pg_proc where oid='public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)'::regprocedure and strpos(pg_get_functiondef(oid),'-- cx-vat-row-snapshot')>0) then raise exception 'header_only_document_bypassed_down_guard'; end if; end $$;
insert into public.business_document_lines(id,company_id,document_id,sort_order,product_catalog_id,supplier_product_id,product_code_snapshot,product_name_snapshot,specification_snapshot,unit_snapshot,tax_type_snapshot,quantity,unit_price,price_includes_tax_snapshot,memo,created_at,updated_at,source_order_line_id)
 select id,company_id,document_id,sort_order,product_catalog_id,supplier_product_id,product_code_snapshot,product_name_snapshot,specification_snapshot,unit_snapshot,tax_type_snapshot,quantity,unit_price,false,memo,created_at,updated_at,source_order_line_id from saved_vat_document_lines;
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/2026-11-19-store-order-line-vat-consistency.down.sql
\set ON_ERROR_STOP on
do $$ begin if not exists(select 1 from pg_proc where oid='public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)'::regprocedure and strpos(pg_get_functiondef(oid),'-- cx-vat-row-snapshot')>0) then raise exception 'snapshot_false_document_bypassed_down_guard'; end if; end $$;
update public.business_document_lines current set price_includes_tax_snapshot=saved.price_includes_tax_snapshot
 from saved_vat_document_lines saved where current.id=saved.id;
update public.store_order_lines l set sales_unit='EA'
 from public.store_orders o where o.company_id=l.company_id and o.id=l.order_id and o.request_memo='vat fixed' and l.price_includes_tax;
update public.business_document_lines l set unit_snapshot='EA'
 from public.business_documents d where d.company_id=l.company_id and d.id=l.document_id and d.source_type='order' and d.source_id=(select id from public.store_orders where request_memo='vat fixed') and l.price_includes_tax_snapshot;
do $$ declare columns text; expressions text; begin
  select string_agg(quote_ident(attname),',' order by attnum),
         string_agg(case when attname='id' then 'gen_random_uuid()' when attname='sales_unit' then quote_literal('') else format('l.%I',attname) end,',' order by attnum)
    into columns,expressions from pg_attribute
    where attrelid='public.store_order_lines'::regclass and attnum>0 and not attisdropped and attgenerated='';
  execute format('insert into public.store_order_lines(%s) select %s from public.store_order_lines l join public.store_orders o on o.company_id=l.company_id and o.id=l.order_id where o.request_memo=%L and l.price_includes_tax limit 1',columns,expressions,'vat fixed');
end $$;
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/2026-11-19-store-order-line-vat-consistency.down.sql
\set ON_ERROR_STOP on
do $$ begin if not exists(select 1 from pg_proc where oid='public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)'::regprocedure and strpos(pg_get_functiondef(oid),'-- cx-vat-row-snapshot')>0) then raise exception 'normalized_duplicate_order_lines_bypassed_down_guard'; end if; end $$;
delete from public.store_order_lines where id=(select l.id from public.store_order_lines l join public.store_orders o on o.company_id=l.company_id and o.id=l.order_id where o.request_memo='vat fixed' and l.price_includes_tax order by l.id desc limit 1);
\ir ../../docs/sql-drafts/2026-11-19-store-order-line-vat-consistency.down.sql
\ir ../../docs/sql-drafts/2026-11-19-store-order-line-vat-consistency.sql
-- CX-66 normally confirms only while dispatching (and moves the order out of
-- received). Disable only that early-confirmation gate to exercise the down
-- predicate's explicit received + confirmed branch in this disposable fixture.
alter table public.business_documents disable trigger order_sale_document_requires_dispatch;
select public.confirm_business_document(company_id,id,null,'VAT guard test')
 from public.business_documents where source_type='order' and source_id=(select id from public.store_orders where request_memo='vat fixed');
alter table public.business_documents enable trigger order_sale_document_requires_dispatch;
\ir ../../docs/sql-drafts/2026-11-19-store-order-line-vat-consistency.down.sql
select 'store_order_vat_consistency_pg17_pass';

-- Disposable PG17 integration: after CX75 real ERP fixture, CX38/CX38b/CX62/CX66 and 06 VAT producer.
-- Never apply against operating databases. 06 SQL remains owned and supplied separately by 06.
\set ON_ERROR_STOP on
do $$ begin if current_database() <> 'store_member_order_test' or current_setting('server_version_num')::integer/10000<>17 then raise exception 'disposable_pg17_required'; end if; end $$;
\ir fixtures/document-footer-format.baseline.sql
\ir ../../docs/sql-drafts/2026-11-19-document-footer-format.sql
\ir fixtures/document-vat-outer.baseline.sql
\ir ../../docs/sql-drafts/2026-11-19-document-vat-contract.sql
update public.product_unit_conversions set is_confirmed=true where company_id='00000000-0000-4000-8000-000000000001';
delete from public.customer_price_agreements where company_id='00000000-0000-4000-8000-000000000001' and customer_id='20000000-0000-4000-8000-000000000001';
update public.store_order_settings set minimum_policy='fee',minimum_amount=999999,delivery_fee=7,self_order_enabled=true where company_id='00000000-0000-4000-8000-000000000001';
create temporary table vat_journey_original_versions as select id,content from public.pricing_document_versions;
do $$
#variable_conflict use_variable
declare
 c uuid:='00000000-0000-4000-8000-000000000001'; p uuid:='60000000-0000-4000-8000-000000000001'; customer uuid:='20000000-0000-4000-8000-000000000001';
 scenario int; unit_price int; tax text; qty numeric; shipped numeric; promo uuid; doc uuid; version_id uuid; order_id uuid; sale_id uuid; order_key uuid; dispatch_key uuid;
 payload jsonb; template jsonb; line jsonb; saved jsonb; published jsonb; result jsonb; replay jsonb; dispatch_payload jsonb; dispatched jsonb; token text;
 gross bigint; supply bigint; vat bigint; partial_gross bigint; partial_supply bigint;
begin
 select content into template from public.pricing_document_versions where id='80000000-0000-4000-8000-000000000001';
 for scenario in 1..6 loop
  unit_price:=case scenario when 1 then 1000 when 2 then 1000 when 3 then 1100 when 4 then 60 when 6 then 60 else 100 end;
  tax:=case when scenario in(2,4) then 'exempt' else 'taxable' end;
  qty:=case when scenario=5 then 0.5 else 1.5 end; shipped:=round(qty/2,3);
  update public.product_catalog set tax_type=tax where id=p and company_id=c;
  promo:=null;
  if scenario>=3 then
   promo:=gen_random_uuid();
   perform public.pricing_p1(c,repeat('a',64),true,'save-promotion',jsonb_build_object('id',promo,'expected',0,'content',jsonb_build_object('productId',p,'name','합성 고정가','displayName','합성 고정가','startsOn','2020-01-01','endsOn','2099-12-31','cost',unit_price,'margin',0,'stock',null,'perStoreLimit',null,'taxType',tax,'allowSheet',true,'badge',case when scenario in (4,6) then '임박' else '행사' end)));
  end if;
  line:=(template->'lines'->0)||jsonb_build_object('price',unit_price,'taxType',tax,'promotionId',promo,'visible',true);
  payload:=template||jsonb_build_object('showBrand',true,'showSpec',true,'priceContract','promotion-gross-v1','display',jsonb_build_object('priceIncludesTax',true),'lines',jsonb_build_array(line));
  doc:=gen_random_uuid();
  saved:=public.pricing_p1(c,repeat('a',64),true,'save',jsonb_build_object('id',doc,'expected',0,'content',payload));
  published:=public.pricing_p1(c,repeat('a',64),true,'publish',jsonb_build_object('id',doc,'expected',1));
  select id into strict version_id from public.pricing_document_versions where company_id=c and document_id=doc;
  token:=md5(doc::text)||md5(doc::text);
  insert into public.storefront_links(company_id,customer_id,document_version_id,token_nonce,token_hash,expires_at) values(c,customer,version_id,substr(token,1,32),token,'2099-12-31');
  order_key:=gen_random_uuid();
  payload:=jsonb_build_array(jsonb_build_object('productId',p,'promotionId',promo,'quantity',qty));
  result:=public.place_store_order(token,'2099-01-05',payload,order_key,null,null,'합성 VAT 대사');
  replay:=public.place_store_order(token,'2099-01-05',payload,order_key,null,null,'합성 VAT 대사');
  assert result=replay,'order retry changed'; order_id:=(result->>'id')::uuid;
  gross:=round(qty*unit_price); supply:=case when promo is not null and tax='taxable' then round(gross/1.1) else gross end;
  vat:=case when tax='exempt' then 0 when promo is not null then gross-supply else round(supply*0.1) end;
  assert exists(select 1 from public.store_order_lines where store_order_lines.order_id=order_id and supply_amount=supply and tax_amount=vat and total_amount=supply+vat),'order money mismatch';
  perform public.receive_store_order_with_sale_document(c,order_id,1,null,'합성 담당');
  select id into strict sale_id from public.business_documents where company_id=c and source_id=order_id;
  assert exists(select 1 from public.business_documents where id=sale_id and total_amount=supply+vat+7 and status='draft'),'receipt money mismatch';
  dispatch_payload:=jsonb_build_array(jsonb_build_object('orderId',order_id,'lines',(select jsonb_agg(jsonb_build_object('orderLineId',id,'shippedQuantity',shipped)) from public.store_order_lines where store_order_lines.order_id=order_id)));
  dispatch_key:=gen_random_uuid();
  dispatched:=public.dispatch_store_orders_partial_final_cancel(c,dispatch_payload,dispatch_key,null,'합성 담당');
  assert dispatched=public.dispatch_store_orders_partial_final_cancel(c,dispatch_payload,dispatch_key,null,'합성 담당'),'dispatch retry changed';
  partial_gross:=round(shipped*unit_price); partial_supply:=case when promo is not null and tax='taxable' then round(partial_gross/1.1) else partial_gross end;
  assert exists(select 1 from public.business_document_lines where document_id=sale_id and product_catalog_id=p and quantity=shipped and supply_amount=partial_supply and total_amount=case when tax='exempt' or promo is not null then partial_gross else partial_supply+round(partial_supply*0.1) end),'partial money mismatch';
  assert (select count(*) from public.partner_ledger_entries where source_document_id=sale_id)=1,'duplicate ledger';
  assert (select sum(quantity_delta) from public.inventory_movements where source_document_id=sale_id)=-shipped,'inventory mismatch';
  raise notice 'VAT journey case % PASS',scenario;
 end loop;
end $$;
do $$ begin assert not exists(select 1 from vat_journey_original_versions o join public.pricing_document_versions v using(id) where o.content is distinct from v.content),'existing publication changed'; end $$;
select 'DOCUMENT_ORDER_REAL_ERP_PARTIAL_PASS';
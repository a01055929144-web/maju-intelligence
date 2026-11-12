\set ON_ERROR_STOP on
-- CC-29c. Runs in the same disposable store_member_order_test DB right after promotion-audience-orders-cc29b.pg17.test.sql
-- (CC-29b is applied, its fixture data and cc29b_* helpers exist). Synthetic data only.
do $$ begin
 if current_database() !~ '^store_member_order_test' or current_setting('server_version_num')::int/10000<>17 then raise exception 'cc29c_disposable_pg17_required';end if;
 if to_regprocedure('public.save_promotion_audience_v1(uuid,uuid,integer,text,jsonb)') is null or to_regprocedure('public.cc29b_place(text,jsonb,boolean)') is null then raise exception 'cc29c_needs_cc29b_test_state';end if;
end $$;
create temporary table cc29c_before as
 select oid,proacl,pg_get_functiondef(oid) definition from pg_proc where oid in
 ('public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)'::regprocedure,
  'public.place_store_member_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)'::regprocedure);

-- Real-company shape (JS Retail): product default_sales_price is empty, the sale price lives in pricing_items.
update product_catalog set category='농산>채소', purchase_price=1000, default_sales_price=null where id='60000000-0000-4000-8000-000000000001';
insert into pricing_items(company_id,product_id,price) values('00000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',1700)
 on conflict (company_id,product_id) do update set price=1700;
insert into normalized_customers(id,company_id,customer_name,delivery_territory_id) values
 ('20000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-000000000001','dummy target store','10000000-0000-4000-8000-000000000001');
grant select on public.margin_template_items,public.margin_template_categories,public.pricing_items to service_role;
grant insert,update,delete on public.margin_template_items,public.margin_template_categories,public.pricing_items to service_role;

\ir ../../docs/sql-drafts/20261112-CC-29c-promotion-normal-price-server.sql

do $$ begin
 if exists(select from cc29c_before o join pg_proc p on p.oid=o.oid where p.proacl is distinct from o.proacl or p.prosecdef) then raise exception 'cc29c_acl_or_security_changed';end if;
 if exists(select from pg_proc p where p.proname in ('place_store_order','place_store_member_order') and pg_get_functiondef(p.oid) ~ 'normalPrice|default_sales_price') then raise exception 'cc29c_request_price_or_default_price_still_used';end if;
 if has_function_privilege('anon','public.margin_template_price_v1(uuid,uuid,uuid)','execute') or has_function_privilege('authenticated','public.margin_template_price_v1(uuid,uuid,uuid)','execute')
  or not has_function_privilege('service_role','public.margin_template_price_v1(uuid,uuid,uuid)','execute') then raise exception 'cc29c_grade_fn_grants_wrong';end if;
end $$;

set role service_role;
do $$
declare c uuid:='00000000-0000-4000-8000-000000000001'; p uuid:='c0290000-0000-4000-8000-000000000001';
 s1 uuid:='20000000-0000-4000-8000-000000000001'; s2 uuid:='20000000-0000-4000-8000-000000000002'; dummy uuid:='20000000-0000-4000-8000-0000000000a1';
 gold uuid:='e0290000-0000-4000-8000-000000000001'; prod uuid:='60000000-0000-4000-8000-000000000001'; rev int; m boolean; r jsonb; l store_order_lines;
 -- gold = 2000bp, rounding 10, cost 1000 -> 1200.
begin
 select revision into rev from pricing_promotions where id=p;
 perform save_promotion_audience_v1(c,p,rev,'only',jsonb_build_array(jsonb_build_object('kind','customer','id',dummy)));
 if margin_template_price_v1(c,s1,prod) is not null then raise exception 'cc29c_no_grade_must_be_null';end if;
 if margin_template_price_v1(c,s2,prod)<>1200 then raise exception 'cc29c_grade_default_wrong: %',margin_template_price_v1(c,s2,prod);end if;
 foreach m in array array[false,true] loop
  -- grade price beats the sale price (S2 gold: 1200 vs 1700 vs document 1500); no grade -> sale price beats the document line.
  l:=cc29b_last_line(cc29b_place('d',cc29b_promo_line(),m)); if l.unit_price<>1200 or l.promotion_id is not null then raise exception 'cc29c_grade_first_wrong: %',l.unit_price;end if;
  l:=cc29b_last_line(cc29b_place('c',cc29b_promo_line(),m)); if l.unit_price<>1700 then raise exception 'cc29c_sale_price_second_wrong: %',l.unit_price;end if;
  -- a price sent in the request is never used.
  l:=cc29b_last_line(cc29b_place('c',cc29b_promo_line(p::text,'{"normalPrice":1}'),m)); if l.unit_price<>1700 then raise exception 'cc29c_request_price_used: %',l.unit_price;end if;
  l:=cc29b_last_line(cc29b_place('d',cc29b_promo_line(p::text,'{"normalPrice":1}'),m)); if l.unit_price<>1200 then raise exception 'cc29c_request_price_used_grade: %',l.unit_price;end if;
  -- a valid agreement still comes first.
  insert into customer_price_agreements(id,company_id,customer_id,product_catalog_id,sales_unit,unit_price,tax_type,effective_from,status) values
   (gen_random_uuid(),c,s1,prod,'BOX',700,'exempt',current_date-1,'active'),(gen_random_uuid(),c,s2,prod,'BOX',650,'exempt',current_date-1,'active');
  if (cc29b_last_line(cc29b_place('c',cc29b_promo_line(),m))).unit_price<>700 or (cc29b_last_line(cc29b_place('d',cc29b_promo_line(),m))).unit_price<>650 then raise exception 'cc29c_agreement_not_first';end if;
  delete from customer_price_agreements;
  -- sale price not set (0): falls to the document normal line (1500); a document without a normal line is rejected (no default_sales_price either).
  update pricing_items set price=0 where product_id=prod;
  l:=cc29b_last_line(cc29b_place('c',cc29b_promo_line(),m)); if l.unit_price<>1500 then raise exception 'cc29c_document_line_fourth_wrong: %',l.unit_price;end if;
  perform cc29b_expect(format('select cc29b_place(%L,cc29b_promo_line(),%L)','e',m),'Normal price unavailable');
  update pricing_items set price=1700 where product_id=prod;
  l:=cc29b_last_line(cc29b_place('e',cc29b_promo_line(),m)); if l.unit_price<>1700 then raise exception 'cc29c_sale_price_without_document_line: %',l.unit_price;end if;
  -- template rules: item direct price > item margin > deepest category > template margin.
  insert into margin_template_categories(company_id,template_id,category,margin_bp) values(c,gold,'농산',3000),(c,gold,'농산>채소',1000);
  if margin_template_price_v1(c,s2,prod)<>1100 then raise exception 'cc29c_deepest_category_wrong: %',margin_template_price_v1(c,s2,prod);end if;
  delete from margin_template_categories where category='농산>채소';
  if margin_template_price_v1(c,s2,prod)<>1300 then raise exception 'cc29c_parent_category_wrong: %',margin_template_price_v1(c,s2,prod);end if;
  insert into margin_template_items(company_id,template_id,product_id,margin_bp) values(c,gold,prod,500);
  if margin_template_price_v1(c,s2,prod)<>1050 then raise exception 'cc29c_item_margin_wrong: %',margin_template_price_v1(c,s2,prod);end if;
  update margin_template_items set direct_price=1111 where product_id=prod;
  if (cc29b_last_line(cc29b_place('d',cc29b_promo_line(),m))).unit_price<>1111 then raise exception 'cc29c_item_direct_not_used';end if;
  delete from margin_template_items; delete from margin_template_categories;
  delete from store_order_requests;delete from store_order_lines;delete from store_orders;
 end loop;
 -- a store that is a target keeps the promotion price (unchanged by 29c).
 select revision into rev from pricing_promotions where id=p;
 perform save_promotion_audience_v1(c,p,rev,'all','[]');
 l:=cc29b_last_line(cc29b_place('c',cc29b_promo_line(),false)); if l.unit_price<>900 or l.promotion_id is distinct from p then raise exception 'cc29c_target_price_changed';end if;
 delete from store_order_requests;delete from store_order_lines;delete from store_orders;
end $$;
reset role;
select 'cc29c_server_normal_price_grade_sale_document_order_no_request_price_default_empty_pg17_pass';

-- down restores the 29b definitions exactly, then up applies again.
\ir ../../docs/sql-drafts/20261112-CC-29c-promotion-normal-price-server.down.sql
do $$ begin
 if exists(select from cc29c_before o join pg_proc p on p.oid=o.oid where o.definition<>pg_get_functiondef(p.oid) or o.proacl is distinct from p.proacl) then raise exception 'cc29c_down_did_not_restore_exactly';end if;
 if to_regprocedure('public.margin_template_price_v1(uuid,uuid,uuid)') is not null then raise exception 'cc29c_down_left_function';end if;
end $$;
\ir ../../docs/sql-drafts/20261112-CC-29c-promotion-normal-price-server.sql
select 'cc29c_down_exact_restore_and_reapply_pg17_pass';

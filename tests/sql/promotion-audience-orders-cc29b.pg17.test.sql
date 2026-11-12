\set ON_ERROR_STOP on
-- CC-29b. Runs in the disposable store_member_order_test DB after store-member-order.pg17.test.sql and promotion-reservation-cx08.pg17.test.sql
-- (CX-08 up is the live state). Synthetic data only.
do $$ begin
 if current_database() !~ '^store_member_order_test' or current_setting('server_version_num')::int/10000<>17 then raise exception 'cc29b_disposable_pg17_required';end if;
end $$;
-- Stand-ins for production tables/columns that the fixture lacks.
alter table public.product_catalog add column if not exists default_sales_price numeric(14,2);
\ir ../../docs/sql-drafts/20261111-CC-19a-margin-templates.sql
\ir ../../docs/sql-drafts/20261112-CC-29a-promotion-audience.sql
grant select on public.margin_templates to service_role;
grant select,update on public.pricing_promotions to service_role;
grant insert,delete on public.customer_price_agreements to service_role;
grant update on public.product_catalog to service_role;

create temporary table cc29b_before as
 select oid,proacl,pg_get_functiondef(oid) definition from pg_proc where oid in
 ('public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)'::regprocedure,
  'public.place_store_member_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)'::regprocedure);

insert into margin_templates(id,company_id,name,margin_bp,rounding) values
 ('e0290000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','gold',2000,10),
 ('e0290000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','other gold',2000,10);
update normalized_customers set margin_template_id='e0290000-0000-4000-8000-000000000001' where id='20000000-0000-4000-8000-000000000002';
-- Promotion P (price 900) for the fixture product; normal document price 1500; product default 1100.
insert into pricing_promotions(id,company_id,product_id,name,display_name,starts_on,ends_on,purchase_cost,margin_bp,price,stock,per_store_limit,tax_type,allow_sheet,badge,revision) values
 ('c0290000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','p','p',current_date-1,'2099-12-31',800,0,900,2,null,'exempt',true,'행사',1),
 ('c0290000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','old','old',current_date-9,current_date-5,800,0,900,null,null,'exempt',true,'행사',1);
update product_catalog set default_sales_price=1100 where id='60000000-0000-4000-8000-000000000001';
insert into pricing_document_versions(id,company_id,document_id,version,revision,content)
 select 'c0290000-0000-4000-8000-000000000010',company_id,document_id,10,10,
  jsonb_set(content,'{lines}','[
   {"productId":"60000000-0000-4000-8000-000000000001","displayName":"normal","spec":"s","unit":"BOX","price":1500,"taxType":"exempt","visible":true},
   {"productId":"60000000-0000-4000-8000-000000000001","promotionId":"c0290000-0000-4000-8000-000000000001","displayName":"promo","spec":"s","unit":"BOX","price":900,"taxType":"exempt","visible":true},
   {"productId":"60000000-0000-4000-8000-000000000001","promotionId":"c0290000-0000-4000-8000-000000000002","displayName":"old promo","spec":"s","unit":"BOX","price":900,"taxType":"exempt","visible":true}]'::jsonb)
  from pricing_document_versions where id='80000000-0000-4000-8000-000000000001';
-- Same document without a normal line: the fallback chain must reach the product default.
insert into pricing_document_versions(id,company_id,document_id,version,revision,content)
 select 'c0290000-0000-4000-8000-000000000011',company_id,document_id,11,11,
  jsonb_set(content,'{lines}','[
   {"productId":"60000000-0000-4000-8000-000000000001","promotionId":"c0290000-0000-4000-8000-000000000001","displayName":"promo","spec":"s","unit":"BOX","price":900,"taxType":"exempt","visible":true}]'::jsonb)
  from pricing_document_versions where id='80000000-0000-4000-8000-000000000001';
insert into storefront_links(id,company_id,customer_id,document_version_id,token_nonce,token_hash,expires_at) values
 ('c0290000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','c0290000-0000-4000-8000-000000000010',repeat('c',32),repeat('c',64),'2099-12-31'),
 ('c0290000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','c0290000-0000-4000-8000-000000000010',repeat('d',32),repeat('d',64),'2099-12-31'),
 ('c0290000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','c0290000-0000-4000-8000-000000000011',repeat('e',32),repeat('e',64),'2099-12-31');

-- Test helpers (token c = store 1, d = store 2, e = store 1 with the no-normal-line document).
create function public.cc29b_place(client text, lines jsonb, member boolean default false) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare token text:=repeat(client,64); n int:=case when client='d' then 2 else 1 end;
begin
 if member then
  return place_store_member_order(token,'2099-01-05',lines,gen_random_uuid(),null,null,'CC29b',
   ('30000000-0000-4000-8000-00000000000'||n)::uuid,('40000000-0000-4000-8000-00000000000'||n)::uuid,('50000000-0000-4000-8000-00000000000'||n)::uuid);
 end if;
 return place_store_order(token,'2099-01-05',lines,gen_random_uuid(),null,null,'CC29b');
end $$;
create function public.cc29b_promo_line(promo text default 'c0290000-0000-4000-8000-000000000001', extra jsonb default '{}') returns jsonb language sql as $$
 select jsonb_build_array(jsonb_build_object('productId','60000000-0000-4000-8000-000000000001','promotionId',promo,'quantity',1)||extra) $$;
create function public.cc29b_last_line(r jsonb) returns store_order_lines language sql as $$
 select sl from store_order_lines sl where sl.order_id=(r->>'id')::uuid limit 1 $$;
create function public.cc29b_promo_of(client text, member boolean) returns uuid language sql as $$
 select (cc29b_last_line(cc29b_place(client,cc29b_promo_line(),member))).promotion_id $$;
revoke all on function public.cc29b_promo_of(text,boolean) from public,anon,authenticated;
grant execute on function public.cc29b_promo_of(text,boolean) to service_role;
revoke all on function public.cc29b_place(text,jsonb,boolean),public.cc29b_promo_line(text,jsonb),public.cc29b_last_line(jsonb) from public,anon,authenticated;
grant execute on function public.cc29b_place(text,jsonb,boolean),public.cc29b_promo_line(text,jsonb),public.cc29b_last_line(jsonb) to service_role;
create function public.cc29b_expect(sql text, message text) returns void language plpgsql as $$
begin
 begin execute sql; raise exception 'cc29b_expected_failure_missing: %', message;
 exception when raise_exception then if sqlerrm<>message then raise; end if; end;
end $$;

\ir ../../docs/sql-drafts/20261112-CC-29b-promotion-audience-orders.sql

do $$ begin
 if exists(select from cc29b_before o join pg_proc p on p.oid=o.oid where p.proacl is distinct from o.proacl or p.prosecdef) then raise exception 'cc29b_acl_or_security_changed';end if;
 if has_function_privilege('anon','public.save_promotion_audience_v1(uuid,uuid,integer,text,jsonb)','execute') or has_function_privilege('authenticated','public.save_promotion_audience_v1(uuid,uuid,integer,text,jsonb)','execute')
  or not has_function_privilege('service_role','public.save_promotion_audience_v1(uuid,uuid,integer,text,jsonb)','execute') then raise exception 'cc29b_save_grants_wrong';end if;
end $$;

set role service_role;
do $$
declare c uuid:='00000000-0000-4000-8000-000000000001'; o uuid:='00000000-0000-4000-8000-000000000002';
 p uuid:='c0290000-0000-4000-8000-000000000001'; s1 uuid:='20000000-0000-4000-8000-000000000001'; s2 uuid:='20000000-0000-4000-8000-000000000002'; s_other uuid:='20000000-0000-4000-8000-000000000003';
 gold uuid:='e0290000-0000-4000-8000-000000000001'; gold_o uuid:='e0290000-0000-4000-8000-000000000002'; prod uuid:='60000000-0000-4000-8000-000000000001';
 r jsonb; l store_order_lines; m boolean; v jsonb;
begin
 foreach m in array array[false,true] loop
  -- audience all (default): promotion price for everyone, even with an agreement (agreement must not overwrite the promotion price).
  insert into customer_price_agreements(id,company_id,customer_id,product_catalog_id,sales_unit,unit_price,tax_type,effective_from,status) values(gen_random_uuid(),c,s1,prod,'BOX',700,'exempt',current_date-1,'active');
  r:=cc29b_place('c',cc29b_promo_line(),m); l:=cc29b_last_line(r);
  if l.unit_price<>900 or l.promotion_id is distinct from p then raise exception 'cc29b_all_agreement_overwrote_promotion: % %',l.unit_price,l.promotion_id;end if;
  if (r->>'promotionNotApplied')::int<>0 then raise exception 'cc29b_all_counted_not_applied';end if;
  -- a normal (non-promotion) line keeps the agreement price as before.
  r:=cc29b_place('c','[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]',m); l:=cc29b_last_line(r);
  if l.unit_price<>700 or l.promotion_id is not null then raise exception 'cc29b_normal_line_agreement_lost: %',l.unit_price;end if;
  delete from store_order_requests;delete from store_order_lines;delete from store_orders;

  -- only [store 2]: store 1 is not a target -> agreement price, no promotion id, stock untouched.
  v:=save_promotion_audience_v1(c,p,1,'only',jsonb_build_array(jsonb_build_object('kind','customer','id',s2)));
  if (v->>'revision')::int<>2 then raise exception 'cc29b_revision_not_bumped';end if;
  r:=cc29b_place('c',cc29b_promo_line('c0290000-0000-4000-8000-000000000001','{"quantity":5}'),m); l:=cc29b_last_line(r);
  if l.unit_price<>700 or l.promotion_id is not null or l.quantity<>5 or (r->>'promotionNotApplied')::int<>1 then raise exception 'cc29b_only_non_target_wrong: % % %',l.unit_price,l.promotion_id,r;end if;
  -- no agreement: server grade price, then document normal price (1500).
  delete from customer_price_agreements;
  r:=cc29b_place('c',cc29b_promo_line(p::text,'{"normalPrice":1300}'),m); l:=cc29b_last_line(r);
  if l.unit_price<>1300 or l.promotion_id is not null then raise exception 'cc29b_grade_price_ignored: %',l.unit_price;end if;
  r:=cc29b_place('c',cc29b_promo_line(),m); l:=cc29b_last_line(r);
  if l.unit_price<>1500 then raise exception 'cc29b_document_normal_price_ignored: %',l.unit_price;end if;
  -- the target store gets the promotion and reserves stock.
  r:=cc29b_place('d',cc29b_promo_line(),m); l:=cc29b_last_line(r);
  if l.unit_price<>900 or l.promotion_id is distinct from p or (r->>'promotionNotApplied')::int<>0 then raise exception 'cc29b_only_target_wrong';end if;
  -- stock 2: the non-target orders above (qty 5+1+1) did not consume it, so another 1 for the target still fits and a third does not.
  perform cc29b_place('d',cc29b_promo_line(),m);
  perform cc29b_expect(format('select cc29b_place(%L,cc29b_promo_line(),%L)','d',m),'Promotion unavailable');
  delete from store_order_requests;delete from store_order_lines;delete from store_orders;

  -- only [grade gold]: store 2 (gold) is a target, store 1 (no grade) is not.
  v:=save_promotion_audience_v1(c,p,2,'only',jsonb_build_array(jsonb_build_object('kind','template','id',gold)));
  if cc29b_promo_of('d',m) is distinct from p then raise exception 'cc29b_grade_target_missed';end if;
  if cc29b_promo_of('c',m) is not null then raise exception 'cc29b_grade_non_target_got_promotion';end if;
  delete from store_order_requests;delete from store_order_lines;delete from store_orders;

  -- except [store 1]: store 1 excluded, store 2 applies.
  v:=save_promotion_audience_v1(c,p,3,'except',jsonb_build_array(jsonb_build_object('kind','customer','id',s1)));
  if cc29b_promo_of('c',m) is not null then raise exception 'cc29b_except_target_got_promotion';end if;
  if cc29b_promo_of('d',m) is distinct from p then raise exception 'cc29b_except_other_missed';end if;
  delete from store_order_requests;delete from store_order_lines;delete from store_orders;

  -- no normal line in the document and no agreement/grade price: product default price; with no default -> rejected.
  r:=cc29b_place('e',cc29b_promo_line(),m); l:=cc29b_last_line(r);
  if l.unit_price<>1100 or l.promotion_id is not null then raise exception 'cc29b_product_default_ignored: %',l.unit_price;end if;
  update product_catalog set default_sales_price=null where id=prod;
  perform cc29b_expect(format('select cc29b_place(%L,cc29b_promo_line(),%L)','e',m),'Normal price unavailable');
  update product_catalog set default_sales_price=1100 where id=prod;
  delete from store_order_requests;delete from store_order_lines;delete from store_orders;

  -- expired promotion and unknown promotion are still rejected for everyone.
  perform cc29b_expect(format('select cc29b_place(%L,cc29b_promo_line(%L),%L)','d','c0290000-0000-4000-8000-000000000002',m),'Promotion unavailable');
  perform cc29b_expect(format('select cc29b_place(%L,cc29b_promo_line(%L),%L)','d','c0290000-0000-4000-8000-0000000000ff',m),'Product unavailable in document');
  update pricing_promotions set audience='all',revision=revision+1 where id=p;
  delete from pricing_promotion_targets;
  update pricing_promotions set revision=1 where id=p;
 end loop;

 -- save_promotion_audience_v1 rules.
 perform cc29b_expect(format('select save_promotion_audience_v1(%L,%L,1,%L,%L)',c,p,'only','[]'),'Audience targets required');
 perform cc29b_expect(format('select save_promotion_audience_v1(%L,%L,9,%L,%L)',c,p,'all','[]'),'Stale promotion');
 perform cc29b_expect(format('select save_promotion_audience_v1(%L,%L,1,%L,%L)',c,p,'only',jsonb_build_array(jsonb_build_object('kind','customer','id',s_other))),'Audience target outside company');
 perform cc29b_expect(format('select save_promotion_audience_v1(%L,%L,1,%L,%L)',c,p,'only',jsonb_build_array(jsonb_build_object('kind','template','id',gold_o))),'Audience target outside company');
 perform cc29b_expect(format('select save_promotion_audience_v1(%L,%L,1,%L,%L)',o,p,'all','[]'),'Promotion not found');
 perform cc29b_expect(format('select save_promotion_audience_v1(%L,%L,1,%L,%L)',c,p,'all',jsonb_build_array(jsonb_build_object('kind','customer','id',s1))),'Targets not allowed for all stores');
 perform cc29b_expect(format('select save_promotion_audience_v1(%L,%L,1,%L,%L)',c,p,'bogus','[]'),'Invalid audience request');
 perform cc29b_expect(format('select save_promotion_audience_v1(%L,%L,1,%L,%L)',c,p,'only','[{"kind":"x","id":"1"}]'),'Invalid audience target');
 if (select audience from pricing_promotions where id=p)<>'all' or (select revision from pricing_promotions where id=p)<>1 or exists(select from pricing_promotion_targets) then raise exception 'cc29b_rejected_save_left_changes';end if;
 -- Targets are replaced as a whole and duplicates collapse.
 perform save_promotion_audience_v1(c,p,1,'only',jsonb_build_array(jsonb_build_object('kind','customer','id',s1),jsonb_build_object('kind','customer','id',upper(s1::text)),jsonb_build_object('kind','template','id',gold)));
 if (select count(*) from pricing_promotion_targets where promotion_id=p)<>2 then raise exception 'cc29b_duplicate_targets_kept';end if;
 perform save_promotion_audience_v1(c,p,2,'except',jsonb_build_array(jsonb_build_object('kind','customer','id',s2)));
 if (select count(*) from pricing_promotion_targets where promotion_id=p and customer_id=s2)<>1 or (select count(*) from pricing_promotion_targets where promotion_id=p)<>1 then raise exception 'cc29b_targets_not_replaced';end if;
end $$;
reset role;
select 'cc29b_audience_orders_agreement_grade_default_member_legacy_pg17_pass';

-- down: refused while an audience is restricted, then exact restore, then up again.
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/20261112-CC-29b-promotion-audience-orders.down.sql
\set ON_ERROR_STOP on
do $$ begin
 if to_regprocedure('public.save_promotion_audience_v1(uuid,uuid,integer,text,jsonb)') is null then raise exception 'cc29b_down_guard_missed_restricted_audience';end if;
end $$;
rollback;
update public.pricing_promotions set audience='all';
delete from public.pricing_promotion_targets;
\ir ../../docs/sql-drafts/20261112-CC-29b-promotion-audience-orders.down.sql
do $$ begin
 if exists(select from cc29b_before o join pg_proc p on p.oid=o.oid where o.definition<>pg_get_functiondef(p.oid) or o.proacl is distinct from p.proacl) then raise exception 'cc29b_down_did_not_restore_exactly';end if;
 if to_regprocedure('public.save_promotion_audience_v1(uuid,uuid,integer,text,jsonb)') is not null then raise exception 'cc29b_down_left_save_function';end if;
end $$;
\ir ../../docs/sql-drafts/20261112-CC-29b-promotion-audience-orders.sql
select 'cc29b_down_guard_exact_restore_and_reapply_pg17_pass';

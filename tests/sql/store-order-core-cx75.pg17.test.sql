\set ON_ERROR_STOP on
do $$ begin
  if current_database()<>'store_member_order_test' or current_setting('server_version_num')::int/10000<>17
    then raise exception 'cx75_disposable_pg17_required'; end if;
end $$;
\ir ../../docs/sql-drafts/20261111-CC-19a-margin-templates.sql
\ir ../../docs/sql-drafts/20261112-CC-29a-promotion-audience.sql
create temporary table cx75_original_functions as
select oid original_oid,proname,pg_get_function_identity_arguments(oid) args,pg_get_functiondef(oid) definition,proacl
from pg_proc where pronamespace='public'::regnamespace and proname in
('place_store_order','place_store_member_order','place_store_catalog_order_core_v1',
 'place_store_catalog_order_v1','place_store_catalog_member_order_v1','place_store_account_order','place_store_account_orders');
\ir ../../docs/sql-drafts/2026-11-18-CX-75-common-order-core.sql
do $$ begin
  if exists(select 1 from public.store_order_settings where unified_order_core_enabled)
    then raise exception 'cx75_default_not_off'; end if;
  if (select count(*) from cx75_original_functions)<>7 then raise exception 'cx75_missing_entry'; end if;
  if exists(select 1 from cx75_original_functions f where position('place_store_order_core_v2' in
    pg_get_functiondef((select oid from pg_proc where pronamespace='public'::regnamespace and proname=f.proname)))=0)
    then raise exception 'cx75_wrapper_missing'; end if;
  if has_function_privilege('anon','public.place_store_order_core_v2(text,jsonb)','execute')
    or has_function_privilege('authenticated','public.place_store_order_core_v2(text,jsonb)','execute')
    or exists(select 1 from pg_proc where proname like 'cx75_place_store_%_impl'
      and has_function_privilege('service_role',oid,'execute')) then raise exception 'cx75_acl'; end if;
end $$;
update public.store_order_settings set unified_order_core_enabled=true
where company_id='00000000-0000-4000-8000-000000000001';
insert into public.product_catalog(id,company_id,purchase_product_name,purchase_price,sales_unit,tax_type)
values('60000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000002','CX75 foreign',800,'BOX','exempt');
insert into public.store_orders(id,company_id,customer_id,delivery_date,idempotency_key,store_account_id,ordered_by_member_id)
values('b0000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000002',
'20000000-0000-4000-8000-000000000003','2099-01-05',gen_random_uuid(),
'30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000003');

-- Invoke exact public signatures through a test-only typed adapter.
create function public.cx75_test_call(entry text, request jsonb) returns jsonb language plpgsql as $$
declare f record; args text; result jsonb;
begin
 select proargnames,proargtypes into strict f from pg_proc
 where pronamespace='public'::regnamespace and proname=entry;
 select string_agg(format('%L::%s',case when request->f.proargnames[i+1]='null'::jsonb then null
 when f.proargtypes[i]='jsonb'::regtype then (request->f.proargnames[i+1])::text
 else request->>f.proargnames[i+1] end,format_type(f.proargtypes[i],null)),',' order by i)
 into args from generate_series(0,array_length(f.proargnames,1)-1) i;
 execute format('select public.%I(%s)',entry,args) into result;
 return result;
end $$;
insert into public.pricing_items(company_id,product_id,price)
values('00000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',1200)
on conflict(company_id,product_id) do update set price=excluded.price;
insert into public.storefront_links(company_id,customer_id,source,token_nonce,token_hash,expires_at)
values('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','catalog',repeat('c',32),repeat('c',64),'2099-12-31');
do $$
declare e text; r jsonb; result jsonb; rejected boolean; member_entry boolean; kind int;
begin
 foreach e in array array['place_store_order','place_store_member_order','place_store_catalog_order_core_v1',
 'place_store_catalog_order_v1','place_store_catalog_member_order_v1','place_store_account_order'] loop
 member_entry:=e in ('place_store_member_order','place_store_catalog_member_order_v1','place_store_account_order');
 r:=jsonb_build_object('p_company','00000000-0000-4000-8000-000000000001','p_token_hash',repeat(case when e like '%catalog%' then 'c' else 'a' end,64),
 'p_delivery_date','2099-01-05','p_lines','[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
 'p_idempotency_key',gen_random_uuid(),'p_order_id',null,'p_expected_revision',null,'p_memo','cx75-wrapper',
 'p_store_account_id',case when member_entry then '30000000-0000-4000-8000-000000000001' end,
 'p_member_id',case when member_entry then '40000000-0000-4000-8000-000000000001' end,
 'p_auth_user_id',case when member_entry then '50000000-0000-4000-8000-000000000001' end);
 result:=public.cx75_test_call(e,r);
 if result->>'id' is null or public.cx75_test_call(e,r)<>result then raise exception 'cx75_wrapper_replay_%',e; end if;
 for kind in 1..3 loop
 rejected:=false;
 begin
 perform public.cx75_test_call(e,r||jsonb_build_object('p_idempotency_key',gen_random_uuid())||case kind
 when 1 then jsonb_build_object('p_lines','[{"productId":"60000000-0000-4000-8000-000000000099","quantity":1}]'::jsonb)
 when 2 then jsonb_build_object('p_order_id','b0000000-0000-4000-8000-000000000099','p_expected_revision',1)
 else jsonb_build_object('p_lines','[{"productId":"60000000-0000-4000-8000-000000000001","quantity":0}]'::jsonb) end);
 exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'cx75_wrapper_scope_%_%',e,kind; end if;
 end loop;
 if member_entry then
 rejected:=false;
 begin
 perform public.cx75_test_call(e,r||jsonb_build_object('p_idempotency_key',gen_random_uuid(),
 'p_store_account_id','30000000-0000-4000-8000-000000000003'));
 exception when raise_exception then rejected:=true; end;
 if not rejected then raise exception 'cx75_wrapper_account_%',e; end if;
 end if;
 end loop;
end $$;
drop function public.cx75_test_call(text,jsonb);

-- Fresh mixed batch: each company retains an independent subtransaction.
do $$
declare
 c uuid:='00000000-0000-4000-8000-000000000001';
 a uuid:='30000000-0000-4000-8000-000000000001';
 u uuid:='50000000-0000-4000-8000-000000000001';
 p uuid:='60000000-0000-4000-8000-000000000001';
 k uuid:=gen_random_uuid(); bad uuid:=gen_random_uuid();
 lines jsonb:=jsonb_build_array(jsonb_build_object('productId',p,'quantity',2));
 batch jsonb; result jsonb; changed jsonb; o uuid; n int;
begin
 batch:=jsonb_build_array(
 jsonb_build_object('companyId',c,'storeAccountId',a,'deliveryDate','2099-01-05','lines',lines,'idempotencyKey',k,'memo','cx75'),
 jsonb_build_object('companyId','00000000-0000-4000-8000-000000000002','storeAccountId','30000000-0000-4000-8000-000000000002',
 'deliveryDate','2099-01-05','lines',lines,'idempotencyKey',bad));
 result:=public.place_store_account_orders(a,u,batch);
 if result->0->'order' is null or result->1->>'error'<>'Store member unavailable'
   then raise exception 'cx75_fresh_batch %',result; end if;
 o:=(result->0->'order'->>'id')::uuid;
 if (select count(*) from public.store_orders where id=o)<>1
   or (select count(*) from public.store_order_lines where order_id=o)<>1
   or (select count(*) from public.store_account_order_requests where company_id=c and idempotency_key=k)<>1
   or (select count(*) from public.company_notifications where order_id=o and idempotency_key=k::text)<>1
   or exists(select 1 from public.store_orders where idempotency_key=bad)
   or exists(select 1 from public.store_account_order_requests where idempotency_key=bad)
   or exists(select 1 from public.company_notifications where idempotency_key=bad::text)
   then raise exception 'cx75_batch_counts'; end if;
 if public.place_store_account_orders(a,u,batch)<>result then raise exception 'cx75_batch_replay'; end if;
 for n in 1..3 loop
   changed:=case n when 1 then jsonb_set(batch,'{0,lines,0,quantity}','3')
     when 2 then jsonb_set(batch,'{0,memo}','"changed"')
     else jsonb_set(batch,'{0,deliveryDate}','"2099-01-06"') end;
   if public.place_store_account_orders(a,u,changed)->0->>'error'<>'Idempotency conflict'
     then raise exception 'cx75_conflict_%',n; end if;
 end loop;
 -- Historical result must survive subsequent edits/delisting.
 update public.store_orders set revision=revision+1 where id=o;
 update public.product_catalog set is_active=false where id=p;
 if public.place_store_account_orders(a,u,batch)<>result then raise exception 'cx75_historical_replay'; end if;
 update public.product_catalog set is_active=true where id=p;
end $$;
-- Two real connections contend on the same batch sub-entry key.
create extension if not exists dblink;
do $$
declare q text; a jsonb; b jsonb; pid int; waiting boolean:=false; i int;
 k uuid:=gen_random_uuid(); batch jsonb;
begin
 batch:=jsonb_build_array(jsonb_build_object('companyId','00000000-0000-4000-8000-000000000001',
 'storeAccountId','30000000-0000-4000-8000-000000000001','deliveryDate','2099-01-05',
 'lines','[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,
 'idempotencyKey',k,'memo','cx75-concurrent'));
 q:=format('select public.place_store_account_orders(%L::uuid,%L::uuid,%L::jsonb)',
 '30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',batch::text);
 perform dblink_connect('cx75a','dbname='||current_database());
 perform dblink_connect('cx75b','dbname='||current_database());
 select x into pid from dblink('cx75b','select pg_backend_pid()') as t(x int);
 perform dblink_exec('cx75a','set role service_role'); perform dblink_exec('cx75b','set role service_role');
 perform dblink_exec('cx75a','begin');
 select x into a from dblink('cx75a',q) as t(x jsonb);
 perform dblink_send_query('cx75b',q);
 for i in 1..100 loop
   select cardinality(pg_blocking_pids(pid))>0 into waiting;
   exit when waiting; perform pg_sleep(0.02);
 end loop;
 if not waiting then raise exception 'cx75_batch_did_not_serialize'; end if;
 perform dblink_exec('cx75a','commit');
 select x into b from dblink_get_result('cx75b') as t(x jsonb);
 if a<>b or a->0->'order' is null
   or (select count(*) from public.store_orders where idempotency_key=k)<>1
   or (select count(*) from public.company_notifications where idempotency_key=k::text)<>1
 then raise exception 'cx75_concurrent_duplicate_%_%',a,b; end if;
 perform dblink_disconnect('cx75a'); perform dblink_disconnect('cx75b');
end $$;
-- Distinct document/catalog links must serialize on the promotion row.
create function public.cx75_test_promotion(catalog boolean, promo uuid) returns jsonb language plpgsql as $$
declare lines jsonb;
begin
 lines:=jsonb_build_array(jsonb_build_object('productId','60000000-0000-4000-8000-000000000001','promotionId',promo,'quantity',1));
 if catalog then return public.place_store_catalog_order_v1(repeat('c',64),'2099-01-05',lines,gen_random_uuid(),null,null,'cx75-promo'); end if;
 return public.place_store_order(repeat('d',63)||case when promo='c0750000-0000-4000-8000-000000000001'::uuid then '1' else '2' end,'2099-01-05',lines,gen_random_uuid(),null,null,'cx75-promo');
 exception when raise_exception then return jsonb_build_object('error',sqlerrm);
end $$;
insert into public.pricing_promotions(id,company_id,product_id,name,display_name,starts_on,ends_on,purchase_cost,margin_bp,price,stock,per_store_limit,tax_type,allow_sheet,badge,revision)
select ('c0750000-0000-4000-8000-00000000000'||i)::uuid,'00000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
'CX75','CX75',current_date-1,'2099-12-31',800,0,1200,case when i=1 then 1 end,case when i=2 then 1 end,'exempt',true,'행사',1 from generate_series(1,2) i;
insert into public.pricing_document_versions(id,company_id,document_id,version,revision,content)
select ('c0750000-0000-4000-8000-00000000001'||i)::uuid,company_id,document_id,100+i,100+i,
jsonb_set(content,'{lines,0,promotionId}',to_jsonb('c0750000-0000-4000-8000-00000000000'||i))
from public.pricing_document_versions cross join generate_series(1,2) i
where id='80000000-0000-4000-8000-000000000001';
insert into public.storefront_links(company_id,customer_id,document_version_id,token_nonce,token_hash,expires_at)
select '00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
('c0750000-0000-4000-8000-00000000001'||i)::uuid,
repeat('d',31)||i,repeat('d',63)||i,'2099-12-31'
from generate_series(1,2) i;
do $$
declare promo uuid; i int; n int; waiting boolean; pid int; a jsonb; b jsonb;
begin
 perform dblink_connect('cx75a','dbname='||current_database()); perform dblink_connect('cx75b','dbname='||current_database());
 select x into pid from dblink('cx75b','select pg_backend_pid()') as t(x int);
 for n in 1..2 loop
 promo:=('c0750000-0000-4000-8000-00000000000'||n)::uuid;

 perform dblink_exec('cx75a','begin');
 select x into a from dblink('cx75a',format('select public.cx75_test_promotion(false,%L::uuid)',promo)) as t(x jsonb);
 if a->>'id' is null then raise exception 'cx75_first_promo_%',a; end if;
 perform dblink_send_query('cx75b',format('select public.cx75_test_promotion(true,%L::uuid)',promo));
 waiting:=false;
 for i in 1..100 loop
 select cardinality(pg_blocking_pids(pid))>0 into waiting;
 exit when waiting; perform pg_sleep(0.02);
 end loop;
 if not waiting or not exists(select 1 from pg_locks where relation='public.pricing_promotions'::regclass and mode='RowShareLock')
 then raise exception 'cx75_promotion_lock_not_observed'; end if;
 perform dblink_exec('cx75a','commit');
 select x into b from dblink_get_result('cx75b') as t(x jsonb);
 -- Drain final async completion so this connection can be reused.
 perform * from dblink_get_result('cx75b') as t(x jsonb);
 if b->>'error'<>'Promotion unavailable'
   or (select sum(quantity) from public.store_order_lines where promotion_id=promo)<>1
   then raise exception 'cx75_promotion_oversell_%_%',n,b; end if;
 end loop;

 perform dblink_disconnect('cx75a'); perform dblink_disconnect('cx75b');
end $$;
drop function public.cx75_test_promotion(boolean,uuid);

-- Market-price rows remain unknown, with no implicit receipt/financial confirmation.
do $$
declare p uuid; r jsonb;
begin
 select id into p from public.product_catalog where order_pricing_mode='market' limit 1;
 r:=public.place_store_account_order('00000000-0000-4000-8000-000000000001','2099-01-05',
 jsonb_build_array(jsonb_build_object('productId',p,'quantity',0.001)),gen_random_uuid(),null,null,'cx75-market',
 '30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001');
 if r->>'marketPricePending'<>'true' or (r->>'knownTotal')::numeric<>0
   or not exists(select 1 from public.store_orders where id=(r->>'id')::uuid and status='submitted')
 then raise exception 'cx75_market_became_confirmed_%',r; end if;
end $$;

-- D4 schema is test-only here; product cutoffs use server Asia/Seoul time.
alter table public.product_catalog add column order_cutoff_days_before smallint, add column order_cutoff_time time;
do $$
declare deadline timestamp; delivery date:=(clock_timestamp() at time zone 'Asia/Seoul')::date+1;
 r jsonb; k uuid:=gen_random_uuid();
begin
 deadline:=(clock_timestamp() at time zone 'Asia/Seoul')-interval '1 minute';
 update public.product_catalog set order_cutoff_days_before=delivery-deadline::date,order_cutoff_time=deadline::time
 where id='60000000-0000-4000-8000-000000000001';
 begin
 perform public.place_store_account_order('00000000-0000-4000-8000-000000000001',delivery,
 '[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]',k,null,null,'cx75-cutoff',
 '30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001');
 raise exception 'cx75_cutoff_accepted_after';
 exception when raise_exception then if sqlerrm<>'Delivery date unavailable' then raise; end if; end;
 deadline:=(clock_timestamp() at time zone 'Asia/Seoul')+interval '1 minute';
 update public.product_catalog set order_cutoff_days_before=delivery-deadline::date,order_cutoff_time=deadline::time
 where id='60000000-0000-4000-8000-000000000001';
 r:=public.place_store_account_order('00000000-0000-4000-8000-000000000001',delivery,
 '[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]',k,null,null,'cx75-cutoff',
 '30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001');
 if r->>'id' is null then raise exception 'cx75_cutoff_rejected_before'; end if;
end $$;
alter table public.product_catalog drop column order_cutoff_days_before,drop column order_cutoff_time;

-- A post-write one-won drift must roll back the engine's complete subtransaction.
create function public.cx75_test_drift() returns trigger language plpgsql as $$
begin
 if new.request_memo='cx75-drift' and new.known_total>0 and pg_trigger_depth()=1 then
   update public.store_orders set known_total=known_total+1 where id=new.id;
 end if;
 return new;
end $$;
create trigger cx75_test_drift after update on public.store_orders for each row execute function public.cx75_test_drift();
do $$
declare k uuid:=gen_random_uuid(); n bigint[];
begin
 n:=array[(select count(*) from public.store_orders),(select count(*) from public.store_order_lines),
   (select count(*) from public.company_notifications),(select count(*) from public.store_account_order_requests)];
 begin
 perform public.place_store_account_order('00000000-0000-4000-8000-000000000001','2099-01-05',
 '[{"productId":"60000000-0000-4000-8000-000000000001","quantity":2}]',k,null,null,'cx75-drift',
 '30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001');
 raise exception 'cx75_drift_accepted';
 exception when raise_exception then if sqlerrm<>'cx75_order_amount_mismatch' then raise; end if; end;
 if n<>array[(select count(*) from public.store_orders),(select count(*) from public.store_order_lines),
   (select count(*) from public.company_notifications),(select count(*) from public.store_account_order_requests)]
 then raise exception 'cx75_drift_partial_write'; end if;
end $$;
drop trigger cx75_test_drift on public.store_orders;
drop function public.cx75_test_drift();
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/2026-11-18-CX-75-common-order-core.down.sql
\set ON_ERROR_STOP on
do $$ begin
 if to_regprocedure('public.place_store_order_core_v2(text,jsonb)') is null
 or not exists(select 1 from public.store_order_settings where unified_order_core_enabled)
 then raise exception 'cx75_down_guard_failed'; end if;
end $$;
update public.store_order_settings set unified_order_core_enabled=false;
\ir ../../docs/sql-drafts/2026-11-18-CX-75-common-order-core.down.sql
do $$ begin
 if exists(select 1 from cx75_original_functions f join pg_proc p on p.pronamespace='public'::regnamespace and p.proname=f.proname
   where p.oid<>f.original_oid or pg_get_functiondef(p.oid)<>f.definition or p.proacl is distinct from f.proacl)
 then raise exception 'cx75_down_definition_or_acl'; end if;
end $$;
select 'cx75_common_order_core_pg17_pass';

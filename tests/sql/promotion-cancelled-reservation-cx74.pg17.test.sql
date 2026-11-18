\set ON_ERROR_STOP on
-- Included by the real CX-75 PG17 chain, before its rollback checks.
do $$ begin
  assert current_database()='store_member_order_test';
  assert current_setting('server_version_num')::int/10000=17;
end $$;
\if :{?CX74_CURRENT_ENGINE_VARIANT}
-- Isolated row/definition fixture of the read-verified operating contract:
-- document engines already use non-cancelled states, pending entry is absent.
create temporary table cx74_fixture_restore as
select pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace
  and proname in ('cx75_place_store_order_impl','cx75_place_store_member_order_impl');
do $$ declare f record; signature text; begin
  for f in select definition from cx74_fixture_restore loop
    assert position('and so.status = ''submitted'' and so.id <> v_order.id' in f.definition)>0;
    execute replace(f.definition,'and so.status = ''submitted'' and so.id <> v_order.id',
      'and so.status <> ''cancelled'' and so.id <> v_order.id');
  end loop;
  select oid::regprocedure::text into strict signature from pg_proc
    where pronamespace='public'::regnamespace and proname='place_store_pending_delivery_order';
  execute format('alter function %s rename to cx74_test_pending_original',signature);
end $$;
\endif
-- Mirror CX-66's final-cancel row contract, without replacing its dispatch engine.
alter table public.store_order_lines
  add column shipped_quantity numeric(14,3) not null default 0 check(shipped_quantity>=0),
  add column cancelled_quantity numeric(14,3) not null default 0 check(cancelled_quantity>=0),
  add constraint cx74_dispatch_quantity_test check(shipped_quantity+cancelled_quantity<=quantity);
\ir ../../docs/sql-drafts/2026-11-18-D4-S-3bc-order-cutoff-promotion-remaining.sql
create temporary table cx74_original_functions as
select oid,pg_get_functiondef(oid) definition,proacl,proowner from pg_proc
where pronamespace='public'::regnamespace and proname in
('cx75_place_store_order_impl','cx75_place_store_member_order_impl',
 'cx75_place_store_catalog_order_core_v1_impl','cx75_place_store_account_order_impl',
 'place_store_pending_delivery_order','promotion_remaining_v1');
create temporary table cx74_before_overlay as select pg_temp.cx75_effects() effects;
\if :{?CX74_CURRENT_ENGINE_VARIANT}
\ir ../../docs/sql-drafts/2026-11-18-CX-74-current-engine-reservation.sql
\else
\ir ../../docs/sql-drafts/2026-11-18-CX-74-promotion-cancelled-reservation.sql
\endif
do $$ begin
  assert (select count(*) from cx74_original_functions)=case when exists(select 1 from pg_proc
    where pronamespace='public'::regnamespace and proname='cx74_test_pending_original') then 5 else 6 end;
  assert pg_temp.cx75_effects()=(select effects from cx74_before_overlay);
  assert not exists(select 1 from cx74_original_functions f join pg_proc p on p.oid=f.oid
    where p.proacl is distinct from f.proacl or p.proowner<>f.proowner);
end $$;

begin;
create function pg_temp.cx74_call(entry text, request jsonb) returns jsonb language plpgsql as $$
declare f record; args text; result jsonb;
begin
 select proargnames,proargtypes into strict f from pg_proc where pronamespace='public'::regnamespace and proname=entry;
 select string_agg(format('%L::%s',case when request->f.proargnames[i+1]='null'::jsonb then null
   when f.proargtypes[i]='jsonb'::regtype then (request->f.proargnames[i+1])::text
   else request->>f.proargnames[i+1] end,format_type(f.proargtypes[i],null)),',' order by i)
 into args from generate_series(0,array_length(f.proargnames,1)-1) i;
 execute format('select public.%I(%s)',entry,args) into result;
 return result;
end $$;
do $$
declare e text; mode int; n int:=1000; promo uuid; version_id uuid; token text; member_entry boolean;
 request jsonb; original jsonb; next_order jsonb; before_effects jsonb; postings jsonb; q record; c uuid:='00000000-0000-4000-8000-000000000001';
begin
 foreach e in array array['place_store_order','place_store_member_order','place_store_catalog_order_core_v1',
   'place_store_catalog_order_v1','place_store_catalog_member_order_v1','place_store_account_order','place_store_order_with_delivery_snapshot_09'] loop
 for mode in 1..2 loop -- global stock and per-store quota independently
   n:=n+1; promo:=gen_random_uuid(); version_id:=gen_random_uuid(); token:=md5(n::text)||md5(e||n);
   insert into public.pricing_promotions(id,company_id,product_id,name,display_name,starts_on,ends_on,purchase_cost,margin_bp,price,stock,per_store_limit,tax_type,allow_sheet,badge,revision)
   values(promo,c,'60000000-0000-4000-8000-000000000001','CX74','CX74',current_date-1,'2099-12-31',800,0,1200,
     case when mode=1 then 4 end,case when mode=2 then 4 end,'exempt',true,'행사',1);
   insert into public.pricing_document_versions(id,company_id,document_id,version,revision,content)
   select version_id,company_id,document_id,n,n,jsonb_set(content,'{lines,0,promotionId}',to_jsonb(promo))
   from public.pricing_document_versions where id='80000000-0000-4000-8000-000000000001';
   insert into public.storefront_links(company_id,customer_id,document_version_id,token_nonce,token_hash,expires_at)
   values(c,'20000000-0000-4000-8000-000000000001',version_id,md5(token),token,'2099-12-31');
   member_entry:=e in ('place_store_member_order','place_store_catalog_member_order_v1','place_store_account_order');
   request:=jsonb_build_object('p_company',c,'p_token_hash',case when e like '%catalog%' then repeat('c',64) else token end,
     'p_snapshot',(select jsonb_build_object('deliveryCustomerNameSnapshot',customer_name,'deliveryAddressSnapshot',address)
       from public.normalized_customers where id='20000000-0000-4000-8000-000000000001'),
     'p_delivery_date','2099-01-05','p_lines',jsonb_build_array(jsonb_build_object('productId','60000000-0000-4000-8000-000000000001','promotionId',promo,'quantity',3.125)),
     'p_idempotency_key',gen_random_uuid(),'p_order_id',null,'p_expected_revision',null,'p_memo','cx74-cancel-reservation',
     'p_store_account_id',case when member_entry then '30000000-0000-4000-8000-000000000001' end,
     'p_member_id',case when member_entry then '40000000-0000-4000-8000-000000000001' end,
     'p_auth_user_id',case when member_entry then '50000000-0000-4000-8000-000000000001' end);
   original:=pg_temp.cx74_call(e,request);
   assert original->>'id' is not null, e||': original order missing';
   -- Exact persisted shape of CX-66 partial-final-cancel: original quantity stays 3.125.
   update public.store_order_lines set shipped_quantity=1.630,cancelled_quantity=1.495 where order_id=(original->>'id')::uuid;
   update public.store_orders set status='in_delivery' where id=(original->>'id')::uuid;
   select * into q from public.promotion_remaining_v1(c,array[promo]);
   assert q.reserved_quantity=1.630 and (mode=2 or q.remaining_quantity=2.370), e||': cancellation not released';
   postings:=pg_temp.cx75_postings();
   request:=jsonb_set(request,'{p_lines,0,quantity}','2.370')||jsonb_build_object('p_idempotency_key',gen_random_uuid());
   next_order:=pg_temp.cx74_call(e,request);
   assert next_order->>'id' is not null, e||': released quota unavailable';
   before_effects:=pg_temp.cx75_effects();
   assert pg_temp.cx74_call(e,request)=next_order and pg_temp.cx75_effects()=before_effects, e||': replay effects';
   begin
     perform pg_temp.cx74_call(e,jsonb_set(request,'{p_lines,0,quantity}','0.001')||jsonb_build_object('p_idempotency_key',gen_random_uuid()));
     raise exception 'cx74_over_reservation_accepted';
   exception when raise_exception then if sqlerrm<>'Promotion unavailable' then raise; end if; end;
   assert pg_temp.cx75_effects()=before_effects and pg_temp.cx75_postings()=postings,e||': failed order effects';
   select * into q from public.promotion_remaining_v1(c,array[promo]);
   assert q.reserved_quantity=4.000 and (mode=2 or q.remaining_quantity=0),e||': shipped stock released twice';
 end loop;
 end loop;
end $$;
rollback;
\if :{?CX74_CURRENT_ENGINE_VARIANT}
\ir ../../docs/sql-drafts/2026-11-18-CX-74-current-engine-reservation.down.sql
\else
\ir ../../docs/sql-drafts/2026-11-18-CX-74-promotion-cancelled-reservation.down.sql
\endif
do $$ begin
  assert pg_temp.cx75_effects()=(select effects from cx74_before_overlay);
  assert not exists(select 1 from cx74_original_functions f join pg_proc p on p.oid=f.oid
    where pg_get_functiondef(p.oid)<>f.definition or p.proacl is distinct from f.proacl or p.proowner<>f.proowner);
end $$;
\if :{?CX74_CURRENT_ENGINE_VARIANT}
do $$ declare f record; signature text; begin
  for f in select definition from cx74_fixture_restore loop execute f.definition; end loop;
  select oid::regprocedure::text into strict signature from pg_proc
    where pronamespace='public'::regnamespace and proname='cx74_test_pending_original';
  execute format('alter function %s rename to place_store_pending_delivery_order',signature);
end $$;
drop table cx74_fixture_restore;
\endif
\ir ../../docs/sql-drafts/2026-11-18-D4-S-3bc-order-cutoff-promotion-remaining.down.sql
alter table public.store_order_lines drop constraint cx74_dispatch_quantity_test,drop column shipped_quantity,drop column cancelled_quantity;
drop table cx74_original_functions,cx74_before_overlay;
select 'cx74_partial_cancel_reservation_pg17_pass';

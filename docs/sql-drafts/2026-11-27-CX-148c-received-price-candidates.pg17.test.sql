-- Disposable PG17 only; reuse the real CX-149 predecessor regression before testing CX-148c.
\set ON_ERROR_STOP on
\ir 2026-11-26-CX-149-received-document-products.pg17.test.sql
\ir 2026-11-26-CX-149-received-document-products.sql
-- Exercise the invoker wrapper used by service callers; the migration must preserve its mode.
alter function public.self_order_price_v2(uuid,uuid,uuid,date,boolean) security invoker;
alter function public.received_document_products_v1(uuid,uuid,date) security invoker;
create temp table cx148c_functions_before as select oid,proowner,proacl,prosecdef,pg_get_functiondef(oid) definition
 from pg_proc where oid in ('public.self_order_price_v2(uuid,uuid,uuid,date,boolean)'::regprocedure,'public.received_document_products_v1(uuid,uuid,date)'::regprocedure);
create temp table cx148c_data_before as select
 (select jsonb_agg(to_jsonb(v) order by id) from pricing_document_versions v) versions,
 (select jsonb_agg(to_jsonb(f) order by company_id,customer_id,product_id) from price_fixture f) prices;
\ir 2026-11-27-CX-148c-received-price-candidates.sql
set role service_role;
do $test$
declare c uuid:='10000000-0000-4000-8000-000000000001'; k uuid:='20000000-0000-4000-8000-000000000001';
 p uuid:='30000000-0000-4000-8000-000000000005'; r record; n integer;
begin
 -- The previous catalog price was 4000; the received default sheet says 6500.
 select * into r from self_order_price_v2(c,k,p,'2026-11-25',true);
 if (r.price,r.source) is distinct from (6500::bigint,'promise'::text) then raise exception 'default_sheet_did_not_beat_catalog: %',row_to_json(r); end if;
 select count(*) into n from received_document_products_v1(c,k,'2026-11-25');
 if n<>3 then raise exception 'unexpected received count %',n; end if;
 if exists(select 1 from received_document_products_v1(c,k,'2026-11-25') listed
  left join received_document_price_candidates_v1(c,k,'2026-11-25') candidate using(product_id)
  left join lateral self_order_price_v2(c,k,listed.product_id,'2026-11-25',true) ordered on true
  where candidate.product_id is null or ordered.price is distinct from candidate.price
    or (listed.badge,listed.ends_on) is distinct from (candidate.badge,candidate.ends_on)) then raise exception 'received/order candidate drift'; end if;
 select * into r from self_order_price_v2(c,k,p,'2026-11-25',false);
 if (r.price,r.source,r.promise_until) is distinct from (4000::bigint,'catalog'::text,null::date) then raise exception 'exclude promise changed'; end if;
 select * into r from self_order_price_v2(c,k,'30000000-0000-4000-8000-000000000004','2026-11-25',true);
 if (r.price,r.source) is distinct from (900::bigint,'base'::text) then raise exception 'base fallback changed'; end if;
 if exists(select 1 from received_document_price_candidates_v1(c,k,'2026-12-01')) then raise exception 'expired candidate'; end if;
 if exists(select 1 from received_document_price_candidates_v1(c,k,'2026-11-25') where product_id='30000000-0000-4000-8000-0000000000b1') then raise exception 'company leak'; end if;
 if not has_function_privilege('service_role','public.received_document_price_candidates_v1(uuid,uuid,date)','execute') then raise exception 'nested helper service grant missing'; end if;
end $test$;
reset role;
-- Older store-specific document must beat a newer default sheet; no cross-customer leakage.
begin;
insert into pricing_document_versions values ('50000000-0000-4000-8000-0000000000c1','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000000d',
 '{"kind":"sheet","showPrice":true,"validUntil":"2026-12-31","lines":[{"productId":"30000000-0000-4000-8000-000000000005","unit":"EA","visible":true,"price":3300,"taxType":"exempt"}]}','2026-11-01');
insert into customer_pricing_document_links values ('60000000-0000-4000-8000-0000000000c1','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-00000000000d','50000000-0000-4000-8000-0000000000c1',true,now());
set local role service_role;
do $test$ declare r record; begin
 select * into r from self_order_price_v2('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000005','2026-11-25',true);
 if r.price is distinct from 3300::bigint then raise exception 'store candidate lost priority'; end if;
 select * into r from self_order_price_v2('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000005','2026-11-25',true);
 if r.price is distinct from 6500::bigint then raise exception 'cross customer candidate leak'; end if;
end $test$;
rollback;
-- Both RPCs exclude the same invalid lines. Also verify tax conversion and matching badge.
begin;
do $test$ declare v jsonb; line jsonb; variation text; r record; c uuid:='10000000-0000-4000-8000-000000000001'; k uuid:='20000000-0000-4000-8000-000000000001'; p uuid:='30000000-0000-4000-8000-000000000005'; begin
 select content into v from pricing_document_versions where id='50000000-0000-4000-8000-0000000000a5';
 line:=jsonb_build_object('productId',p,'unit','EA','visible',true,'price',6223,'taxType','taxable');
 update pricing_document_versions set content=jsonb_set(jsonb_set(v,'{lines}',jsonb_build_array(line)),'{display,priceIncludesTax}','true') where id='50000000-0000-4000-8000-0000000000a5';
 select * into r from self_order_price_v2(c,k,p,'2026-11-25',true);
 if (r.price,r.tax_type,r.includes_tax) is distinct from (6845::bigint,'taxable'::text,true) then raise exception 'tax conversion drift %',row_to_json(r); end if;
 foreach variation in array array['hidden','unit','exhausted','future','expired'] loop
  update pricing_document_versions set content=jsonb_set(v,'{lines}',jsonb_build_array(case variation
   when 'hidden' then line||'{"visible":false}'::jsonb when 'unit' then line||'{"unit":"BOX"}'::jsonb
   when 'exhausted' then line||'{"promotionId":"p","remaining":0}'::jsonb
   when 'future' then line||'{"promotionId":"p","startsOn":"2026-12-01"}'::jsonb
   else line||'{"promotionId":"p","endsOn":"2026-11-24"}'::jsonb end)) where id='50000000-0000-4000-8000-0000000000a5';
  if exists(select 1 from received_document_products_v1(c,k,'2026-11-25') where product_id=p) then raise exception 'invalid line listed %',variation; end if;
  select * into r from self_order_price_v2(c,k,p,'2026-11-25',true);
  if (r.price,r.source) is distinct from (4000::bigint,'catalog'::text) then raise exception 'invalid line priced %',variation; end if;
 end loop;
 update pricing_document_versions set content=v where id='50000000-0000-4000-8000-0000000000a5';
 update pricing_document_share_links set revoked_at=now();
 if exists(select 1 from received_document_products_v1(c,k,'2026-11-25')) then raise exception 'revoked default listed'; end if;
 update pricing_document_share_links set revoked_at=null,expires_at=now()-interval '1 minute';
 if exists(select 1 from received_document_products_v1(c,k,'2026-11-25')) then raise exception 'expired link listed'; end if;
 update pricing_document_share_links set expires_at=now()+interval '1 day';
 update pricing_documents set archived_at=now();
 if exists(select 1 from received_document_products_v1(c,k,'2026-11-25')) then raise exception 'archived document listed'; end if;
end $test$;
rollback;
-- Service-only RPC/helper access: explicit denial for both client roles.
do $test$ declare role_name text; begin
 foreach role_name in array array['anon','authenticated'] loop
  if has_function_privilege(role_name,'public.received_document_price_candidates_v1(uuid,uuid,date)','execute')
  or has_function_privilege(role_name,'public.self_order_price_v2(uuid,uuid,uuid,date,boolean)','execute')
  or has_function_privilege(role_name,'public.received_document_products_v1(uuid,uuid,date)','execute') then raise exception 'client RPC grant %',role_name; end if;
 end loop;
 if exists(select 1 from cx148c_functions_before b join pg_proc p on p.oid=b.oid where (p.proowner,p.proacl,p.prosecdef) is distinct from (b.proowner,b.proacl,b.prosecdef)) then raise exception 'wrapper metadata changed'; end if;
 if (select jsonb_agg(to_jsonb(v) order by id) from pricing_document_versions v) is distinct from (select versions from cx148c_data_before)
 or (select jsonb_agg(to_jsonb(f) order by company_id,customer_id,product_id) from price_fixture f) is distinct from (select prices from cx148c_data_before) then raise exception 'published or fixed prices changed'; end if;
end $test$;
\ir 2026-11-27-CX-148c-received-price-candidates.down.sql
do $test$ begin
 if to_regprocedure('public.received_document_price_candidates_v1(uuid,uuid,date)') is not null then raise exception 'down helper left'; end if;
 if exists(select 1 from cx148c_functions_before b join pg_proc p on p.oid=b.oid where pg_get_functiondef(p.oid) is distinct from b.definition or (p.proowner,p.proacl,p.prosecdef) is distinct from (b.proowner,b.proacl,b.prosecdef)) then raise exception 'down not exact'; end if;
end $test$;
select 'CX-148c PG17 passed: default sheet wins margin; candidate parity; service invoker; immutable data; exact down' as result;

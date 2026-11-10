\set ON_ERROR_STOP on
-- Only the disposable native member-order fixture, never operating data.
do $$ begin
 if current_database()<>'store_member_order_test_cx08' or current_setting('server_version_num')::int/10000<>17 then
  raise exception 'cx08_disposable_pg17_required';end if;
end $$;
create temporary table cx08_original as
 select oid,proacl,pg_get_functiondef(oid) definition from pg_proc where oid in
 ('public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)'::regprocedure,
  'public.place_store_member_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)'::regprocedure);
-- The adjacent settings-defaults patch must survive the CX-08 up/down unchanged.
\ir ../../docs/sql-drafts/20261110-09-order-settings-defaults.sql
create temporary table cx08_coexist as
 select oid,proacl,pg_get_functiondef(oid) definition from pg_proc where oid in(select oid from cx08_original);
\ir ../../docs/sql-drafts/20261110-CX-08-promotion-reservation.sql

do $$ begin
 if exists(select from cx08_coexist o join pg_proc p on p.oid=o.oid where p.proacl is distinct from o.proacl or p.prosecdef
  or pg_get_functiondef(p.oid)<>replace(o.definition,'and so.status = ''submitted'' and so.id <> v_order.id;','and so.status <> ''cancelled'' and so.id <> v_order.id;')) then raise exception 'cx08_changed_more_than_reservation_predicate';end if;
end $$;

insert into pricing_promotions(id,company_id,product_id,name,display_name,starts_on,ends_on,purchase_cost,margin_bp,price,stock,per_store_limit,tax_type,allow_sheet,badge,revision)
 values('c0080000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
 'CX08 synthetic','CX08 synthetic',current_date-1,'2099-12-31',800,0,1200,2,null,'exempt',true,'행사',1);
insert into pricing_document_versions(id,company_id,document_id,version,revision,content)
 select 'c0080000-0000-4000-8000-000000000002',company_id,document_id,2,1,
 jsonb_set(content,'{lines,0,promotionId}','"c0080000-0000-4000-8000-000000000001"') from pricing_document_versions where id='80000000-0000-4000-8000-000000000001';
update storefront_links set document_version_id='c0080000-0000-4000-8000-000000000002' where token_hash=repeat('a',64);
update normalized_customers set delivery_territory_id='10000000-0000-4000-8000-000000000001' where id='20000000-0000-4000-8000-000000000002';
insert into storefront_links(id,company_id,customer_id,document_version_id,token_nonce,token_hash,expires_at)
 values('c0080000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
 'c0080000-0000-4000-8000-000000000002',repeat('b',32),repeat('b',64),'2099-12-31');
create function public.cx08_place(mode text,client integer,quantity numeric default 1,order_id uuid default null,revision integer default null,key uuid default gen_random_uuid())
 returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare token text; lines jsonb;
begin
 if client not in(1,2) or mode not in('legacy','member') then raise exception 'cx08_invalid_test_input';end if;
 token:=repeat(case when client=1 then 'a' else 'b' end,64);
 lines:=jsonb_build_array(jsonb_build_object('productId','60000000-0000-4000-8000-000000000001','promotionId','c0080000-0000-4000-8000-000000000001','quantity',quantity));
 if mode='legacy' then return place_store_order(token,'2099-01-05',lines,key,order_id,revision,'CX08');end if;
 return place_store_member_order(token,'2099-01-05',lines,key,order_id,revision,'CX08',
 case when client=1 then '30000000-0000-4000-8000-000000000001'::uuid else '30000000-0000-4000-8000-000000000002'::uuid end,
 case when client=1 then '40000000-0000-4000-8000-000000000001'::uuid else '40000000-0000-4000-8000-000000000002'::uuid end,
 case when client=1 then '50000000-0000-4000-8000-000000000001'::uuid else '50000000-0000-4000-8000-000000000002'::uuid end);
end $$;
revoke all on function public.cx08_place(text,integer,numeric,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.cx08_place(text,integer,numeric,uuid,integer,uuid) to service_role;

begin;
set local role service_role;
do $$ declare mode text; state text; policy text; r jsonb;
begin
 foreach mode in array array['legacy','member'] loop
  foreach state in array array['submitted','received','in_delivery','delivered','cancelled'] loop
   foreach policy in array array['stock','per_store'] loop
    delete from store_order_requests;delete from store_order_lines;delete from store_orders;
    update pricing_promotions set stock=case when policy='stock' then 1 else null end,
      per_store_limit=case when policy='per_store' then 1 else null end where id='c0080000-0000-4000-8000-000000000001';
    r:=cx08_place(mode,1);update store_orders set status=state where id=(r->>'id')::uuid;
    if state='cancelled' then
      perform cx08_place(mode,case when policy='stock' then 2 else 1 end);
    else
      begin perform cx08_place(mode,case when policy='stock' then 2 else 1 end);raise exception 'cx08_reserved_quantity_ignored: %/%/%',mode,state,policy;
      exception when raise_exception then if sqlerrm<>'Promotion unavailable' then raise;end if;end;
      if (select count(*) from store_orders)<>1 then raise exception 'cx08_rejection_left_partial_order';end if;
    end if;
   end loop;
  end loop;
  -- Editing excludes its own old quantity; fractional quantities remain exact.
  delete from store_order_requests;delete from store_order_lines;delete from store_orders;
  update pricing_promotions set stock=3,per_store_limit=3 where id='c0080000-0000-4000-8000-000000000001';
  r:=cx08_place(mode,1,2);perform cx08_place(mode,1,3,(r->>'id')::uuid,1);
  if (select sum(quantity) from store_order_lines)<>3 then raise exception 'cx08_edit_counted_itself';end if;
  delete from store_order_requests;delete from store_order_lines;delete from store_orders;
  update pricing_promotions set stock=1,per_store_limit=null where id='c0080000-0000-4000-8000-000000000001';
  r:=cx08_place(mode,1,0.5);update store_orders set status='delivered' where id=(r->>'id')::uuid;
  perform cx08_place(mode,2,0.5);
  begin perform cx08_place(mode,2,0.001);raise exception 'cx08_fractional_oversell';
  exception when raise_exception then if sqlerrm<>'Promotion unavailable' then raise;end if;end;
 end loop;
end $$;
rollback;
\ir ../../docs/sql-drafts/20261110-CX-08-promotion-reservation.down.sql

do $$ begin
 if exists(select from cx08_coexist o join pg_proc p on p.oid=o.oid where o.definition<>pg_get_functiondef(p.oid) or o.proacl is distinct from p.proacl)
 then raise exception 'cx08_down_did_not_restore_coexisting_definition_acl';end if;
end $$;
\ir ../../docs/sql-drafts/20261110-09-order-settings-defaults.down.sql

do $$ begin
 if exists(select from cx08_original o join pg_proc p on p.oid=o.oid where o.definition<>pg_get_functiondef(p.oid) or o.proacl is distinct from p.proacl)
 then raise exception 'cx08_original_native_definitions_not_restored';end if;
end $$;
\ir ../../docs/sql-drafts/20261110-CX-08-promotion-reservation.sql
select 'cx08_all_states_stock_per_store_edit_fractional_and_down_pg17_pass';

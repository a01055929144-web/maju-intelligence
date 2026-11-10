\set ON_ERROR_STOP on
-- Only after the disposable member-order fixture. Never operating data.
do $$ begin
 if current_database()<>'store_member_order_test' or current_setting('server_version_num')::int/10000<>17 then
  raise exception 'disposable_member_order_pg17_required';
 end if;
end $$;
create temporary table defaults_original as
 select oid,proacl,md5(pg_get_functiondef(oid)) definition_hash from pg_proc
 where oid in ('public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)'::regprocedure,
 'public.place_store_member_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)'::regprocedure);
\ir ../../docs/sql-drafts/20261110-09-order-settings-defaults.sql
begin;
delete from store_order_settings where company_id='00000000-0000-4000-8000-000000000001';
set local role service_role;
do $$ declare r jsonb; begin
 r:=member_order_test_call();
 if not exists(select from store_orders where id=(r->>'id')::uuid and known_total=1200 and delivery_fee=0) then raise exception 'member_defaults_order_failed'; end if;
 r:=place_store_order(repeat('a',64),'2099-01-05','[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]',gen_random_uuid());
 if not exists(select from store_orders where id=(r->>'id')::uuid and known_total=1200 and delivery_fee=0) then raise exception 'legacy_defaults_order_failed'; end if;
 if exists(select from store_order_settings where company_id='00000000-0000-4000-8000-000000000001') then raise exception 'settings_row_was_generated'; end if;
 -- Still no bypass for missing weekdays or forged member.
 update store_order_territory_rules set delivery_weekdays=array[2]::smallint[] where company_id='00000000-0000-4000-8000-000000000001';
 begin perform member_order_test_call();raise exception 'wrong_weekday_allowed';
 exception when raise_exception then if sqlerrm<>'Delivery date unavailable' then raise; end if;end;
 delete from store_order_territory_rules where company_id='00000000-0000-4000-8000-000000000001';
 begin perform member_order_test_call();raise exception 'missing_weekdays_allowed';
 exception when raise_exception then if sqlerrm<>'Delivery date unavailable' then raise; end if;end;
 perform member_order_test_reject(null,null,null);
end $$;
rollback;
\ir ../../docs/sql-drafts/20261110-09-order-settings-defaults.down.sql
do $$ begin
 if exists(select from defaults_original o join pg_proc p on p.oid=o.oid where o.proacl is distinct from p.proacl or o.definition_hash<>md5(pg_get_functiondef(p.oid))) then raise exception 'defaults_down_did_not_restore_definition_acl';end if;
end $$;
select 'order_settings_absent_native_defaults_pg17_pass';

\set ON_ERROR_STOP on
do $$ begin
  if current_database()<>'store_member_order_test' or current_setting('server_version_num')::int/10000<>17
    then raise exception 'disposable_pending_delivery_pg17_required'; end if;
end $$;
create temporary table pending_native_functions as
select oid,md5(pg_get_functiondef(oid)) definition,proacl from pg_proc where oid in (
 'public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)'::regprocedure,
 'public.place_store_member_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)'::regprocedure);
\ir ../../docs/sql-drafts/20261110-09-pending-delivery-order.sql
\ir ../../docs/sql-drafts/20261110-09-pending-delivery-order.down.sql
\ir ../../docs/sql-drafts/20261110-09-pending-delivery-order.sql
begin;
create temporary table pending_case as
select a.id account,a.company_id company,a.customer_id customer,m.id member,m.auth_user_id auth,l.token_hash token
from store_accounts a join store_account_members m on m.company_id=a.company_id and m.store_account_id=a.id
join storefront_links l on l.company_id=a.company_id and l.customer_id=a.customer_id
where a.status='active' and a.business_status='active' and m.status='active' and m.role='owner'
and l.revoked_at is null and l.can_order and l.expires_at>now()
and exists(select 1 from store_order_settings s where s.company_id=a.company_id)
and exists(select 1 from store_order_customer_rules r where r.company_id=a.company_id and r.customer_id=a.customer_id and r.delivery_weekdays is not null)
limit 1;
grant select on pending_case to service_role;
set role service_role;
do $$ declare c record; begin
  select * into strict c from pending_case;
  begin
    perform place_store_pending_delivery_order(c.token,null,'[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]',gen_random_uuid(),null,null,'',c.account,c.member,c.auth);
    raise exception 'scheduled_policy_bypassed';
  exception when raise_exception then if sqlerrm<>'Delivery settings available' then raise; end if; end;
end $$;
reset role;
delete from store_order_settings where company_id=(select company from pending_case);
delete from store_order_customer_rules where company_id=(select company from pending_case) and customer_id=(select customer from pending_case);
update normalized_customers set delivery_territory_id=null where company_id=(select company from pending_case) and id=(select customer from pending_case);
set role service_role;
do $$ declare c record; r jsonb; retry jsonb; k uuid:=gen_random_uuid(); before_count int; begin
  select * into strict c from pending_case;
  select count(*) into before_count from store_orders;
  begin
    perform place_store_pending_delivery_order(c.token,null,'[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]',gen_random_uuid(),null,null,'',c.account,c.member,gen_random_uuid());
    raise exception 'forged_pending_actor';
  exception when raise_exception then if sqlerrm<>'Store member unavailable' then raise; end if; end;
  r:=place_store_pending_delivery_order(c.token,null,'[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]',k,null,null,'pending synthetic',c.account,c.member,c.auth);
  retry:=place_store_pending_delivery_order(c.token,null,'[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]',k,null,null,'pending synthetic',c.account,c.member,c.auth);
  if r is distinct from retry or r->>'deliveryConfirmation'<>'pending' or (select count(*) from store_orders)<>before_count+1
    or not exists(select 1 from store_orders where id=(r->>'id')::uuid and company_id=c.company and delivery_date is null and delivery_confirmation='pending' and status='submitted' and known_total>0)
    then raise exception 'pending_delivery_intake_failed'; end if;
  insert into store_order_customer_rules(company_id,customer_id,minimum_amount,minimum_policy)
    values(c.company,c.customer,1000000,'block');
  begin
    perform place_store_pending_delivery_order(c.token,null,'[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]',gen_random_uuid(),null,null,'',c.account,c.member,c.auth);
    raise exception 'pending_minimum_bypassed';
  exception when raise_exception then if sqlerrm<>'Minimum order not met' then raise; end if; end;
  if (select count(*) from store_orders)<>before_count+1 then raise exception 'pending_failure_left_order'; end if;
  update store_order_customer_rules set minimum_amount=0 where company_id=c.company and customer_id=c.customer;
  update storefront_links set can_order=false where token_hash=c.token;
  begin
    perform place_store_pending_delivery_order(c.token,null,'[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]',gen_random_uuid(),null,null,'',c.account,c.member,c.auth);
    raise exception 'review_disabled_link_ordered';
  exception when raise_exception then if sqlerrm<>'Link unavailable' then raise; end if; end;
  update storefront_links set can_order=true where token_hash=c.token;
  begin
    perform place_store_pending_delivery_order(c.token,null,'[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]',gen_random_uuid(),null,null,'',gen_random_uuid(),c.member,c.auth);
    raise exception 'cross_scope_pending_ordered';
  exception when raise_exception then if sqlerrm<>'Store member unavailable' then raise; end if; end;
  begin
    perform place_store_pending_delivery_order(c.token,null,'[{"productId":"60000000-0000-4000-8000-000000000001","quantity":2}]',k,null,null,'pending synthetic',c.account,c.member,c.auth);
    raise exception 'pending_key_conflict_allowed';
  exception when raise_exception then if sqlerrm<>'Idempotency conflict' then raise; end if; end;
  if has_function_privilege('anon','place_store_pending_delivery_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)','EXECUTE')
    or has_function_privilege('authenticated','place_store_pending_delivery_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)','EXECUTE') then raise exception 'pending_public_acl'; end if;
end $$;
reset role;
do $$ begin
  if exists(select 1 from pending_native_functions f join pg_proc p on p.oid=f.oid where f.definition<>md5(pg_get_functiondef(p.oid)) or f.proacl is distinct from p.proacl)
    then raise exception 'native_order_function_changed'; end if;
end $$;
commit;
select 'pending_delivery_order_pg17_pass';

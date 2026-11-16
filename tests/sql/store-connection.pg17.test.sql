-- Runs only after the disposable native full journey; never on a hosted database.
do $$ begin
  if current_database()<>'store_member_order_test' or current_setting('server_version_num')::int/10000<>17
    then raise exception 'disposable_store_connection_pg17_required'; end if;
end $$;
\ir ../../docs/sql-drafts/20261109-store-connection.sql
\ir ../../docs/sql-drafts/20261109-store-connection.down.sql
\ir ../../docs/sql-drafts/20261109-store-connection.sql
begin;
insert into app_users(id,status) values('ef000000-0000-4000-8000-000000000001','active');
create function store_connection_test_audit_failure() returns trigger language plpgsql as $$ begin
  if current_setting('test.connection_fail',true)='on' and new.reason='store_connection_closed'
    then raise exception 'synthetic_connection_audit_failure'; end if;
  return new;
end $$;
create trigger store_connection_test_audit_failure before insert on store_account_member_events
  for each row execute function store_connection_test_audit_failure();
set role service_role;
do $$
declare a store_accounts; owner store_account_members; staff uuid:=gen_random_uuid(); pending uuid:=gen_random_uuid(); orders_before int; events_before int;
begin
  select s.* into a from store_accounts s where status='active' and exists(select 1 from store_orders o where o.store_account_id=s.id) limit 1;
  if a.id is null then raise exception 'native_journey_order_required'; end if;
  select * into owner from store_account_members where company_id=a.company_id and store_account_id=a.id and role='owner' and status='active';
  select count(*) into orders_before from store_orders;
  insert into store_account_members(id,company_id,store_account_id,auth_user_id,role,status,joined_at)
    values(staff,a.company_id,a.id,'ef000000-0000-4000-8000-000000000001','staff','active',now());
  insert into store_account_members(id,company_id,store_account_id,role,status,invite_token_hash,invited_at)
    values(pending,a.company_id,a.id,'staff','invited',repeat('9',64),now());
  begin
    perform change_store_connection_v1(a.company_id,a.id,staff,'ef000000-0000-4000-8000-000000000001','close');
    raise exception 'staff_closed_store';
  exception when raise_exception then if sqlerrm<>'store_connection_forbidden' then raise; end if; end;
  begin
    perform change_store_connection_v1(a.company_id,a.id,owner.id,owner.auth_user_id,'leave');
    raise exception 'owner_left_store';
  exception when raise_exception then if sqlerrm<>'store_connection_forbidden' then raise; end if; end;
  begin
    perform change_store_connection_v1(gen_random_uuid(),a.id,owner.id,owner.auth_user_id,'close');
    raise exception 'cross_company_closed';
  exception when raise_exception then if sqlerrm<>'store_connection_unavailable' then raise; end if; end;
  begin
    perform change_store_connection_v1(a.company_id,a.id,owner.id,'ef000000-0000-4000-8000-000000000001','close');
    raise exception 'forged_actor_closed';
  exception when raise_exception then if sqlerrm<>'store_connection_forbidden' then raise; end if; end;
  perform change_store_connection_v1(a.company_id,a.id,staff,'ef000000-0000-4000-8000-000000000001','leave');
  if not exists(select 1 from store_accounts where id=a.id and status='active')
    or not exists(select 1 from store_account_members where id=owner.id and status='active')
    or not exists(select 1 from store_account_members where id=staff and status='removed') then raise exception 'leave_scope_failed'; end if;
  perform set_config('test.connection_fail','on',true);
  begin
    perform change_store_connection_v1(a.company_id,a.id,owner.id,owner.auth_user_id,'close');
    raise exception 'audit_failure_did_not_abort';
  exception when raise_exception then if sqlerrm<>'synthetic_connection_audit_failure' then raise; end if; end;
  perform set_config('test.connection_fail','off',true);
  if not exists(select 1 from store_accounts where id=a.id and status='active')
    or not exists(select 1 from store_account_members where id=owner.id and status='active')
    or not exists(select 1 from store_account_members where id=pending and status='invited' and invite_token_hash is not null)
    then raise exception 'connection_failure_not_atomic'; end if;
  perform change_store_connection_v1(a.company_id,a.id,owner.id,owner.auth_user_id,'close');
  if exists(select 1 from store_account_members where store_account_id=a.id and status in ('active','invited'))
    or exists(select 1 from storefront_links where company_id=a.company_id and customer_id=a.customer_id and (revoked_at is null or can_order))
    or not exists(select 1 from store_accounts where id=a.id and status='closed')
    or (select count(*) from store_orders)<>orders_before
    or not exists(select 1 from app_users where id=owner.auth_user_id and status='active') then raise exception 'close_scope_failed'; end if;
  select count(*) into events_before from store_account_member_events;
  begin
    perform place_store_member_order((select token_hash from storefront_links where company_id=a.company_id and customer_id=a.customer_id limit 1),
      '2099-01-05','[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]',gen_random_uuid(),null,null,'',a.id,owner.id,owner.auth_user_id);
    raise exception 'closed_store_ordered';
  exception when raise_exception then if sqlerrm<>'Store member unavailable' then raise; end if; end;
  begin
    perform change_store_connection_v1(a.company_id,a.id,owner.id,owner.auth_user_id,'close');
    raise exception 'closed_store_changed_again';
  exception when raise_exception then if sqlerrm<>'store_connection_unavailable' then raise; end if; end;
  if (select count(*) from store_account_member_events)<>events_before then raise exception 'duplicate_removal_audit'; end if;
  if has_function_privilege('anon','change_store_connection_v1(uuid,uuid,uuid,uuid,text)','EXECUTE')
    or has_function_privilege('authenticated','change_store_connection_v1(uuid,uuid,uuid,uuid,text)','EXECUTE') then raise exception 'public_connection_access'; end if;
end $$;
reset role;
rollback;
select 'store_connection_pg17_pass';

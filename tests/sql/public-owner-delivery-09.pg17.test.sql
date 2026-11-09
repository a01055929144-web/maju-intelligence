\set ON_ERROR_STOP on
do $$ begin
  if current_database()<>'store_member_order_test' or current_setting('server_version_num')::int/10000<>17
    then raise exception 'disposable_public_owner_delivery_pg17_required'; end if;
end $$;
-- Runs after the real P1/P2/S2/member/public-activation journey; surrounding rows are synthetic.
alter table delivery_territories add column if not exists is_active boolean not null default true;
grant select,update on delivery_territories,store_order_territory_rules to service_role;
\ir ../../docs/sql-drafts/20261109-09-public-owner-delivery.sql
\ir ../../docs/sql-drafts/20261109-09-public-owner-delivery.down.sql
\ir ../../docs/sql-drafts/20261109-09-public-owner-delivery.sql
insert into delivery_territories(id,company_id) values
  ('e1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'),
  ('e1000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001');
insert into app_users values('e2000000-0000-4000-8000-000000000001','active');
grant select,update on delivery_territories to service_role;
-- Force a failure AFTER the existing activation has run, to test full statement rollback.
create function public.public_owner_delivery_fail_fixture() returns trigger language plpgsql as $$ begin
  if current_setting('test.force_delivery_failure',true)='on' then raise exception 'synthetic_delivery_assignment_failure'; end if;
  return new;
end $$;
create trigger public_owner_delivery_fail_fixture before update of delivery_territory_id on normalized_customers
  for each row execute function public.public_owner_delivery_fail_fixture();
set role service_role;
do $$ declare activated jsonb; customer uuid; ordered jsonb; before_accounts bigint;
begin
  perform prepare_public_store_owner_activation_v1('00000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001',repeat('4',64));
  perform complete_public_store_owner_profile_v1(repeat('4',64),'synthetic public store','synthetic representative',
    'synthetic matched area',repeat('0',11),repeat('9',10));
  select count(*) into before_accounts from store_accounts;
  begin
    perform activate_public_store_owner_with_delivery_v1(repeat('4',64),'e2000000-0000-4000-8000-000000000001',
      '2026-11-07',clock_timestamp(),repeat('9',10),'active',clock_timestamp(),'public-delivery-v1:synthetic',
      'e1000000-0000-4000-8000-000000000001');
    raise exception 'cross_company_delivery_accepted';
  exception when raise_exception then if sqlerrm<>'public_delivery_territory_unavailable' then raise; end if; end;
  begin
    perform activate_public_store_owner_with_delivery_v1(repeat('4',64),'e2000000-0000-4000-8000-000000000001',
      '2026-11-07',clock_timestamp(),repeat('9',10),'active',clock_timestamp(),'public-delivery-v1:synthetic',
      'e1000000-0000-4000-8000-000000000002');
    raise exception 'missing_delivery_rule_accepted';
  exception when raise_exception then if sqlerrm<>'public_delivery_rules_unavailable' then raise; end if; end;
  if (select count(*) from store_accounts)<>before_accounts or
    exists(select 1 from store_owner_activation_requests where invite_token_hash=repeat('4',64) and consumed_at is not null)
    then raise exception 'failed_delivery_created_or_consumed_owner'; end if;
  perform set_config('test.force_delivery_failure','on',true);
  begin
    perform activate_public_store_owner_with_delivery_v1(repeat('4',64),'e2000000-0000-4000-8000-000000000001',
      '2026-11-07',clock_timestamp(),repeat('9',10),'active',clock_timestamp(),'public-delivery-v1:synthetic',
      '10000000-0000-4000-8000-000000000001');
    raise exception 'partial_activation_survived_delivery_failure';
  exception when raise_exception then if sqlerrm<>'synthetic_delivery_assignment_failure' then raise; end if; end;
  perform set_config('test.force_delivery_failure','off',true);
  if (select count(*) from store_accounts)<>before_accounts or
    exists(select 1 from store_account_members where auth_user_id='e2000000-0000-4000-8000-000000000001') or
    exists(select 1 from store_owner_activation_requests where invite_token_hash=repeat('4',64)
      and (consumed_at is not null or customer_id is not null))
    then raise exception 'public_delivery_partial_rows_not_rolled_back'; end if;
  activated:=activate_public_store_owner_with_delivery_v1(repeat('4',64),'e2000000-0000-4000-8000-000000000001',
    '2026-11-07',clock_timestamp(),repeat('9',10),'active',clock_timestamp(),'public-delivery-v1:synthetic',
    '10000000-0000-4000-8000-000000000001');
  select customer_id into customer from store_accounts where id=(activated->>'storeAccountId')::uuid;
  if not exists(select 1 from normalized_customers where id=customer
      and company_id='00000000-0000-4000-8000-000000000001'
      and delivery_territory_id='10000000-0000-4000-8000-000000000001') or
    exists(select 1 from store_order_customer_rules where customer_id=customer)
    then raise exception 'public_delivery_was_not_native_territory_rule'; end if;
  perform issue_storefront_links('00000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object('id','e4000000-0000-4000-8000-000000000001','customerId',customer,
      'nonce',repeat('3',32),'hash',repeat('3',64))),now()+interval '14 days',
    'e2000000-0000-4000-8000-000000000001',repeat('b',64));
  ordered:=place_store_member_order(repeat('3',64),'2099-01-05',
    '[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]',
    'e5000000-0000-4000-8000-000000000001',null,null,'synthetic native territory order',
    (activated->>'storeAccountId')::uuid,(activated->>'ownerMemberId')::uuid,'e2000000-0000-4000-8000-000000000001');
  if not exists(select 1 from store_orders where id=(ordered->>'id')::uuid and customer_id=customer)
    then raise exception 'public_owner_native_first_order_failed'; end if;
end $$;
reset role;
drop trigger public_owner_delivery_fail_fixture on normalized_customers;
drop function public.public_owner_delivery_fail_fixture();
-- A real history row must make the actual down refuse without dropping the function or data.
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/20261109-09-public-owner-delivery.down.sql
\set ON_ERROR_STOP on
do $$ begin
  if to_regproc('public.activate_public_store_owner_with_delivery_v1') is null or
    not exists(select 1 from store_accounts where verification_request_id='public-delivery-v1:synthetic') or
    has_function_privilege('anon','public.activate_public_store_owner_with_delivery_v1(text,uuid,text,timestamptz,text,text,timestamptz,text,uuid)','EXECUTE') or
    has_function_privilege('authenticated','public.activate_public_store_owner_with_delivery_v1(text,uuid,text,timestamptz,text,text,timestamptz,text,uuid)','EXECUTE')
    then raise exception 'public_delivery_function_or_acl_changed'; end if;
end $$;
select 'public_owner_native_delivery_first_order_pg17_pass';

\set ON_ERROR_STOP on
do $$ begin
  if current_database()<>'store_member_order_test' or current_setting('server_version_num')::int/10000<>17
    then raise exception 'disposable_store_preopening_pg17_required'; end if;
end $$;
-- The existing full journey has installed the real public-owner and member-order RPCs.
alter table delivery_territories add column if not exists is_active boolean not null default true;
grant select on delivery_territories,store_order_territory_rules to service_role;
\ir ../../docs/sql-drafts/20261110-store-preopening.sql
\ir ../../docs/sql-drafts/20261110-preopening-customer-match.sql
\ir ../../docs/sql-drafts/20261110-public-owner-base-address.sql
insert into app_users values('f2000000-0000-4000-8000-000000000001','active');
set role service_role;
do $$ declare activated jsonb; ordered jsonb; customer uuid;
begin
  insert into normalized_customers(id,company_id,customer_name,address,normalized_key)
    values('f6000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',
      'synthetic preopening store','synthetic road 1 suite 2','existing-preopening-candidate');
  perform prepare_public_store_owner_activation_v1('00000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000001',repeat('7',64));
  perform complete_public_store_owner_profile_v2(repeat('7',64),'synthetic preopening store','synthetic owner',
    'synthetic road 1 suite 2','synthetic road 1','suite 2',repeat('0',11),'');
  begin
    perform activate_preopening_store_owner_v1(repeat('7',64),'f2000000-0000-4000-8000-000000000001',
      '2026-11-07',clock_timestamp(),'e1000000-0000-4000-8000-000000000001');
    raise exception 'cross_company_territory_accepted';
  exception when raise_exception then if sqlerrm<>'public_delivery_territory_unavailable' then raise; end if; end;
  if exists(select 1 from store_accounts where business_status='registration_pending')
    then raise exception 'failed_preopening_created_account'; end if;
  activated:=activate_preopening_store_owner_v1(repeat('7',64),'f2000000-0000-4000-8000-000000000001',
    '2026-11-07',clock_timestamp(),'10000000-0000-4000-8000-000000000001');
  select customer_id into customer from store_accounts where id=(activated->>'storeAccountId')::uuid
    and company_id='00000000-0000-4000-8000-000000000001' and business_status='registration_pending'
    and business_registration_number is null and business_status_verified_at is null and verification_request_id is null;
  if customer is null or not exists(select 1 from normalized_customers where id=customer
    and business_registration_number is null and delivery_territory_id='10000000-0000-4000-8000-000000000001'
    and delivery_base_address='synthetic road 1' and delivery_address_detail='suite 2')
    then raise exception 'preopening_profile_or_territory_missing'; end if;
  if customer<>'f6000000-0000-4000-8000-000000000001' or
    (select count(*) from normalized_customers where company_id='00000000-0000-4000-8000-000000000001'
      and lower(customer_name)='synthetic preopening store' and lower(address)='synthetic road 1 suite 2')<>1
    then raise exception 'preopening_existing_customer_not_reused'; end if;
  perform issue_storefront_links('00000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object('id','f4000000-0000-4000-8000-000000000001','customerId',customer,
      'nonce',repeat('7',32),'hash',repeat('7',64))),now()+interval '14 days',
    'f2000000-0000-4000-8000-000000000001',repeat('b',64));
  ordered:=place_store_member_order(repeat('7',64),'2099-01-05',
    '[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]',
    'f5000000-0000-4000-8000-000000000001',null,null,'synthetic preopening order',
    (activated->>'storeAccountId')::uuid,(activated->>'ownerMemberId')::uuid,'f2000000-0000-4000-8000-000000000001');
  if not exists(select 1 from store_orders where id=(ordered->>'id')::uuid and customer_id=customer)
    then raise exception 'preopening_first_order_missing'; end if;
end $$;
reset role;
select 'store_preopening_pg17_pass';

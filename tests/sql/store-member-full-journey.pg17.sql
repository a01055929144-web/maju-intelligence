\set ON_ERROR_STOP on

-- Disposable PG17 journey. The base member-order fixture must run first.
do $$ begin
  if current_database() <> 'store_member_order_test'
    or current_setting('server_version_num')::integer / 10000 <> 17 then
    raise exception 'disposable_store_member_order_pg17_required';
  end if;
end $$;

\ir ../../docs/sql-drafts/20261105-store-kakao-membership.sql
\ir ../../docs/sql-drafts/20261107-store-owner-activation.sql
\ir ../../docs/sql-drafts/20261108-store-member-removal.sql

insert into normalized_customers(id,company_id,customer_name,business_registration_number,delivery_territory_id)
values('c1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',
  'full journey store','1234567890','10000000-0000-4000-8000-000000000001');
insert into company_members(id,company_id,user_id,role,status,permission_role)
values('c2000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000002','owner','active','owner');
insert into app_users values
 ('c3000000-0000-4000-8000-000000000001','active'),
 ('c3000000-0000-4000-8000-000000000002','active'),
 ('c3000000-0000-4000-8000-000000000003','active');
insert into storefront_links(id,company_id,customer_id,document_version_id,token_nonce,token_hash,expires_at)
values('c4000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001',repeat('e',32),repeat('e',64),'2099-12-31');

-- FOR SHARE requires the production service role's existing read/update access.
grant select,update on normalized_customers to service_role;

set role service_role;
do $$
declare
  activated jsonb;
  invited jsonb;
  owner_id uuid;
  manager_id uuid;
  staff_id uuid;
  store_id uuid;
  owner_order jsonb;
  manager_order jsonb;
  staff_order jsonb;
begin
  perform prepare_store_owner_activation_v1(
    '00000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001',repeat('f',64));
  activated := activate_store_owner_v1(
    repeat('f',64),'c3000000-0000-4000-8000-000000000001','2026-11-08',clock_timestamp(),
    '1234567890','active',clock_timestamp(),'c5000000-0000-4000-8000-000000000001');
  owner_id := (activated->>'ownerMemberId')::uuid;
  store_id := (activated->>'storeAccountId')::uuid;

  invited := create_store_member_invitation_v1(
    '00000000-0000-4000-8000-000000000001',store_id,owner_id,'manager',repeat('c',64));
  manager_id := (invited->>'id')::uuid;
  perform accept_store_member_invitation_v1(
    '00000000-0000-4000-8000-000000000001',store_id,
    'c3000000-0000-4000-8000-000000000002',repeat('c',64));

  invited := create_store_member_invitation_v1(
    '00000000-0000-4000-8000-000000000001',store_id,manager_id,'staff',repeat('d',64));
  staff_id := (invited->>'id')::uuid;
  perform accept_store_member_invitation_v1(
    '00000000-0000-4000-8000-000000000001',store_id,
    'c3000000-0000-4000-8000-000000000003',repeat('d',64));

  owner_order := place_store_member_order(repeat('e',64),'2099-01-05',
    '[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]',
    'c6000000-0000-4000-8000-000000000001',null,null,'',store_id,owner_id,
    'c3000000-0000-4000-8000-000000000001');
  manager_order := place_store_member_order(repeat('e',64),'2099-01-05',
    '[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]',
    'c6000000-0000-4000-8000-000000000002',null,null,'',store_id,manager_id,
    'c3000000-0000-4000-8000-000000000002');
  staff_order := place_store_member_order(repeat('e',64),'2099-01-05',
    '[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]',
    'c6000000-0000-4000-8000-000000000003',null,null,'',store_id,staff_id,
    'c3000000-0000-4000-8000-000000000003');

  if not exists(select 1 from store_orders where id=(owner_order->>'id')::uuid and ordered_by_member_id=owner_id)
    or not exists(select 1 from store_orders where id=(manager_order->>'id')::uuid and ordered_by_member_id=manager_id)
    or not exists(select 1 from store_orders where id=(staff_order->>'id')::uuid and ordered_by_member_id=staff_id) then
    raise exception 'full_journey_order_actor_missing';
  end if;

  perform remove_store_member_v1('00000000-0000-4000-8000-000000000001',store_id,manager_id,staff_id);
  begin
    perform place_store_member_order(repeat('e',64),'2099-01-05',
      '[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]',
      'c6000000-0000-4000-8000-000000000004',null,null,'',store_id,staff_id,
      'c3000000-0000-4000-8000-000000000003');
    raise exception 'removed_staff_ordered';
  exception when raise_exception then if sqlerrm <> 'Store member unavailable' then raise; end if; end;

  perform remove_store_member_v1('00000000-0000-4000-8000-000000000001',store_id,owner_id,manager_id);
  begin
    perform place_store_member_order(repeat('e',64),'2099-01-05',
      '[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]',
      'c6000000-0000-4000-8000-000000000005',null,null,'',store_id,manager_id,
      'c3000000-0000-4000-8000-000000000002');
    raise exception 'removed_manager_ordered';
  exception when raise_exception then if sqlerrm <> 'Store member unavailable' then raise; end if; end;

  if not exists(select 1 from store_orders where id=(staff_order->>'id')::uuid and ordered_by_member_id=staff_id)
    or not exists(select 1 from store_account_members where id=staff_id and status='removed' and removed_by_member_id=manager_id)
    or not exists(select 1 from store_account_members where id=manager_id and status='removed' and removed_by_member_id=owner_id)
    or (select count(*) from store_account_member_events where store_account_id=store_id and event_type in ('invite','join','remove')) <> 7 then
    raise exception 'full_journey_history_or_events_missing';
  end if;
end $$;
reset role;

-- Public owner -> first member order, in this exact disposable PG17 database only.
-- Surrounding synthetic schema fills fields not needed by the earlier existing-customer journey.
alter table normalized_customers alter column id set default gen_random_uuid();
alter table normalized_customers add column representative_name text;
alter table pricing_documents add column if not exists archived_at timestamptz;
create table pricing_document_share_links(
  id uuid primary key,company_id uuid not null,document_id uuid not null,document_version_id uuid not null,
  expires_at timestamptz not null,revoked_at timestamptz,
  foreign key(company_id,document_id) references pricing_documents(company_id,id),
  foreign key(company_id,document_version_id) references pricing_document_versions(company_id,id)
);
insert into pricing_document_share_links values('d1000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000001',now()+interval '365 days',null);
insert into app_users values('d2000000-0000-4000-8000-000000000001','active');
grant select,update on pricing_document_share_links to service_role;
grant select,insert,update on normalized_customers,customer_imports to service_role;
grant select on business_documents to service_role;
set role service_role;
do $$
declare activated jsonb; ordered jsonb; retried jsonb; customer uuid; ledger_before bigint;
begin
  select count(*) into ledger_before from business_documents;
  perform prepare_public_store_owner_activation_v1('00000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001',repeat('6',64));
  perform complete_public_store_owner_profile_v1(repeat('6',64),'synthetic test store','synthetic representative',
    'synthetic address',repeat('0',11),repeat('8',10));
  activated:=activate_store_owner_v1(repeat('6',64),'d2000000-0000-4000-8000-000000000001',
    '2026-11-07',clock_timestamp(),repeat('8',10),'active',clock_timestamp(),'test-only:synthetic-verification');
  select customer_id into customer from store_accounts where id=(activated->>'storeAccountId')::uuid;
  -- Mirrors the scoped test-only API preparation; all native order constraints remain in force.
  insert into store_order_customer_rules(company_id,customer_id,delivery_weekdays)
    values('00000000-0000-4000-8000-000000000001',customer,array[0,1,2,3,4,5,6]::smallint[])
    on conflict(company_id,customer_id) do nothing;
  perform issue_storefront_links('00000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object('id','d4000000-0000-4000-8000-000000000001','customerId',customer,
      'nonce',repeat('5',32),'hash',repeat('5',64))),now()+interval '14 days',
    'd2000000-0000-4000-8000-000000000001',repeat('b',64));
  ordered:=place_store_member_order(repeat('5',64),'2099-01-05',
    '[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]',
    'd5000000-0000-4000-8000-000000000001',null,null,'synthetic test order',
    (activated->>'storeAccountId')::uuid,(activated->>'ownerMemberId')::uuid,'d2000000-0000-4000-8000-000000000001');
  retried:=place_store_member_order(repeat('5',64),'2099-01-05',
    '[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]',
    'd5000000-0000-4000-8000-000000000001',null,null,'synthetic test order',
    (activated->>'storeAccountId')::uuid,(activated->>'ownerMemberId')::uuid,'d2000000-0000-4000-8000-000000000001');
  if ordered->>'id' is distinct from retried->>'id' or
    (select count(*) from store_orders where customer_id=customer)<>1 or
    not exists(select 1 from store_accounts where id=(activated->>'storeAccountId')::uuid
      and verification_request_id='test-only:synthetic-verification') or
    (select count(*) from business_documents)<>ledger_before then raise exception 'isolated_public_owner_order_failed'; end if;
end $$;
reset role;
select 'isolated_public_owner_first_order_pg17_pass';
select 'store_member_full_journey_pg17_pass';

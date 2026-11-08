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

-- The production application service role already reads the customer master.
grant select on normalized_customers to service_role;

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

select 'store_member_full_journey_pg17_pass';

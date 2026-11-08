\set ON_ERROR_STOP on
do $$ begin
  if current_database()<>'store_member_order_test_delivery_09' or current_setting('server_version_num')::integer/10000<>17 then
    raise exception 'disposable_delivery_09_pg17_database_required';
  end if;
end $$;
-- Reuse real P0/P1/P2/S2/member migrations and their existing isolated compatibility tests.
\ir store-member-order.pg17.test.sql
-- Read the 02 draft as a prerequisite; never edit or apply it to an operating DB here.
\ir ../../docs/sql-drafts/20261108-stage-d-delivery-snapshot-02.sql
update public.normalized_customers set address='synthetic delivery address'
  where id='20000000-0000-4000-8000-000000000001';
update public.normalized_customers set address='other synthetic address'
  where id in('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003');
insert into public.storefront_links(id,company_id,customer_id,document_version_id,token_nonce,token_hash,expires_at) values
 ('90000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
  '80000000-0000-4000-8000-000000000001',repeat('c',32),repeat('c',64),'2099-12-31');

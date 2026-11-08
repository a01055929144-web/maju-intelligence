\set ON_ERROR_STOP on
do $$ begin
  if current_database() not in('store_member_order_test_delivery_09','store_member_order_test_delivery_09_api')
    or current_setting('server_version_num')::integer/10000<>17 then
    raise exception 'disposable_delivery_09_pg17_database_required';
  end if;
end $$;
-- Reuse real P0/P1/P2/S2/member migrations and their existing isolated compatibility tests.
\ir store-member-order.pg17.test.sql
-- Real existing proof tables; minimal storage bucket scaffold is fixture-only.
create schema if not exists storage;
create table if not exists storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
\ir ../../supabase/migrations/20260709_customer_operations.sql
-- Existing N1 referenced key, normally supplied by 20261026223523_delivery_sales_structure_20261027.sql.
alter table public.customer_notes add constraint customer_notes_company_customer_id_uq unique(company_id,customer_id,id);
grant select,update on public.customer_notes,public.customer_attachments to service_role;
insert into public.customer_notes(id,company_id,customer_id,note_type,memo)
select ('a1000000-0000-4000-8000-00000000000'||n)::uuid,
  case when n=4 then '00000000-0000-4000-8000-000000000002'::uuid else '00000000-0000-4000-8000-000000000001'::uuid end,
  case when n=3 then '20000000-0000-4000-8000-000000000002'::uuid when n=4 then '20000000-0000-4000-8000-000000000003'::uuid else '20000000-0000-4000-8000-000000000001'::uuid end,
  case when n=5 then 'general' else 'delivery' end,'synthetic proof' from generate_series(1,5) n;
insert into public.customer_attachments(id,company_id,customer_id,attachment_type,title)
select ('a2000000-0000-4000-8000-00000000000'||n)::uuid,company_id,customer_id,
  case when n=5 then 'etc' else 'delivery_proof' end,'synthetic image' from generate_series(1,5) n
  join public.customer_notes on id=('a1000000-0000-4000-8000-00000000000'||n)::uuid;
-- Read the 02 draft as a prerequisite; never edit or apply it to an operating DB here.
\ir ../../docs/sql-drafts/20261108-stage-d-delivery-snapshot-02.sql
update public.normalized_customers set address='synthetic delivery address'
  where id='20000000-0000-4000-8000-000000000001';
update public.normalized_customers set address='other synthetic address'
  where id in('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003');
insert into public.storefront_links(id,company_id,customer_id,document_version_id,token_nonce,token_hash,expires_at) values
 ('90000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
  '80000000-0000-4000-8000-000000000001',repeat('c',32),repeat('c',64),'2099-12-31');

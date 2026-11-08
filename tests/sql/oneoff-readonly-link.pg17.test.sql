\set ON_ERROR_STOP on
do $$ begin
 if current_database()<>'oneoff_readonly_link_test' or current_setting('server_version_num')::integer/10000<>17 then
  raise exception 'disposable_loopback_PG17_required';
 end if;
end $$;
\ir pricing-p1-fixture.sql
\ir ../../supabase/migrations/20261102114600_pricing_p0.sql
\ir ../../supabase/migrations/20261102114601_pricing_p1.sql
\ir pricing-p2-fixture.sql
\ir ../../supabase/migrations/20261102114602_pricing_p2_store_ordering.sql
insert into companies values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into normalized_customers(id,company_id,customer_name) values
 ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','synthetic one-off'),
 ('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','synthetic other company');
insert into pricing_documents(id,company_id,owner_key,kind,revision,content) values
 ('70000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',repeat('b',64),'quote',1,
 '{"kind":"quote","title":"synthetic","companyName":"synthetic","validUntil":"2099-12-31","theme":"blue","layout":"table","showPrice":true,"showBrand":true,"showSpec":true,"lines":[]}');
insert into pricing_document_versions(id,company_id,document_id,version,revision,content,published_at)
 select '80000000-0000-4000-8000-000000000001',company_id,id,1,1,content,now() from pricing_documents;
grant select on public.normalized_customers to service_role;

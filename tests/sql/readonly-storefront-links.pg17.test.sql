\set ON_ERROR_STOP on
do $$ begin
 if current_database()<>'readonly_link_patch_test' or current_setting('server_version_num')::integer/10000<>17 then
  raise exception 'disposable_loopback_PG17_required';
 end if;
end $$;
\ir pricing-p1-fixture.sql
\ir ../../supabase/migrations/20261102114600_pricing_p0.sql
\ir ../../supabase/migrations/20261102114601_pricing_p1.sql
\ir pricing-p2-fixture.sql
\ir ../../supabase/migrations/20261102114602_pricing_p2_store_ordering.sql
create table public.customer_imports(id uuid primary key default gen_random_uuid(),company_id uuid not null references companies,
 source text not null default 'excel',row_count integer not null default 0,status text not null default 'completed',
 quality_score integer not null default 0,completed_at timestamptz);
alter table public.normalized_customers add column import_id uuid references customer_imports,
 add column phone text,add column business_registration_number text,add column normalized_key text;
create table public.business_permit_leads(id uuid primary key,company_id uuid not null references companies,
 business_name text not null,address text,phone text,source text not null default 'manual_upload',is_active boolean not null default true,
 matched_customer_id uuid,is_duplicate boolean not null default false,status text not null default '신규 수집',
 updated_at timestamptz not null default now(),merged_into_lead_id uuid,unique(company_id,id));
alter table public.customer_price_agreements alter column id set default gen_random_uuid(),
 add column created_by_name text,add column ended_at timestamptz,add column updated_at timestamptz default now();
\ir ../../supabase/migrations/20261102124354_s2_sales_to_order_acceptance_20261102.sql
\ir ../../supabase/migrations/20261108113000_s2_acceptance_order_link_20261108.sql
insert into companies values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into normalized_customers(id,company_id,customer_name) values
 ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','synthetic one-off'),
 ('20000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','synthetic normal issue'),
 ('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','synthetic other company');
insert into pricing_documents(id,company_id,owner_key,kind,revision,content) values
 ('70000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',repeat('b',64),'quote',1,
 '{"kind":"quote","title":"synthetic","companyName":"synthetic","validUntil":"2099-12-31","theme":"blue","layout":"table","showPrice":true,"showBrand":true,"showSpec":true,"lines":[]}');
insert into product_catalog(id,company_id,purchase_product_name,purchase_price,sales_unit,tax_type) values
 ('60000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','synthetic internal',800,'BOX','exempt');
update pricing_documents set content=jsonb_set(content,'{lines}','[{"productId":"60000000-0000-4000-8000-000000000001","displayName":"synthetic","unit":"BOX","taxType":"exempt","price":1200,"visible":true}]');
insert into pricing_document_versions(id,company_id,document_id,version,revision,content,published_at)
 select '80000000-0000-4000-8000-000000000001',company_id,id,1,1,content,now() from pricing_documents;
grant select on public.normalized_customers to service_role;
grant select on public.customer_price_agreements,public.business_permit_leads to service_role;
insert into store_order_settings(company_id) values('00000000-0000-4000-8000-000000000001');
insert into business_permit_leads(id,company_id,business_name,matched_customer_id) values
 ('b0000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','synthetic existing lead','20000000-0000-4000-8000-000000000001');

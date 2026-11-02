\set ON_ERROR_STOP on
do $$ begin
  if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;

drop schema if exists public cascade; create schema public;
grant usage on schema public to public;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create table companies(id uuid primary key);
create table customer_imports(id uuid primary key default gen_random_uuid(),company_id uuid not null references companies(id),source text not null default 'excel',row_count integer not null default 0,status text not null default 'completed',quality_score integer not null default 0,completed_at timestamptz);
create table normalized_customers(id uuid primary key default gen_random_uuid(),company_id uuid not null references companies(id),import_id uuid not null references customer_imports(id),customer_name text not null,address text,phone text,business_registration_number text,normalized_key text not null,unique(company_id,id),unique(company_id,normalized_key));
create table business_permit_leads(id uuid primary key default gen_random_uuid(),company_id uuid not null references companies(id),business_name text not null,address text,phone text,source text not null default 'manual_upload',is_active boolean not null default true,matched_customer_id uuid,is_duplicate boolean not null default false,status text not null default '신규 수집',updated_at timestamptz not null default now(),unique(company_id,id));
create table product_catalog(id uuid primary key,company_id uuid not null references companies(id),sales_unit text,tax_type text,is_active boolean not null default true,unique(company_id,id));
create table pricing_documents(id uuid primary key,company_id uuid not null references companies(id),owner_key text not null,kind text not null,revision integer not null,content jsonb not null,unique(company_id,id));
create table pricing_document_versions(id uuid primary key,company_id uuid not null references companies(id),document_id uuid not null,version integer not null,revision integer not null,content jsonb not null,published_at timestamptz not null default now(),unique(company_id,document_id,version),unique(company_id,document_id,revision),foreign key(company_id,document_id) references pricing_documents(company_id,id));
create unique index pricing_document_versions_company_id_id_uq on pricing_document_versions(company_id,id);
create table customer_price_agreements(id uuid primary key default gen_random_uuid(),company_id uuid not null,customer_id uuid not null,product_catalog_id uuid not null,sales_unit text not null,unit_price bigint not null,tax_type text not null,unique(company_id,id));
alter table customer_price_agreements add column price_includes_tax boolean not null default false, add column effective_from date not null default current_date, add column effective_until date, add column status text not null default 'active', add column created_by_name text, add column ended_at timestamptz, add column updated_at timestamptz not null default now();
create table storefront_links(id uuid primary key default gen_random_uuid(),company_id uuid not null,customer_id uuid not null,document_version_id uuid not null,revoked_at timestamptz,can_order boolean not null default true,unique(company_id,id));
create table store_orders(id uuid primary key default gen_random_uuid(),company_id uuid not null,unique(company_id,id));

\ir 20261102-S2-sales-to-order-acceptance.sql

insert into companies values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into customer_imports(id,company_id) values('90000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
insert into normalized_customers(id,company_id,import_id,customer_name,normalized_key) values('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','existing','existing');
insert into business_permit_leads values('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','ambiguous shop');
insert into product_catalog values('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','BOX','taxable',true);
insert into pricing_documents values('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',repeat('a',64),'sheet',1,'{}');
-- 작성 중 문서는 pricing_documents에 저장되며 게시 검증 트리거 대상이 아니다.
insert into pricing_documents values('40000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',repeat('b',64),'sheet',1,'{"lines":[{"visible":true,"productId":"30000000-0000-4000-8000-000000000001","unit":"EA","taxType":"unknown"}]}');

do $$ begin
  begin
    insert into pricing_document_versions(id,company_id,document_id,version,revision,content) values('50000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',9,9,'{"lines":[{"visible":true,"productId":"30000000-0000-4000-8000-000000000001","unit":"EA","taxType":"taxable"}]}');
    raise exception 'unit validation did not fail';
  exception when others then if sqlerrm='unit validation did not fail' then raise; end if; end;
end $$;
do $$ begin
  begin
    insert into pricing_document_versions(id,company_id,document_id,version,revision,content) values('50000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',8,8,'{"lines":[{"visible":true,"productId":"30000000-0000-4000-8000-000000000001","unit":"BOX","taxType":"taxable"},{"visible":true,"productId":"30000000-0000-4000-8000-000000000001","unit":"BOX","taxType":"taxable"}]}');
    raise exception 'duplicate product validation did not fail';
  exception when others then if sqlerrm='duplicate product validation did not fail' then raise; end if; end;
end $$;
insert into pricing_document_versions(id,company_id,document_id,version,revision,content) values('50000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',1,1,'{"lines":[{"visible":true,"productId":"30000000-0000-4000-8000-000000000001","unit":"BOX","taxType":"taxable"}]}');

insert into pricing_document_sends(company_id,document_id,document_version_id,lead_id,template_id,layout,channel,idempotency_key,sent_by_key)
values('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','sheet-v1','table','kakao','60000000-0000-4000-8000-000000000001','staff:1');
do $$ begin
  begin
    insert into pricing_document_sends(company_id,document_id,document_version_id,lead_id,customer_id,template_id,layout,channel,idempotency_key,sent_by_key)
    values('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','bad','table','link','60000000-0000-4000-8000-000000000002','staff:1');
    raise exception 'send xor did not fail';
  exception when check_violation then null; end;
end $$;

do $$ declare a jsonb; b jsonb; begin
  a:=record_pricing_document_acceptance('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',repeat('f',64),'kakao_login','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',null,true,'ambiguous_lead_match',null,'{"deliveryDropLocation":"rear door"}');
  b:=record_pricing_document_acceptance('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',repeat('f',64),'kakao_login','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',null,true,'ambiguous_lead_match',null,'{"deliveryDropLocation":"rear door"}');
  if a<>b or a->>'needsReview'<>'true' then raise exception 'acceptance idempotency/review failed'; end if;
end $$;

insert into business_permit_leads(id,company_id,business_name,address,phone) values
('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','same one','A','01012345678'),
('20000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','same two','B','01012345678');
do $$ declare a jsonb; begin
  a:=record_pricing_document_acceptance('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002',repeat('e',64),'kakao_start','10000000-0000-4000-8000-000000000001',null,null,false,null,null,'{"businessName":"ambiguous","phone":"010-1234-5678","address":"C"}');
  if a->>'needsReview'<>'true' or a->>'leadId' is not null then raise exception 'ambiguous lead did not continue for review'; end if;
end $$;
do $$ declare a jsonb; begin
  a:=record_pricing_document_acceptance('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000003',repeat('d',64),'store',null,null,null,false,null,null,'{"businessName":"new shop","phone":"010-9999-8888","address":"new address","deliveryDropLocation":"side door"}');
  if a->>'customerId' is null or a->>'leadId' is null then raise exception 'new lead/customer conversion failed'; end if;
  if not exists(select from customer_imports where company_id='00000000-0000-4000-8000-000000000001' and source='pricing_acceptance') then raise exception 'acceptance import audit missing'; end if;
end $$;

do $$ declare h text:=repeat('a',64); begin
  if pricing_s2_public_request_guard('00000000-0000-4000-8000-000000000001','accept',h,'{}',1)<>'allowed' then raise exception 'guard allow failed'; end if;
  if pricing_s2_public_request_guard('00000000-0000-4000-8000-000000000001','accept',h,'{}',1)<>'rate_limited' then raise exception 'guard rate failed'; end if;
  if not exists(select from pricing_public_request_audit where outcome='rate_limited') then raise exception 'rate audit missing'; end if;
end $$;

do $$ begin
  if has_table_privilege('anon','pricing_document_sends','select') or has_table_privilege('authenticated','store_accounts','select') then raise exception 'direct access leaked'; end if;
  if has_function_privilege('anon','record_pricing_document_acceptance(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,boolean,text,uuid,jsonb)','execute') then raise exception 'rpc access leaked'; end if;
end $$;

update normalized_customers set delivery_drop_location='rear door' where id='10000000-0000-4000-8000-000000000001';
do $$ begin if (select delivery_drop_location from normalized_customers where id='10000000-0000-4000-8000-000000000001')<>'rear door' then raise exception 'delivery drop location missing'; end if; end $$;

select 'S2 sales-to-order acceptance PG17 checks passed' as result;

-- send/audit 등 어떤 신규 이력이라도 있으면 down은 전체 롤백되어야 한다.
\set ON_ERROR_STOP off
\ir 20261102-S2-sales-to-order-acceptance.down.sql
\set ON_ERROR_STOP on
do $$ begin
  if to_regclass('public.pricing_document_sends') is null then raise exception 'destructive down was not refused'; end if;
end $$;

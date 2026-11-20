\set ON_ERROR_STOP on
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create extension if not exists pgcrypto with schema public;

create table companies(id uuid primary key);
create table pricing_documents(id uuid primary key,company_id uuid not null references companies(id),owner_key text not null,kind text not null,revision int not null,content jsonb not null,updated_at timestamptz default now(),unique(company_id,id));
create table pricing_document_versions(id uuid primary key default gen_random_uuid(),company_id uuid not null,document_id uuid not null,version int not null,revision int not null,content jsonb not null,published_at timestamptz default now(),unique(company_id,document_id,id),unique(company_id,document_id,version),foreign key(company_id,document_id) references pricing_documents(company_id,id));
create table product_catalog(id uuid primary key,company_id uuid not null,purchase_product_name text,sales_product_name text,canonical_name text,brand_name text,sales_spec text,sales_unit text,tax_type text,order_pricing_mode text default 'fixed',purchase_price numeric(14,2),is_active boolean default true,unique(company_id,id));
create table pricing_settings(company_id uuid primary key,default_margin_bp int);
create table pricing_promotions(id uuid primary key,company_id uuid not null,product_id uuid not null,display_name text,starts_on date,ends_on date,price bigint,stock bigint,revision int,unique(company_id,id));
create table pricing_document_share_links(id uuid primary key,company_id uuid not null,document_id uuid not null,document_version_id uuid not null,unique(company_id,id));
create table customer_pricing_document_links(id uuid primary key,company_id uuid not null,customer_id uuid not null,document_id uuid not null,document_version_id uuid not null,active boolean not null,linked_at timestamptz not null);
create table store_orders(id uuid primary key,company_id uuid not null,document_version_id uuid not null);
create table price_fixture(company_id uuid,customer_id uuid,product_id uuid,price bigint,source text);

create function pricing_p1_clean(p_company uuid,p_content jsonb) returns jsonb language plpgsql stable set search_path=public,pg_temp as $$ begin
  if jsonb_typeof(p_content->'lines')<>'array' or not exists(select 1 from jsonb_array_elements(p_content->'lines') x where coalesce((x->>'visible')::boolean,false)) then raise exception 'invalid content'; end if;
  if exists(select 1 from jsonb_array_elements(p_content->'lines') x where not exists(select 1 from product_catalog c where c.company_id=p_company and c.id=(x->>'productId')::uuid and c.is_active)) then raise exception 'foreign product'; end if;
  return p_content;
end $$;
create function pricing_p1_version(p_company uuid,p_version pricing_document_versions) returns jsonb language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object('id',p_version.id,'documentId',p_version.document_id,'version',p_version.version,'revision',p_version.revision,'content',p_version.content,'publishedAt',p_version.published_at) where p_version.company_id=p_company $$;
create function self_order_price_v2(p_company uuid,p_customer uuid,p_product uuid,p_date date,p_include_promise boolean default true)
returns table(price bigint,tax_type text,includes_tax boolean,market boolean,source text,promise_until date)
language sql stable set search_path=public,pg_temp as $$ select f.price,c.tax_type,false,c.order_pricing_mode='market',case when c.order_pricing_mode='market' then 'market' else f.source end,null::date
from product_catalog c left join price_fixture f on f.company_id=c.company_id and f.customer_id=p_customer and f.product_id=c.id
where c.company_id=p_company and c.id=p_product and c.is_active $$;

\ir 2026-11-20-CX-121-document-extension.sql

insert into companies values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into product_catalog values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','양파','양파','양파','','1망','망','exempt','fixed',800,true),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','감자','감자','감자','','1박스','박스','taxable','fixed',1000,true),
 ('30000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000002','타사','타사','타사','','1개','개','taxable','fixed',1,true);
insert into pricing_settings values ('10000000-0000-4000-8000-000000000001',2000);
insert into price_fixture values
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',1200,'catalog'),
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',1500,'base');
insert into pricing_documents values ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',repeat('a',64),'sheet',1,
 '{"kind":"sheet","title":"11월 단가표","companyName":"합성 유통","contact":"","recipient":"합성 매장","footer":"","validUntil":"2026-11-20","theme":"blue","layout":"table","showPrice":true,"showBrand":true,"showSpec":true,"lines":[{"productId":"30000000-0000-4000-8000-000000000001","displayName":"양파","brand":"","spec":"1망","unit":"망","price":1000,"taxType":"exempt","visible":true,"promotionId":null,"startsOn":null,"endsOn":null,"remaining":null,"badge":""},{"productId":"30000000-0000-4000-8000-000000000002","displayName":"감자","brand":"","spec":"1박스","unit":"박스","price":1400,"taxType":"taxable","visible":false,"promotionId":null,"startsOn":null,"endsOn":null,"remaining":null,"badge":""}]}'::jsonb,now());
insert into pricing_document_versions(id,company_id,document_id,version,revision,content) select '50000000-0000-4000-8000-000000000001',company_id,id,1,1,content from pricing_documents;
insert into pricing_document_share_links values ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001');
insert into customer_pricing_document_links values ('61000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',true,now());
insert into store_orders values ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001');

do $$ declare r jsonb; saved jsonb; published jsonb; token text:=repeat('b',64); content jsonb;
begin
  r:=pricing_document_extension_review_v1('10000000-0000-4000-8000-000000000001',repeat('a',64),true,'40000000-0000-4000-8000-000000000001',1,'latest','2026-12-31','start',null,token);
  if r#>>'{content,lines,0,price}'<>'1200' or r#>>'{lines,0,source}'<>'catalog' or r#>>'{summary,changed}'<>'1'
    or jsonb_array_length(r#>'{content,lines}')<>2 or r#>>'{content,lines,1,visible}'<>'false' then raise exception 'latest review failed: %',r; end if;
  content:=r->'content';
  saved:=pricing_document_extension_save_v1('10000000-0000-4000-8000-000000000001',repeat('a',64),true,'40000000-0000-4000-8000-000000000001',1,'latest',content);
  if saved->>'revision'<>'2' or jsonb_array_length(saved#>'{content,lines}')<>2 then raise exception 'extension save failed'; end if;
  r:=pricing_document_extension_review_v1('10000000-0000-4000-8000-000000000001',repeat('a',64),true,'40000000-0000-4000-8000-000000000001',2,'latest','2026-12-31','review',content,repeat('c',64));
  if jsonb_array_length(r#>'{content,lines}')<>2 or r#>>'{content,lines,1,visible}'<>'false' then raise exception 'hidden line review failed: %',r; end if;
  published:=pricing_document_extension_publish_v1('10000000-0000-4000-8000-000000000001',repeat('a',64),true,'40000000-0000-4000-8000-000000000001',2,'latest',repeat('c',64),'80000000-0000-4000-8000-000000000001');
  if published->>'version'<>'2' or jsonb_array_length(published#>'{content,lines}')<>2
    or published#>>'{content,lines,1,visible}'<>'false'
    or resolve_pricing_document_link_head_v1('60000000-0000-4000-8000-000000000001')=(select document_version_id from pricing_document_share_links limit 1) then raise exception 'publish/head failed'; end if;
  if (select document_version_id from store_orders where id='70000000-0000-4000-8000-000000000001')<>'50000000-0000-4000-8000-000000000001' then raise exception 'past order changed'; end if;
  if (select v.content#>>'{lines,0,price}' from pricing_document_versions v where v.id='50000000-0000-4000-8000-000000000001')<>'1000' then raise exception 'past version changed'; end if;
  if pricing_document_extension_publish_v1('10000000-0000-4000-8000-000000000001',repeat('a',64),true,'40000000-0000-4000-8000-000000000001',2,'latest',repeat('c',64),'80000000-0000-4000-8000-000000000001')->>'id'<>published->>'id' then raise exception 'idempotent replay failed'; end if;
  begin perform pricing_document_extension_publish_v1('10000000-0000-4000-8000-000000000001',repeat('a',64),true,'40000000-0000-4000-8000-000000000001',2,'keep',repeat('c',64),'80000000-0000-4000-8000-000000000001'); raise exception 'idempotency conflict accepted'; exception when others then if sqlerrm not like '%extension_idempotency_conflict%' then raise; end if; end;
  begin perform pricing_document_extension_review_v1('10000000-0000-4000-8000-000000000002',repeat('a',64),true,'40000000-0000-4000-8000-000000000001',2,'keep','2027-01-31','start',null,repeat('d',64)); raise exception 'cross company accepted'; exception when others then if sqlerrm not like '%extension_stale%' then raise; end if; end;
  if has_function_privilege('anon','public.pricing_document_extension_publish_v1(uuid,text,boolean,uuid,integer,text,text,uuid)','execute')
    or has_function_privilege('authenticated','public.pricing_document_extension_publish_v1(uuid,text,boolean,uuid,integer,text,text,uuid)','execute')
    or not has_function_privilege('service_role','public.pricing_document_extension_publish_v1(uuid,text,boolean,uuid,integer,text,text,uuid)','execute') then raise exception 'acl failed'; end if;
end $$;
delete from pricing_document_share_link_heads;
delete from pricing_document_link_heads;
delete from pricing_document_extension_publishes;
delete from pricing_document_extension_reviews;
delete from pricing_document_extension_states;
\ir 2026-11-20-CX-121-document-extension.down.sql
do $$ begin
  if to_regprocedure('public.pricing_document_extension_publish_v1(uuid,text,boolean,uuid,integer,text,text,uuid)') is not null
    or (select count(*) from pricing_document_versions)<>2
    or (select count(*) from store_orders)<>1 then raise exception 'down or history preservation failed'; end if;
end $$;

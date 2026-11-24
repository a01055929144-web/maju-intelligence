\set ON_ERROR_STOP on
do $$ begin if current_database()!~'^product_unit_case_test' or current_setting('server_version_num')::int not between 170000 and 179999
  then raise exception 'disposable PostgreSQL 17 database required'; end if; end $$;
do $$ begin
  if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
create table product_catalog(id uuid primary key,company_id uuid not null,purchase_unit text,sales_unit text,default_sales_price numeric,updated_at timestamptz default clock_timestamp());
create table pricing_documents(id uuid primary key,company_id uuid not null,content jsonb not null,revision int not null,updated_at timestamptz default clock_timestamp());
create table pricing_document_versions(id uuid primary key,company_id uuid not null,content jsonb not null,published_at timestamptz);
create table customer_price_agreements(id uuid primary key,company_id uuid not null,price numeric);
create table sales_quotes(id uuid primary key,company_id uuid not null,status text not null);
create table sales_quote_items(id uuid primary key,company_id uuid not null,quote_id uuid not null,product_catalog_id uuid,unit text,sales_unit_snapshot text,purchase_unit_snapshot text,updated_at timestamptz default clock_timestamp());
\set company '10000000-0000-4000-8000-000000000001'
insert into product_catalog(id,company_id,purchase_unit,sales_unit,default_sales_price)
select md5('product-'||n)::uuid,:'company',case when n<=43 then 'ea' when n<=162 then 'kg' when n=163 then 'Box' when n<=168 then 'box' else 'pack' end,
  case when n<=42 then 'ea' when n<=159 then 'kg' when n=160 then 'Box' when n<=165 then 'box' when n=166 then 'pack' else 'EA' end,1000+n
from generate_series(1,169) n;
insert into pricing_documents values(md5('draft')::uuid,:'company',jsonb_build_object('lines',jsonb_build_array(
  jsonb_build_object('productId',md5('product-1')::uuid,'unit','ea','price',1001),
  jsonb_build_object('productId',md5('product-2')::uuid,'unit','kg','price',1002),
  jsonb_build_object('productId',md5('unrelated')::uuid,'unit','EA','price',999))),1,clock_timestamp());
insert into pricing_document_versions
select md5('published')::uuid,:'company',jsonb_build_object('lines',jsonb_build_array(
  jsonb_build_object('unit','ea'),jsonb_build_object('unit','ea'),jsonb_build_object('unit','kg'),jsonb_build_object('unit','kg'))),clock_timestamp();
insert into customer_price_agreements values(md5('fixed')::uuid,:'company',777);

\ir 2026-11-24-product-unit-case-normalization.sql
do $$ begin
  if (select count(*) from product_catalog where purchase_unit<>upper(purchase_unit) or sales_unit<>upper(sales_unit))<>0
    or (select count(*) from pricing_documents cross join lateral jsonb_array_elements(content->'lines') l where l->>'unit' in('ea','kg'))<>0
    or (select count(*) from pricing_document_versions cross join lateral jsonb_array_elements(content->'lines') l where l->>'unit' in('ea','kg'))<>4
    or (select price from customer_price_agreements)<>777
    or (select revision from pricing_documents)<>2
  then raise exception 'product_unit_forward_regression'; end if;
end $$;
\ir 2026-11-24-product-unit-case-normalization.down.sql
do $$ begin
  if (select count(*) from product_catalog where purchase_unit<>upper(purchase_unit) and purchase_unit~'[a-z]')<>169
    or (select count(*) from product_catalog where sales_unit<>upper(sales_unit) and sales_unit~'[a-z]')<>166
    or (select count(*) from pricing_documents cross join lateral jsonb_array_elements(content->'lines') l where l->>'unit' in('ea','kg'))<>2
    or (select count(*) from pricing_document_versions cross join lateral jsonb_array_elements(content->'lines') l where l->>'unit' in('ea','kg'))<>4
    or (select price from customer_price_agreements)<>777
    or (select revision from pricing_documents)<>3
  then raise exception 'product_unit_down_regression'; end if;
end $$;
select 'product unit case PG17 checks passed' result;

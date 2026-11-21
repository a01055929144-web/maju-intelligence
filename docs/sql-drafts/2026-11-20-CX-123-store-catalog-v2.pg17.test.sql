\set ON_ERROR_STOP on

do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create schema if not exists public;

create table public.store_accounts(
  id uuid primary key,company_id uuid not null,store_profile_id uuid,customer_id uuid not null,
  blockers text[] not null default '{}',price_confirmed boolean not null default false
);
create table public.store_members(account_id uuid,user_id uuid,member_id uuid,primary key(account_id,user_id));
create table public.product_categories(
  id uuid primary key,company_id uuid not null,parent_id uuid,level smallint not null,
  name text not null,is_active boolean not null default true
);
create table public.product_catalog(
  id uuid primary key,company_id uuid not null,purchase_product_name text not null,
  sales_product_name text,canonical_name text,sales_spec text,sales_unit text,photo_url text,
  category_id uuid,tax_type text not null,is_active boolean not null default true,
  order_cutoff_days_before smallint,order_cutoff_time time
);
create table public.pricing_promotions(
  id uuid primary key,company_id uuid not null,product_id uuid not null,display_name text not null,
  starts_on date not null,ends_on date not null,price bigint not null,tax_type text not null,
  badge text not null,stock bigint,per_store_limit bigint
);

create function public.self_order_member(p_company uuid,p_account uuid,p_user uuid)
returns uuid language sql stable as $$
  select member.member_id from public.store_members member
  join public.store_accounts account on account.id=member.account_id and account.company_id=p_company
  where member.account_id=p_account and member.user_id=p_user
$$;
create function public.store_order_eligibility(p_company uuid,p_account uuid,p_user uuid)
returns text[] language sql stable as $$
  select account.blockers from public.store_accounts account
  where account.company_id=p_company and account.id=p_account
    and public.self_order_member(p_company,p_account,p_user) is not null
$$;
create function public.self_order_price_v2(
  p_company uuid,p_customer uuid,p_product uuid,p_date date,p_include_promise boolean default true
) returns table(price bigint,tax_type text,includes_tax boolean,market boolean,source text,promise_until date)
language sql stable as $$
  select 1000::bigint,product.tax_type,false,false,
    case when p_include_promise then 'promise' else 'base' end,
    case when p_include_promise then p_date+7 end
  from public.product_catalog product
  where product.company_id=p_company and product.id=p_product and product.is_active
$$;

\ir 2026-11-20-CX-123-store-catalog-v2.sql

insert into public.store_accounts values
  ('10000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','90000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','{}',false),
  ('10000000-0000-4000-8000-000000000002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','90000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','{payment_method_required}',false),
  ('10000000-0000-4000-8000-000000000003','cccccccc-cccc-4ccc-8ccc-cccccccccccc','90000000-0000-4000-8000-000000000009','20000000-0000-4000-8000-000000000003','{}',false);
insert into public.store_members values
  ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000009','40000000-0000-4000-8000-000000000009');

insert into public.product_categories values
  ('50000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',null,1,'농산',true),
  ('50000000-0000-4000-8000-000000000002','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','50000000-0000-4000-8000-000000000001',2,'채소',true),
  ('50000000-0000-4000-8000-000000000003','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','50000000-0000-4000-8000-000000000002',3,'잎채소',true),
  ('51000000-0000-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',null,1,'수산',true);
insert into public.product_catalog
select md5('a-product-'||n)::uuid,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','상품 '||lpad(n::text,2,'0'),
  case when n=1 then '검색 배추' else '상품 '||lpad(n::text,2,'0') end,'표준 상품','10kg','BOX',
  'https://example.test/'||n||'.jpg','50000000-0000-4000-8000-000000000003','taxable',true,1,'12:00'
from generate_series(1,51) n;
insert into public.product_catalog values
  ('61000000-0000-4000-8000-000000000001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','고등어','고등어',null,'20미','BOX',null,
   '51000000-0000-4000-8000-000000000001','exempt',true,null,null);
insert into public.pricing_promotions values
  ('70000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',md5('a-product-1')::uuid,
   '가을 행사','2026-11-01','2026-11-30',900,'taxable','행사',100,5),
  ('70000000-0000-4000-8000-000000000002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','61000000-0000-4000-8000-000000000001',
   '수산 행사','2026-11-01','2026-11-30',800,'exempt','행사',100,5);

do $verify$
declare count_rows integer; row_result record;
begin
  select count(*) into count_rows from public.store_member_catalog_v2(
    '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-11-20');
  if count_rows<>50 then raise exception 'page one expected 50, got %',count_rows; end if;
  select count(*) into count_rows from public.store_member_catalog_v2(
    '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-11-20',null,null,null,null,null,2);
  if count_rows<>2 then raise exception 'page two expected 2, got %',count_rows; end if;

  select * into row_result from public.store_member_catalog_v2(
    '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-11-20',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','농산','채소','잎채소','배추',1);
  if row_result.product_name<>'검색 배추' or row_result.price is null or row_result.price_source<>'promise'
    or row_result.large_category<>'농산' or jsonb_array_length(row_result.promotions)<>1
    or row_result.order_cutoff_days_before<>1 then raise exception 'catalog fields failed: %',row_to_json(row_result); end if;

  select * into row_result from public.store_member_catalog_v2(
    '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-11-20',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',null,null,null,'고등어',1);
  if row_result.can_order or row_result.price_visible or row_result.price is not null
    or row_result.price_source is not null or row_result.product_name<>'고등어'
    or jsonb_array_length(row_result.promotions)<>1 or row_result.promotions#>>'{0,price}' is not null
    then raise exception 'fallback visibility/order separation failed: %',row_to_json(row_result); end if;
  if exists(select 1 from public.store_member_catalog_v2(
    '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-11-20',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc')) then raise exception 'cross-profile company leaked'; end if;
end $verify$;

create function public.store_price_visible_v1(p_company uuid,p_store_account uuid)
returns boolean language sql stable as $$
  select account.price_confirmed from public.store_accounts account
  where account.company_id=p_company and account.id=p_store_account
$$;
update public.store_accounts set price_confirmed=true
where id='10000000-0000-4000-8000-000000000002';

do $verify$
declare row_result record;
begin
  select * into row_result from public.store_member_catalog_v2(
    '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-11-20',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',null,null,null,'고등어',1);
  if row_result.can_order or not row_result.price_visible or row_result.price is null
    then raise exception 'CX-122 visibility must not change eligibility: %',row_to_json(row_result); end if;
  if has_function_privilege('anon','public.store_member_catalog_v2(uuid,uuid,date,uuid,text,text,text,text,integer)','execute')
    or has_function_privilege('authenticated','public.store_member_catalog_v2(uuid,uuid,date,uuid,text,text,text,text,integer)','execute')
    or not has_function_privilege('service_role','public.store_member_catalog_v2(uuid,uuid,date,uuid,text,text,text,text,integer)','execute')
    or has_function_privilege('service_role','public.cx123_store_price_visible(uuid,uuid,text[])','execute')
    then raise exception 'catalog ACL failed'; end if;
end $verify$;

drop function public.store_price_visible_v1(uuid,uuid);
\ir 2026-11-20-CX-123-store-catalog-v2.down.sql
do $$ begin
  if to_regprocedure('public.store_member_catalog_v2(uuid,uuid,date,uuid,text,text,text,text,integer)') is not null
    or to_regprocedure('public.cx123_store_price_visible(uuid,uuid,text[])') is not null
  then raise exception 'down failed'; end if;
end $$;
\ir 2026-11-20-CX-123-store-catalog-v2.sql
\ir 2026-11-20-CX-123-store-catalog-v2.down.sql

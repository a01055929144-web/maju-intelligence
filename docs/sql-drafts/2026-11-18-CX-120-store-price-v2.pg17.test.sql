\set ON_ERROR_STOP on

do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create schema if not exists public;

create table public.product_catalog (
  id uuid primary key, company_id uuid not null, sales_unit text not null,
  tax_type text not null, order_pricing_mode text not null default 'fixed', is_active boolean not null default true
);
create table public.pricing_document_versions (
  id uuid primary key, company_id uuid not null, document_id uuid not null,
  content jsonb not null, published_at timestamptz
);
create table public.customer_pricing_document_links (
  id uuid primary key, company_id uuid not null, customer_id uuid not null,
  document_id uuid not null, document_version_id uuid not null, active boolean not null,
  linked_at timestamptz not null
);
create table public.price_fixture (
  company_id uuid not null, customer_id uuid not null, product_id uuid not null,
  catalog_price bigint, base_price bigint
);
create view public.pricing_p0_effective with (security_invoker=true) as
  select company_id, product_id, base_price as price from public.price_fixture;
create function public.margin_template_price_v1(p_company uuid, p_customer uuid, p_product uuid)
returns bigint language sql stable set search_path = '' as $$
  select f.catalog_price from public.price_fixture f
  where f.company_id = p_company and f.customer_id = p_customer and f.product_id = p_product
$$;

\ir 2026-11-18-CX-120-store-price-v2.sql

insert into public.product_catalog values
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','BOX','taxable','fixed',true),
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','EA','exempt','fixed',true),
  ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','EA','taxable','market',true),
  ('30000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000002','BOX','taxable','fixed',true);
insert into public.price_fixture values
  ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',1200,1000),
  ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',null,700),
  ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003',1500,900),
  ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000004',9999,8888);

insert into public.pricing_document_versions values
  ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
   '{"showPrice":true,"validUntil":"2026-11-20","display":{"priceIncludesTax":false},"lines":[{"productId":"30000000-0000-4000-8000-000000000001","unit":"BOX","visible":true,"price":1500,"taxType":"taxable"}]}'::jsonb,'2026-11-18 01:00+00'),
  ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002',
   '{"priceContract":"promotion-gross-v1","showPrice":true,"validUntil":"2026-11-30","display":{"priceIncludesTax":true},"lines":[{"productId":"30000000-0000-4000-8000-000000000001","unit":"BOX","visible":true,"price":1700,"taxType":"taxable","priceIncludesTax":false},{"productId":"30000000-0000-4000-8000-000000000001","unit":"BOX","visible":true,"price":1100,"taxType":"taxable","priceIncludesTax":true,"promotionId":"70000000-0000-4000-8000-000000000001"},{"productId":"30000000-0000-4000-8000-000000000002","unit":"EA","visible":true,"price":800,"taxType":"exempt","priceIncludesTax":false}]}'::jsonb,'2026-11-21 01:00+00'),
  ('50000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000003',
   '{"showPrice":true,"validUntil":"2099-12-31","lines":[{"productId":"30000000-0000-4000-8000-000000000004","unit":"BOX","visible":true,"price":7777,"taxType":"taxable"}]}'::jsonb,'2026-11-18 01:00+00');
insert into public.customer_pricing_document_links values
  ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',true,'2026-11-18 01:00+00'),
  ('60000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000003',true,'2026-11-18 01:00+00');

do $$
declare r record;
begin
  select * into r from public.self_order_price_v2('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-11-20',true);
  if (r.price,r.tax_type,r.includes_tax,r.source,r.promise_until) is distinct from
    (1500::bigint,'taxable'::text,false,'promise'::text,'2026-11-20'::date) then raise exception 'valid promise failed: %', row_to_json(r); end if;

  select * into r from public.self_order_price_v2('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-11-21',true);
  if (r.price,r.tax_type,r.includes_tax,r.source,r.promise_until) is distinct from
    (1200::bigint,'taxable'::text,false,'catalog'::text,null::date) then raise exception 'expiry next day/direct catalog failed: %', row_to_json(r); end if;

  update public.customer_pricing_document_links set active=false where id='60000000-0000-4000-8000-000000000001';
  insert into public.customer_pricing_document_links values
    ('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002',true,'2026-11-21 01:00+00');
  select * into r from public.self_order_price_v2('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-11-21',true);
  if (r.price,r.tax_type,r.includes_tax,r.source,r.promise_until) is distinct from
    (1870::bigint,'taxable'::text,true,'promise'::text,'2026-11-30'::date) then raise exception 'new extension tax-inclusive promise failed: %', row_to_json(r); end if;

  select * into r from public.self_order_price_v2('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','2026-11-21',true);
  if (r.price,r.tax_type,r.includes_tax,r.source,r.promise_until) is distinct from
    (800::bigint,'exempt'::text,true,'promise'::text,'2026-11-30'::date) then raise exception 'tax-exempt promise was converted: %', row_to_json(r); end if;

  select * into r from public.self_order_price_v2('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-11-21',false);
  if (r.price,r.tax_type,r.includes_tax,r.source,r.promise_until) is distinct from
    (1200::bigint,'taxable'::text,false,'catalog'::text,null::date) then raise exception 'promise exclusion failed: %', row_to_json(r); end if;

  select * into r from public.self_order_price_v2('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','2026-12-01',true);
  if (r.price,r.tax_type,r.includes_tax,r.source) is distinct from
    (700::bigint,'exempt'::text,false,'base'::text) then raise exception 'base tax fallback failed: %', row_to_json(r); end if;

  select * into r from public.self_order_price_v2('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','2026-11-21',true);
  if r.source <> 'market' or r.price is not null or not r.market then raise exception 'market failed: %', row_to_json(r); end if;

  if exists (select 1 from public.self_order_price_v2('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000004','2026-11-21',true)) then
    raise exception 'cross-company product leaked';
  end if;
  if has_function_privilege('anon','public.self_order_price_v2(uuid,uuid,uuid,date,boolean)','execute')
    or has_function_privilege('authenticated','public.self_order_price_v2(uuid,uuid,uuid,date,boolean)','execute')
    or not has_function_privilege('service_role','public.self_order_price_v2(uuid,uuid,uuid,date,boolean)','execute') then
    raise exception 'function grants failed';
  end if;
end $$;

\ir 2026-11-18-CX-120-store-price-v2.down.sql
do $$ begin
  if to_regprocedure('public.self_order_price_v2(uuid,uuid,uuid,date,boolean)') is not null then
    raise exception 'down failed';
  end if;
end $$;

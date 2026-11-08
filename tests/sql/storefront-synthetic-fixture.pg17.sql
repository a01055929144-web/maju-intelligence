\set ON_ERROR_STOP on

-- Disposable PG17 fixture only. It must never run against an operating database.
do $$ begin
  if current_database() <> 'storefront_synthetic_fixture_test' then
    raise exception 'disposable_storefront_fixture_database_required';
  end if;
  if current_setting('server_version_num')::integer / 10000 <> 17 then
    raise exception 'PG17_required';
  end if;
end $$;

begin;
insert into public.companies(id)
values ('04000000-0000-4000-8000-000000000001');

insert into public.normalized_customers(id, company_id, customer_name, address)
values (
  '04000000-0000-4000-8000-000000000002',
  '04000000-0000-4000-8000-000000000001',
  '__TEST_ONLY__ STORE VIEWER',
  null
);

insert into public.product_catalog(
  id, company_id, product_code, canonical_name, purchase_product_name,
  sales_product_name, brand_name, sales_spec, sales_unit, purchase_price, tax_type
)
select
  ('04000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '04000000-0000-4000-8000-000000000001',
  'TEST-' || lpad(n::text, 2, '0'),
  'TEST ONLY PRODUCT ' || n,
  'TEST ONLY PRODUCT ' || n,
  '테스트 상품 ' || n,
  'TEST ONLY',
  n || '개 합성 규격',
  'BOX',
  1000 + n,
  case when n % 2 = 0 then 'taxable' else 'exempt' end
from generate_series(10, 27) n;

set local role service_role;
do $$
declare
  company constant uuid := '04000000-0000-4000-8000-000000000001';
  customer constant uuid := '04000000-0000-4000-8000-000000000002';
  document constant uuid := '04000000-0000-4000-8000-000000000003';
  link constant uuid := '04000000-0000-4000-8000-000000000004';
  actor constant text := repeat('4', 64);
  content jsonb;
  published jsonb;
begin
  select jsonb_build_object(
    'kind', 'sheet',
    'title', 'TEST ONLY 18품목 게시본',
    'companyName', 'TEST ONLY COMPANY',
    'contact', '',
    'recipient', '',
    'footer', 'DISPOSABLE PG17 FIXTURE',
    'validUntil', ((now() at time zone 'Asia/Seoul')::date + 14)::text,
    'theme', 'blue',
    'layout', 'table',
    'showPrice', true,
    'showBrand', true,
    'showSpec', true,
    'lines', jsonb_agg(jsonb_build_object(
      'productId', id,
      'displayName', sales_product_name,
      'brand', brand_name,
      'spec', sales_spec,
      'unit', sales_unit,
      'price', 2000 + substring(product_code from '[0-9]+$')::integer,
      'taxType', tax_type,
      'visible', true,
      'promotionId', null
    ) order by product_code)
  ) into content
  from public.product_catalog
  where company_id = company;

  perform public.pricing_p1(company, actor, true, 'save', jsonb_build_object(
    'id', document, 'expected', 0, 'content', content
  ));
  published := public.pricing_p1(company, actor, true, 'publish', jsonb_build_object(
    'id', document, 'expected', 1
  ));

  perform public.issue_storefront_links(
    company,
    (published->>'id')::uuid,
    jsonb_build_array(jsonb_build_object(
      'customerId', customer,
      'id', link,
      'nonce', repeat('4', 32),
      'hash', repeat('4', 64)
    )),
    now() + interval '1 hour',
    null,
    actor
  );
  update public.storefront_links
  set can_order = false
  where company_id = company and id = link;

  if (select count(*) from public.product_catalog where company_id = company) <> 18 then
    raise exception 'synthetic_product_count_mismatch';
  end if;
  if jsonb_array_length(published->'content'->'lines') <> 18 then
    raise exception 'published_line_count_mismatch';
  end if;
  if published::text ~* '(purchase|cost|supplier|phone|address|token)' then
    raise exception 'private_field_leaked_to_published_fixture';
  end if;
  if not exists (
    select 1 from public.normalized_customers
    where company_id = company and id = customer
      and customer_name = '__TEST_ONLY__ STORE VIEWER' and address is null
  ) then
    raise exception 'synthetic_customer_mismatch';
  end if;
  if not exists (
    select 1 from public.storefront_links
    where company_id = company and id = link and customer_id = customer
      and document_version_id = (published->>'id')::uuid and not can_order
  ) then
    raise exception 'view_only_link_mismatch';
  end if;
end $$;
reset role;
rollback;

do $$ begin
  if exists(select 1 from public.companies)
    or exists(select 1 from public.normalized_customers)
    or exists(select 1 from public.product_catalog)
    or exists(select 1 from public.pricing_documents)
    or exists(select 1 from public.pricing_document_versions)
    or exists(select 1 from public.storefront_links) then
    raise exception 'synthetic_fixture_not_discarded';
  end if;
end $$;

select 'storefront_synthetic_fixture_pg17_pass';

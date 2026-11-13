-- Disposable PostgreSQL 17 fixture only. Never run against production.
-- 운영 구조(2026-11-13 읽기 조회)를 따른 최소 fixture + 초안 + down 왕복.
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create table companies(id uuid primary key);
create table app_users(id uuid primary key);
create table admin_audit_logs(id bigserial primary key, actor_user_id uuid, company_id uuid, action text, target_type text, target_id uuid, metadata jsonb);
create table normalized_customers(id uuid primary key, company_id uuid not null references companies(id), delivery_territory_id uuid, unique(company_id, id));
create table product_catalog(id uuid primary key, company_id uuid not null references companies(id), is_active boolean not null default true, order_pricing_mode text, tax_type text,
  sales_unit text, sales_product_name text, canonical_name text, purchase_product_name text, sales_spec text, unique(company_id, id));
create table pricing_document_versions(id uuid primary key, company_id uuid not null references companies(id), unique(company_id, id));
create table storefront_links(id uuid primary key, company_id uuid not null references companies(id), customer_id uuid not null, document_version_id uuid not null,
  token_nonce text not null, token_hash text not null unique, expires_at timestamptz not null, issued_at timestamptz not null default now(), revoked_at timestamptz,
  can_order boolean not null default true, issued_by_user_id uuid, unique(company_id, id), unique(company_id, id, customer_id, document_version_id),
  foreign key (company_id, customer_id) references normalized_customers(company_id, id),
  foreign key (company_id, document_version_id) references pricing_document_versions(company_id, id));
create table store_order_settings(company_id uuid primary key, cutoff_days_before int, cutoff_time time, minimum_amount bigint, minimum_policy text, delivery_fee bigint);
create table store_order_territory_rules(company_id uuid, territory_id uuid, delivery_weekdays smallint[], cutoff_days_before int, cutoff_time time, minimum_amount bigint, minimum_policy text, delivery_fee bigint);
create table store_order_customer_rules(company_id uuid, customer_id uuid, delivery_weekdays smallint[], cutoff_days_before int, cutoff_time time, minimum_amount bigint, minimum_policy text, delivery_fee bigint);
create table store_order_holidays(company_id uuid, territory_id uuid, kind text, weekday smallint, month smallint, day smallint, holiday_date date);
create table store_accounts(id uuid primary key, company_id uuid not null);
create table store_account_members(id uuid primary key, company_id uuid not null, store_account_id uuid not null, auth_user_id uuid not null);
create table store_orders(id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), customer_id uuid not null, link_id uuid not null,
  document_version_id uuid not null, delivery_date date, idempotency_key uuid not null, request_memo text not null default '', status text not null default 'submitted', revision int not null default 1,
  taxable_supply bigint not null default 0, exempt_supply bigint not null default 0, tax_amount bigint not null default 0, delivery_fee bigint not null default 0, known_total bigint not null default 0,
  has_market_price boolean not null default false, store_account_id uuid, ordered_by_member_id uuid, payment_mode text not null default 'postpay', updated_at timestamptz default now(),
  unique(company_id, id), unique(company_id, link_id, idempotency_key),
  foreign key (company_id, link_id, customer_id, document_version_id) references storefront_links(company_id, id, customer_id, document_version_id));
create table store_order_lines(id uuid primary key default gen_random_uuid(), company_id uuid not null, order_id uuid not null, product_id uuid not null, promotion_id uuid,
  product_name text not null, specification text, sales_unit text, quantity numeric not null, unit_price bigint, tax_type text not null check (tax_type in ('taxable','exempt')),
  price_includes_tax boolean not null default false,
  supply_amount bigint generated always as (round(quantity * unit_price)::bigint) stored,
  tax_amount bigint generated always as (case when tax_type = 'taxable' then round(round(quantity * unit_price) * 0.1)::bigint else 0 end) stored,
  total_amount bigint generated always as (round(quantity * unit_price)::bigint + case when tax_type = 'taxable' then round(round(quantity * unit_price) * 0.1)::bigint else 0 end) stored,
  is_market_price boolean not null default false);
create table store_order_requests(company_id uuid, link_id uuid, idempotency_key uuid, order_id uuid, request_fingerprint text check (request_fingerprint ~ '^[0-9a-f]{32}$'), result jsonb);
create table pricing_promotions(id uuid primary key, company_id uuid not null, product_id uuid not null, starts_on date, ends_on date, price bigint, stock bigint, per_store_limit bigint, tax_type text);
create table customer_price_agreements(id uuid primary key default gen_random_uuid(), company_id uuid, customer_id uuid, product_catalog_id uuid, status text, effective_from date, effective_until date, sales_unit text, unit_price bigint, tax_type text, price_includes_tax boolean default false);
create table pricing_p0_effective(company_id uuid, product_id uuid, price bigint);
create table stub_catalog_price(company_id uuid, customer_id uuid, product_id uuid, price bigint);
create function margin_template_price_v1(p_company uuid, p_customer uuid, p_product uuid) returns bigint language sql stable as $$
  select (select price from stub_catalog_price where company_id = p_company and customer_id = p_customer and product_id = p_product) $$;
create function promotion_applies_to(p_company uuid, p_promotion uuid, p_customer uuid) returns boolean language sql stable as $$ select true $$;

-- 기존 문서 링크·주문(초안 적용 전부터 있던 행)
insert into companies values ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000c2');
insert into normalized_customers values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', null), ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c2', null);
insert into pricing_document_versions values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1');
insert into storefront_links(id, company_id, customer_id, document_version_id, token_nonce, token_hash, expires_at) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000e1', repeat('a', 32), repeat('d', 64), now() + interval '30 days');
insert into store_orders(company_id, customer_id, link_id, document_version_id, delivery_date, idempotency_key) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', current_date + 7, gen_random_uuid());

\ir 20261113-CC-36b-catalog-order.sql

-- 기존 행 유지: source 기본 'document', 문서 주문은 그대로
do $$ begin
  assert (select source from storefront_links where id = '00000000-0000-0000-0000-0000000000f1') = 'document';
  assert (select count(*) from store_orders where document_version_id is not null) = 1;
  begin insert into storefront_links(id, company_id, customer_id, document_version_id, source, token_nonce, token_hash, expires_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', null, 'document', repeat('a', 32), repeat('1', 64), now() + interval '1 day');
    assert false, 'document link needs a version'; exception when check_violation then null; end;
end $$;

-- 전체 상품 링크 발급: 새 링크 / 같은 매장에 다시 발급하면 기존 링크 재사용 / 다른 회사 매장 거부 / 감사 기록
select * from issue_catalog_storefront_links_v1('00000000-0000-0000-0000-0000000000c1',
  '[{"customerId":"00000000-0000-0000-0000-0000000000b1","id":"00000000-0000-0000-0000-0000000000f2","nonce":"11111111111111111111111111111111","hash":"2222222222222222222222222222222222222222222222222222222222222222"}]'::jsonb, now() + interval '30 days', null);
do $$ declare r record; begin
  assert (select count(*) from storefront_links where source = 'catalog') = 1;
  assert (select count(*) from admin_audit_logs where action = 'storefront_link_issued' and metadata->>'source' = 'catalog') = 1;
  select * into r from issue_catalog_storefront_links_v1('00000000-0000-0000-0000-0000000000c1',
    '[{"customerId":"00000000-0000-0000-0000-0000000000b1","id":"00000000-0000-0000-0000-0000000000f3","nonce":"33333333333333333333333333333333","hash":"4444444444444444444444444444444444444444444444444444444444444444"}]'::jsonb, now() + interval '30 days', null);
  assert r.was_created = false and r.issued_link_id = '00000000-0000-0000-0000-0000000000f2', 'existing catalog link is reused';
  begin perform issue_catalog_storefront_links_v1('00000000-0000-0000-0000-0000000000c1',
    '[{"customerId":"00000000-0000-0000-0000-0000000000b2","id":"00000000-0000-0000-0000-0000000000f4","nonce":"55555555555555555555555555555555","hash":"6666666666666666666666666666666666666666666666666666666666666666"}]'::jsonb, now() + interval '30 days', null);
    assert false, 'cross-company customer must fail'; exception when raise_exception then assert sqlerrm = 'Duplicate or cross-company customer', sqlerrm; end;
end $$;

-- 주문 fixture: 상품 4개(일반 · 시세 · 판매 중지 · 다른 회사), 매장 개별 가격 없음, 카탈로그 가격은 서버 함수(stub)
insert into product_catalog values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', true, 'fixed', 'exempt', 'kg', '양파', null, null, '1kg'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000c1', true, 'market', 'exempt', 'kg', '오이', null, null, '1kg'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000c1', false, 'fixed', 'exempt', 'kg', '숨김', null, null, '1kg'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000c2', true, 'fixed', 'exempt', 'kg', '타사', null, null, '1kg');
insert into stub_catalog_price values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 1500);
insert into store_order_customer_rules values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', '{0,1,2,3,4,5,6}', 1, '22:00', 0, 'notice', 0);

-- 일반 + 시세 줄(메모 포함): 가격은 서버 계산(요청 단가 무시), 시세 단가 null, 합계는 일반 줄만
select place_store_catalog_order_v1(repeat('4', 64)::text, current_date + 7, '[
  {"productId":"00000000-0000-0000-0000-0000000000a1","quantity":10,"unitPrice":1,"memo":{"text":"큰 것으로","kind":"product","tags":["big"]}},
  {"productId":"00000000-0000-0000-0000-0000000000a2","quantity":2}]'::jsonb, '00000000-0000-0000-0000-000000000a01');
do $$ begin
  assert (select unit_price from store_order_lines where product_id = '00000000-0000-0000-0000-0000000000a1') = 1500, 'server price, request price ignored';
  assert (select unit_price from store_order_lines where product_id = '00000000-0000-0000-0000-0000000000a2') is null, 'market line price is null';
  assert (select known_total from store_orders where document_version_id is null) = 15000, 'known total excludes market lines';
  assert (select has_market_price from store_orders where document_version_id is null);
  assert (select line_memo from store_order_lines where product_id = '00000000-0000-0000-0000-0000000000a1') = '큰 것으로';
  assert (select memo_kind from store_order_lines where product_id = '00000000-0000-0000-0000-0000000000a1') = 'product';
end $$;

-- 멱등: 같은 키·같은 내용은 같은 결과, 내용이 다르면 충돌
do $$ declare r jsonb; begin
  r := place_store_catalog_order_v1(repeat('4', 64)::text, current_date + 7, '[
    {"productId":"00000000-0000-0000-0000-0000000000a1","quantity":10,"unitPrice":1,"memo":{"text":"큰 것으로","kind":"product","tags":["big"]}},
    {"productId":"00000000-0000-0000-0000-0000000000a2","quantity":2}]'::jsonb, '00000000-0000-0000-0000-000000000a01');
  assert (select count(*) from store_orders where document_version_id is null) = 1, 'idempotent replay creates no second order';
  begin perform place_store_catalog_order_v1(repeat('4', 64)::text, current_date + 7, '[{"productId":"00000000-0000-0000-0000-0000000000a1","quantity":1}]'::jsonb, '00000000-0000-0000-0000-000000000a01');
    assert false, 'changed body must conflict'; exception when raise_exception then assert sqlerrm = 'Idempotency conflict', sqlerrm; end;
end $$;

-- 거부: 다른 회사 상품 · 판매 중지 상품 · 메모 51자 · 메모 종류 오류 · 문서 링크 토큰
do $$ begin
  begin perform place_store_catalog_order_v1(repeat('4', 64)::text, current_date + 7, '[{"productId":"00000000-0000-0000-0000-0000000000a4","quantity":1}]'::jsonb, '00000000-0000-0000-0000-000000000a02');
    assert false, 'other company product'; exception when raise_exception then assert sqlerrm = 'Product unavailable', sqlerrm; end;
  begin perform place_store_catalog_order_v1(repeat('4', 64)::text, current_date + 7, '[{"productId":"00000000-0000-0000-0000-0000000000a3","quantity":1}]'::jsonb, '00000000-0000-0000-0000-000000000a03');
    assert false, 'inactive product'; exception when raise_exception then assert sqlerrm = 'Product unavailable', sqlerrm; end;
  begin perform place_store_catalog_order_v1(repeat('4', 64)::text, current_date + 7,
      jsonb_build_array(jsonb_build_object('productId', '00000000-0000-0000-0000-0000000000a1', 'quantity', 1, 'memo', jsonb_build_object('text', repeat('가', 51), 'kind', 'product'))), '00000000-0000-0000-0000-000000000a04');
    assert false, '51 chars memo'; exception when raise_exception then assert sqlerrm = 'Invalid line memo', sqlerrm; end;
  begin perform place_store_catalog_order_v1(repeat('4', 64)::text, current_date + 7,
      '[{"productId":"00000000-0000-0000-0000-0000000000a1","quantity":1,"memo":{"text":"x","kind":"other"}}]'::jsonb, '00000000-0000-0000-0000-000000000a05');
    assert false, 'bad memo kind'; exception when raise_exception then assert sqlerrm = 'Invalid line memo', sqlerrm; end;
  begin perform place_store_catalog_order_v1(repeat('d', 64)::text, current_date + 7, '[{"productId":"00000000-0000-0000-0000-0000000000a1","quantity":1}]'::jsonb, '00000000-0000-0000-0000-000000000a06');
    assert false, 'document link token must not place catalog orders'; exception when raise_exception then assert sqlerrm = 'Link unavailable', sqlerrm; end;
  begin perform place_store_catalog_member_order_v1(repeat('4', 64)::text, current_date + 7, '[{"productId":"00000000-0000-0000-0000-0000000000a1","quantity":1}]'::jsonb, '00000000-0000-0000-0000-000000000a07');
    assert false, 'member entry needs a member'; exception when raise_exception then assert sqlerrm = 'Store member unavailable', sqlerrm; end;
  assert not has_function_privilege('anon', 'place_store_catalog_order_v1(text,date,jsonb,uuid,uuid,integer,text)', 'execute');
  assert not has_function_privilege('authenticated', 'place_store_catalog_order_core_v1(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)', 'execute');
  assert has_function_privilege('service_role', 'place_store_catalog_order_v1(text,date,jsonb,uuid,uuid,integer,text)', 'execute');
end $$;

-- down: 전체 상품 링크·주문·메모가 있으면 거부
\set ON_ERROR_STOP off
\ir 20261113-CC-36b-catalog-order.down.sql
\set ON_ERROR_STOP on
do $$ begin
  assert exists (select 1 from information_schema.columns where table_name = 'storefront_links' and column_name = 'source'), 'down must refuse while catalog data exists';
end $$;
-- 비운 뒤 down 성공(기존 문서 링크·주문은 그대로)
delete from store_order_requests; delete from store_order_lines; delete from store_orders where document_version_id is null; delete from storefront_links where source = 'catalog';
\ir 20261113-CC-36b-catalog-order.down.sql
do $$ begin
  assert not exists (select 1 from information_schema.columns where table_name = 'storefront_links' and column_name = 'source');
  assert not exists (select 1 from information_schema.columns where table_name = 'store_order_lines' and column_name = 'line_memo');
  assert (select count(*) from storefront_links) = 1 and (select count(*) from store_orders) = 1, 'document rows survive the round trip';
  assert to_regprocedure('place_store_catalog_order_v1(text,date,jsonb,uuid,uuid,integer,text)') is null;
end $$;

-- CX-148b PG17: CX-120 → CX-148 → CX-148b 순서로 적용하고, 홍곱창 운영 데이터 모양(회수된 document 링크 + 만료된 가입 문서 + 활성 회사 기본 단가표)에서 단가표 가격 = 주문 가격을 증명한다. service_role로 호출.
\set ON_ERROR_STOP on
do $$ begin if current_setting('server_version_num')::int not between 170000 and 179999 then raise exception 'PostgreSQL 17 required'; end if; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

create table public.product_catalog (
  id uuid primary key, company_id uuid not null, sales_unit text not null,
  tax_type text not null, order_pricing_mode text not null default 'fixed', is_active boolean not null default true
);
create table public.pricing_documents (id uuid primary key, company_id uuid not null, kind text not null default 'sheet', archived_at timestamptz, updated_at timestamptz not null default now());
create table public.pricing_document_versions (
  id uuid primary key, company_id uuid not null, document_id uuid not null,
  content jsonb not null, published_at timestamptz
);
create table public.customer_pricing_document_links (
  id uuid primary key, company_id uuid not null, customer_id uuid not null,
  document_id uuid not null, document_version_id uuid not null, active boolean not null, linked_at timestamptz not null
);
create table public.pricing_document_sends (
  id uuid primary key default gen_random_uuid(), company_id uuid not null, customer_id uuid not null,
  document_version_id uuid not null, acceptance_status text not null, sent_at timestamptz not null default now()
);
create table public.store_owner_activation_requests (
  id uuid primary key default gen_random_uuid(), company_id uuid not null, customer_id uuid, document_id uuid,
  consumed_at timestamptz, cancelled_at timestamptz
);
create table public.storefront_links (
  id uuid primary key default gen_random_uuid(), company_id uuid not null, customer_id uuid not null, document_version_id uuid,
  source text not null default 'document', issued_at timestamptz not null default now(), expires_at timestamptz not null default now() + interval '1 year', revoked_at timestamptz
);
create table public.pricing_document_share_links (
  id uuid primary key default gen_random_uuid(), company_id uuid not null, document_id uuid not null, lead_id uuid, send_id uuid,
  revoked_at timestamptz, expires_at timestamptz not null default now() + interval '1 year'
);
create table public.pricing_default_public_documents (company_id uuid primary key, document_id uuid not null);
create table public.price_fixture (company_id uuid not null, customer_id uuid not null, product_id uuid not null, catalog_price bigint, base_price bigint);
create view public.pricing_p0_effective with (security_invoker=true) as
  select company_id, product_id, base_price as price from public.price_fixture;
create function public.margin_template_price_v1(p_company uuid, p_customer uuid, p_product uuid)
returns bigint language sql stable set search_path = '' as $$
  select f.catalog_price from public.price_fixture f
  where f.company_id = p_company and f.customer_id = p_customer and f.product_id = p_product
$$;
grant all on all tables in schema public to service_role;
grant usage on schema public to service_role;

\ir 2026-11-18-CX-120-store-price-v2.sql
\ir 2026-11-25-CX-148-order-price-received-documents.sql
\ir 2026-11-25-CX-148b-order-price-store-home-source.sql

-- 회사 C1(홍곱창형). 상품: 1 계란(면세·행사) 2 버터(과세) 3 기본가만 4 문서에 없음 5 카탈로그가 있는 상품(거래처 전용 가격)
insert into public.product_catalog select ('30000000-0000-4000-8000-00000000000' || n)::uuid, '10000000-0000-4000-8000-000000000001', 'EA',
  case when n = 2 then 'taxable' else 'exempt' end, 'fixed', true from generate_series(1, 5) n;
insert into public.product_catalog values ('30000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-000000000002', 'EA', 'exempt', 'fixed', true);
-- 홍곱창형 거래처 K1·다른 거래처 K2는 같은 회사. 기본가: 계란 6400(행사가보다 비쌈), 버터 6850(단가표 최신 6845와 5원 차이). 상품5는 K1에 카탈로그 가격 4000.
insert into public.price_fixture select '10000000-0000-4000-8000-000000000001', c, ('30000000-0000-4000-8000-00000000000' || n)::uuid,
  case when n = 5 and c = '20000000-0000-4000-8000-000000000001'::uuid then 4000 end, b
  from (values (1, 6400), (2, 6850), (3, 1000), (4, 900), (5, 7000)) p(n, b),
       unnest(array['20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003']::uuid[]) c;
insert into public.price_fixture values ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-0000000000b1', '30000000-0000-4000-8000-0000000000b1', null, 500);

-- 문서 A: 이번 달 단가표(sheet, 게시 v4·v5). 회사 기본 단가표로 활성 공개 링크가 있다.
-- 문서 B: 전체 단가표(quote, 11/18 만료) — 홍곱창이 가입에 쓴 문서.
-- 문서 D: 다른 sheet(더 오래전 수정, 지정 기본 단가표 시험용). 문서 E: 보관됨. 문서 F: 회사2의 sheet(다른 회사로 새면 안 됨).
insert into public.pricing_documents values
  ('40000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000001', 'sheet', null, '2026-11-25 07:53+00'),
  ('40000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-000000000001', 'quote', null, '2026-11-22 11:15+00'),
  ('40000000-0000-4000-8000-00000000000d', '10000000-0000-4000-8000-000000000001', 'sheet', null, '2026-11-20 00:00+00'),
  ('40000000-0000-4000-8000-00000000000e', '10000000-0000-4000-8000-000000000001', 'sheet', now(), '2026-11-26 00:00+00'),
  ('40000000-0000-4000-8000-00000000000f', '10000000-0000-4000-8000-000000000002', 'sheet', null, '2026-11-25 00:00+00');
insert into public.pricing_document_versions values
  ('50000000-0000-4000-8000-0000000000a4', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-00000000000a',
   '{"kind":"sheet","showPrice":true,"validUntil":"2026-11-30","display":{"priceIncludesTax":false},"lines":[
     {"productId":"30000000-0000-4000-8000-000000000001","unit":"EA","visible":true,"price":5500,"taxType":"exempt","promotionId":"promo-1","endsOn":"2026-11-30"},
     {"productId":"30000000-0000-4000-8000-000000000002","unit":"EA","visible":true,"price":6850,"taxType":"taxable"}]}'::jsonb, '2026-11-24 07:39+00'),
  ('50000000-0000-4000-8000-0000000000a5', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-00000000000a',
   '{"kind":"sheet","showPrice":true,"validUntil":"2026-11-30","display":{"priceIncludesTax":false},"lines":[
     {"productId":"30000000-0000-4000-8000-000000000001","unit":"EA","visible":true,"price":5500,"taxType":"exempt","promotionId":"promo-1","endsOn":"2026-11-30"},
     {"productId":"30000000-0000-4000-8000-000000000002","unit":"EA","visible":true,"price":6845,"taxType":"taxable"},
     {"productId":"30000000-0000-4000-8000-000000000005","unit":"EA","visible":true,"price":6500,"taxType":"exempt"}]}'::jsonb, '2026-11-24 18:32+00'),
  ('50000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-00000000000b',
   '{"kind":"quote","showPrice":true,"validUntil":"2026-11-18","lines":[{"productId":"30000000-0000-4000-8000-000000000003","unit":"EA","visible":true,"price":10,"taxType":"exempt"}]}'::jsonb, '2026-11-22 11:15+00'),
  ('50000000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-00000000000d',
   '{"kind":"sheet","showPrice":true,"validUntil":"2026-12-31","lines":[{"productId":"30000000-0000-4000-8000-000000000003","unit":"EA","visible":true,"price":777,"taxType":"exempt"}]}'::jsonb, '2026-11-20 00:00+00'),
  ('50000000-0000-4000-8000-0000000000e1', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-00000000000e',
   '{"kind":"sheet","showPrice":true,"validUntil":"2026-12-31","lines":[{"productId":"30000000-0000-4000-8000-000000000003","unit":"EA","visible":true,"price":1,"taxType":"exempt"}]}'::jsonb, '2026-11-26 00:00+00'),
  ('50000000-0000-4000-8000-0000000000f1', '10000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-00000000000f',
   '{"kind":"sheet","showPrice":true,"validUntil":"2026-12-31","lines":[{"productId":"30000000-0000-4000-8000-0000000000b1","unit":"EA","visible":true,"price":100,"taxType":"exempt"}]}'::jsonb, '2026-11-25 00:00+00');
-- 운영 데이터 모양: 활성 공개 링크 1개(문서 A) + 회수된 공개 링크 여러 개
insert into public.pricing_document_share_links(company_id, document_id, revoked_at) values
  ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-00000000000a', null),
  ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-00000000000a', '2026-11-24 09:55+00'),
  ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-00000000000b', '2026-11-23 05:22+00'),
  ('10000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-00000000000f', null);
-- K1: 회수된 document 링크(v4) + 활성 catalog 링크(문서 없음) + 만료된 문서 B로 가입. links·sends 0건.
insert into public.storefront_links(company_id, customer_id, document_version_id, source, revoked_at) values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-0000000000a4', 'document', '2026-11-24 09:55+00'),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', null, 'catalog', null);
insert into public.store_owner_activation_requests(company_id, customer_id, document_id, consumed_at) values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-00000000000b', '2026-11-10 03:45+00');

set role service_role;
do $t$
declare c uuid := '10000000-0000-4000-8000-000000000001'; r record;
  k1 uuid := '20000000-0000-4000-8000-000000000001'; k2 uuid := '20000000-0000-4000-8000-000000000002'; k3 uuid := '20000000-0000-4000-8000-000000000003';
  p1 uuid := '30000000-0000-4000-8000-000000000001'; p2 uuid := '30000000-0000-4000-8000-000000000002'; p3 uuid := '30000000-0000-4000-8000-000000000003';
  p4 uuid := '30000000-0000-4000-8000-000000000004'; p5 uuid := '30000000-0000-4000-8000-000000000005';
begin
  -- 1. 홍곱창 모양: 후보 3곳이 없어도 홈의 받은 단가표(회사 기본 단가표 A, 최신 v5) 가격이 주문가
  select * into r from public.self_order_price_v2(c, k1, p1, '2026-11-25', true);
  if (r.price, r.source, r.promise_until) is distinct from (5500::bigint, 'promise'::text, '2026-11-30'::date) then raise exception 'hong_egg_%', row_to_json(r); end if;
  select * into r from public.self_order_price_v2(c, k1, p2, '2026-11-25', true);
  if (r.price, r.source, r.tax_type) is distinct from (6845::bigint, 'promise'::text, 'taxable'::text) then raise exception 'hong_butter_%', row_to_json(r); end if;
  -- 2. 문서에 없는 상품은 기본가
  select * into r from public.self_order_price_v2(c, k1, p4, '2026-11-25', true);
  if (r.price, r.source) is distinct from (900::bigint, 'base'::text) then raise exception 'not_in_sheet_%', row_to_json(r); end if;
  -- 3. 거래처 전용(카탈로그) 가격이 있으면 회사 기본 단가표가 덮지 않는다
  select * into r from public.self_order_price_v2(c, k1, p5, '2026-11-25', true);
  if (r.price, r.source) is distinct from (4000::bigint, 'catalog'::text) then raise exception 'catalog_overridden_%', row_to_json(r); end if;
  select * into r from public.self_order_price_v2(c, k2, p5, '2026-11-25', true);
  if (r.price, r.source) is distinct from (6500::bigint, 'promise'::text) then raise exception 'k2_sheet_%', row_to_json(r); end if;
  -- 4. 만료된 가입 문서(B, quote)와 회수된 document 링크는 단독 근거가 아니다(상품 3은 B에만 있음 → 기본가)
  select * into r from public.self_order_price_v2(c, k1, p3, '2026-11-25', true);
  if (r.price, r.source) is distinct from (1000::bigint, 'base'::text) then raise exception 'expired_activation_used_%', row_to_json(r); end if;
  -- 5. 기본 단가표 기간이 지나면 기본가
  select * into r from public.self_order_price_v2(c, k1, p1, '2026-12-01', true);
  if r.source <> 'base' then raise exception 'expired_sheet_%', row_to_json(r); end if;
  -- 6. 다른 회사의 기본 단가표는 새지 않는다
  select * into r from public.self_order_price_v2('10000000-0000-4000-8000-000000000001', k1, '30000000-0000-4000-8000-0000000000b1', '2026-11-25', true);
  if r.price is not null then raise exception 'other_company_product_visible_%', row_to_json(r); end if;
  -- 7. include_promise=false는 기본 단가표도 보지 않는다
  select * into r from public.self_order_price_v2(c, k1, p1, '2026-11-25', false);
  if r.source <> 'base' then raise exception 'no_promise_%', row_to_json(r); end if;
end $t$;

-- 8. 활성 storefront 링크(회수 안 됨)는 그 문서의 최신 게시본. 회수된 링크는 근거가 아님. 기본 단가표보다 우선.
reset role;
insert into public.pricing_document_versions values
  ('50000000-0000-4000-8000-0000000000d2', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-00000000000d',
   '{"kind":"sheet","showPrice":true,"validUntil":"2026-12-31","lines":[{"productId":"30000000-0000-4000-8000-000000000003","unit":"EA","visible":true,"price":700,"taxType":"exempt"}]}'::jsonb, '2026-11-25 10:00+00');
insert into public.storefront_links(company_id, customer_id, document_version_id, source, revoked_at) values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-0000000000d1', 'document', null),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-0000000000d1', 'document', '2026-11-24 00:00+00');
set role service_role;
do $t$
declare c uuid := '10000000-0000-4000-8000-000000000001'; r record; p3 uuid := '30000000-0000-4000-8000-000000000003';
begin
  select * into r from public.self_order_price_v2(c, '20000000-0000-4000-8000-000000000002', p3, '2026-11-25', true);
  if (r.price, r.source) is distinct from (700::bigint, 'promise'::text) then raise exception 'active_link_latest_%', row_to_json(r); end if;
  select * into r from public.self_order_price_v2(c, '20000000-0000-4000-8000-000000000003', p3, '2026-11-25', true);
  if (r.price, r.source) is distinct from (1000::bigint, 'base'::text) then raise exception 'revoked_link_used_%', row_to_json(r); end if;
end $t$;

-- 9. 지정한 기본 단가표(pricing_default_public_documents)가 최근 수정 sheet보다 우선, 활성 공개 링크가 없으면 기본 단가표 없음
reset role;
update public.pricing_default_public_documents set document_id = document_id where false;
insert into public.pricing_default_public_documents values ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-00000000000d');
insert into public.pricing_document_share_links(company_id, document_id) values ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-00000000000d');
set role service_role;
do $t$
declare r record; c uuid := '10000000-0000-4000-8000-000000000001';
begin
  select * into r from public.self_order_price_v2(c, '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', '2026-11-25', true);
  if (r.price, r.source) is distinct from (700::bigint, 'promise'::text) then raise exception 'pinned_default_%', row_to_json(r); end if;
  select * into r from public.self_order_price_v2(c, '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '2026-11-25', true);
  if r.source <> 'base' then raise exception 'pinned_default_replaces_latest_%', row_to_json(r); end if;
end $t$;
reset role;
update public.pricing_document_share_links set revoked_at = now() where document_id = '40000000-0000-4000-8000-00000000000d';
set role service_role;
do $t$ declare r record; begin
  select * into r from public.self_order_price_v2('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', '2026-11-25', true);
  if r.source <> 'base' then raise exception 'default_without_active_link_used_%', row_to_json(r); end if;
end $t$;

-- 10. 단가표 가격 = 주문 가격 비교 행렬(과세·세금 포함 표시·반올림): 홈의 기본 단가표 경로
reset role;
delete from public.pricing_default_public_documents;
create temp table parity(n int, price bigint, tax text, incl boolean);
insert into parity values (1, 6845, 'taxable', false), (2, 6850, 'taxable', true), (3, 6223, 'taxable', true), (4, 5500, 'exempt', true),
  (5, 4545, 'taxable', true), (6, 9999, 'taxable', true), (7, 5, 'taxable', true);
do $$ declare m record; got record; want bigint; begin
  for m in select * from parity loop
    insert into public.pricing_document_versions values ('50000000-0000-4000-8000-0000000000f9', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-00000000000a',
      jsonb_build_object('kind', 'sheet', 'showPrice', true, 'validUntil', '2026-12-31', 'display', jsonb_build_object('priceIncludesTax', m.incl),
        'lines', jsonb_build_array(jsonb_build_object('productId', '30000000-0000-4000-8000-000000000004', 'unit', 'EA', 'visible', true, 'price', m.price, 'taxType', m.tax))),
      '2026-11-26 09:00+00');
    select * into got from public.self_order_price_v2('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004', '2026-11-26', true);
    want := case when m.tax = 'taxable' and m.incl then round(m.price * 1.1)::bigint else m.price end;
    if got.price is distinct from want or got.source <> 'promise' then raise exception 'parity_case_% want % got %', m.n, want, row_to_json(got); end if;
    delete from public.pricing_document_versions where id = '50000000-0000-4000-8000-0000000000f9';
  end loop;
end $$;

-- 11. 권한
set role authenticated;
do $t$ declare ok boolean := false; begin
  begin perform * from public.self_order_price_v2('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '2026-11-25', true);
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'authenticated_can_call'; end if;
end $t$;
reset role;

-- 12. down: CX-148 본문으로 복귀하면 기본 단가표·storefront 링크 후보가 사라진다(가입 문서는 CX-148 규칙 그대로)
\ir 2026-11-25-CX-148b-order-price-store-home-source.down.sql
do $$ declare r record; begin
  select * into r from public.self_order_price_v2('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '2026-11-25', true);
  if r.source <> 'base' then raise exception 'down_not_restored_%', row_to_json(r); end if;
  if (select position('cx148b' in prosrc) from pg_proc where oid = 'public.self_order_price_v2(uuid,uuid,uuid,date,boolean)'::regprocedure) > 0 then raise exception 'down_marker_left'; end if;
  if (select position('cx148' in prosrc) from pg_proc where oid = 'public.self_order_price_v2(uuid,uuid,uuid,date,boolean)'::regprocedure) = 0 then raise exception 'down_lost_cx148'; end if;
  if not has_function_privilege('service_role', 'public.self_order_price_v2(uuid,uuid,uuid,date,boolean)', 'execute') then raise exception 'down_lost_grant'; end if;
end $$;
select 'CX-148b PG17 OK' as result;

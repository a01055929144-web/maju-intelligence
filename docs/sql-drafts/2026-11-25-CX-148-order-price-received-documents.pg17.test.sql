-- CX-148 PG17: CX-120 초안(운영 현재 함수) 위에 CX-148 초안을 적용하고, "받은 단가표 가격 = 주문 가격"을 행사·반올림 포함해 비교한다. service_role로 호출.
\set ON_ERROR_STOP on
do $$ begin if current_setting('server_version_num')::int not between 170000 and 179999 then raise exception 'PostgreSQL 17 required'; end if; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

create table public.product_catalog (
  id uuid primary key, company_id uuid not null, sales_unit text not null,
  tax_type text not null, order_pricing_mode text not null default 'fixed', is_active boolean not null default true
);
create table public.pricing_documents (id uuid primary key, company_id uuid not null, archived_at timestamptz);
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

-- 상품: 1 계란(면세·행사) 2 버터(과세·단가표 반올림) 3 기본가만 4 행사 끝남 5 행사 시작 전 6 행사 재고 0 7 과세·세금포함 줄 8 과세·문서 세금포함 표시
insert into public.product_catalog select ('30000000-0000-4000-8000-00000000000' || n)::uuid, '10000000-0000-4000-8000-000000000001', 'EA',
  case when n in (2, 7, 8) then 'taxable' else 'exempt' end, 'fixed', true from generate_series(1, 8) n;
-- 기본가(주문 fallback). 계란은 행사가보다 비싸고, 버터 기본가 6850은 단가표 v5의 6845와 5원 차이.
insert into public.price_fixture select '10000000-0000-4000-8000-000000000001', c, ('30000000-0000-4000-8000-00000000000' || n)::uuid, null, b
  from (values (1, 6400), (2, 6850), (3, 1000), (4, 6400), (5, 6400), (6, 6400), (7, 3000), (8, 6850)) p(n, b),
       unnest(array['20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003',
                     '20000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000005']::uuid[]) c;

insert into public.pricing_documents values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', null),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', null),
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', now());
-- 문서1: v4(11/24 07:39)와 v5(11/24 18:32). 행사 줄은 promotionId·startsOn·endsOn·remaining.
insert into public.pricing_document_versions values
  ('50000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
   '{"showPrice":true,"validUntil":"2026-11-30","display":{"priceIncludesTax":false},"lines":[
     {"productId":"30000000-0000-4000-8000-000000000001","unit":"EA","visible":true,"price":5500,"taxType":"exempt","promotionId":"promo-1","endsOn":"2026-11-30"},
     {"productId":"30000000-0000-4000-8000-000000000002","unit":"EA","visible":true,"price":6850,"taxType":"taxable"}]}'::jsonb, '2026-11-24 07:39+00'),
  ('50000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
   '{"showPrice":true,"validUntil":"2026-11-30","display":{"priceIncludesTax":false},"lines":[
     {"productId":"30000000-0000-4000-8000-000000000001","unit":"EA","visible":true,"price":5500,"taxType":"exempt","promotionId":"promo-1","endsOn":"2026-11-30"},
     {"productId":"30000000-0000-4000-8000-000000000002","unit":"EA","visible":true,"price":6845,"taxType":"taxable"},
     {"productId":"30000000-0000-4000-8000-000000000004","unit":"EA","visible":true,"price":5000,"taxType":"exempt","promotionId":"promo-4","endsOn":"2026-11-27"},
     {"productId":"30000000-0000-4000-8000-000000000005","unit":"EA","visible":true,"price":5000,"taxType":"exempt","promotionId":"promo-5","startsOn":"2026-11-29"},
     {"productId":"30000000-0000-4000-8000-000000000006","unit":"EA","visible":true,"price":5000,"taxType":"exempt","promotionId":"promo-6","remaining":0},
     {"productId":"30000000-0000-4000-8000-000000000007","unit":"EA","visible":true,"price":3300,"taxType":"taxable","promotionId":"promo-7","priceIncludesTax":true,"endsOn":"2026-11-29"}]}'::jsonb, '2026-11-24 18:32+00'),
  -- 문서2: 단가표 전체가 세금 포함 표시(display.priceIncludesTax) — 과세 줄은 round(price*1.1)
  ('50000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002',
   '{"showPrice":true,"validUntil":"2026-12-31","display":{"priceIncludesTax":true},"lines":[
     {"productId":"30000000-0000-4000-8000-000000000008","unit":"EA","visible":true,"price":6223,"taxType":"taxable"}]}'::jsonb, '2026-11-24 09:00+00'),
  -- 보관(archived)된 문서3의 게시본
  ('50000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003',
   '{"showPrice":true,"validUntil":"2026-12-31","lines":[{"productId":"30000000-0000-4000-8000-000000000003","unit":"EA","visible":true,"price":10,"taxType":"exempt"}]}'::jsonb, '2026-11-24 09:00+00');

-- 거래처 K1(홍곱창형): 가입에 쓴 문서1(링크 0건, v4가 묶여 있어도 최신 게시 v5를 따른다). K2: 관계 없음. K3: 취소된 가입 요청. K4: 발송 수락(문서2). K5: 발송 거절 + 보관 문서 가입.
insert into public.store_owner_activation_requests(company_id, customer_id, document_id, consumed_at, cancelled_at) values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', now(), null),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000001', now(), now()),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000003', now(), null);
insert into public.pricing_document_sends(company_id, customer_id, document_version_id, acceptance_status) values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000006', 'accepted'),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000006', 'rejected');

set role service_role;
do $t$
declare c uuid := '10000000-0000-4000-8000-000000000001'; r record;
  k1 uuid := '20000000-0000-4000-8000-000000000001'; k2 uuid := '20000000-0000-4000-8000-000000000002'; k3 uuid := '20000000-0000-4000-8000-000000000003';
  k4 uuid := '20000000-0000-4000-8000-000000000004'; k5 uuid := '20000000-0000-4000-8000-000000000005';
  p1 uuid := '30000000-0000-4000-8000-000000000001'; p2 uuid := '30000000-0000-4000-8000-000000000002'; p3 uuid := '30000000-0000-4000-8000-000000000003';
  p4 uuid := '30000000-0000-4000-8000-000000000004'; p5 uuid := '30000000-0000-4000-8000-000000000005'; p6 uuid := '30000000-0000-4000-8000-000000000006';
  p7 uuid := '30000000-0000-4000-8000-000000000007'; p8 uuid := '30000000-0000-4000-8000-000000000008';
begin
  -- 1. 행사 줄: 단가표 5,500(행사)이 주문가(base 6,400)보다 우선. 행사 끝나는 날까지.
  select * into r from public.self_order_price_v2(c, k1, p1, '2026-11-25', true);
  if (r.price, r.source, r.promise_until) is distinct from (5500::bigint, 'promise'::text, '2026-11-30'::date) then raise exception 'promo_line_%', row_to_json(r); end if;
  -- 2. 반올림: 최신 게시 v5의 6,845(기본가 6,850이 아님). v4가 묶여 있어도 최신 게시본을 따른다.
  select * into r from public.self_order_price_v2(c, k1, p2, '2026-11-25', true);
  if (r.price, r.source, r.includes_tax) is distinct from (6845::bigint, 'promise'::text, false) then raise exception 'rounding_%', row_to_json(r); end if;
  -- 3. 단가표에 없는 품목: 기본가
  select * into r from public.self_order_price_v2(c, k1, p3, '2026-11-25', true);
  if (r.price, r.source) is distinct from (1000::bigint, 'base'::text) then raise exception 'not_in_document_%', row_to_json(r); end if;
  -- 4. 행사 기간·재고: 끝남/시작 전/재고 0은 단가표 행사가를 쓰지 않고 기본가
  select * into r from public.self_order_price_v2(c, k1, p4, '2026-11-28', true);
  if (r.price, r.source) is distinct from (6400::bigint, 'base'::text) then raise exception 'ended_promo_used_%', row_to_json(r); end if;
  select * into r from public.self_order_price_v2(c, k1, p4, '2026-11-27', true);
  if (r.price, r.source) is distinct from (5000::bigint, 'promise'::text) then raise exception 'last_promo_day_%', row_to_json(r); end if;
  select * into r from public.self_order_price_v2(c, k1, p5, '2026-11-25', true);
  if (r.price, r.source) is distinct from (6400::bigint, 'base'::text) then raise exception 'future_promo_used_%', row_to_json(r); end if;
  select * into r from public.self_order_price_v2(c, k1, p6, '2026-11-25', true);
  if (r.price, r.source) is distinct from (6400::bigint, 'base'::text) then raise exception 'sold_out_promo_used_%', row_to_json(r); end if;
  -- 5. 줄 단위 세금 포함 가격은 그대로(곱하지 않음), 문서 전체 세금 포함 표시는 round(price*1.1)
  select * into r from public.self_order_price_v2(c, k1, p7, '2026-11-25', true);
  if (r.price, r.includes_tax, r.promise_until) is distinct from (3300::bigint, true, '2026-11-29'::date) then raise exception 'line_incl_%', row_to_json(r); end if;
  select * into r from public.self_order_price_v2(c, k4, p8, '2026-11-25', true);
  if (r.price, r.includes_tax, r.source) is distinct from (6845::bigint, true, 'promise'::text) then raise exception 'doc_incl_send_%', row_to_json(r); end if;
  -- 6. 문서 만료 다음 날은 기본가(원래 CX-120 규칙)
  select * into r from public.self_order_price_v2(c, k1, p1, '2026-12-01', true);
  if (r.price, r.source) is distinct from (6400::bigint, 'base'::text) then raise exception 'expired_%', row_to_json(r); end if;
  -- 7. 관계 없는 거래처·취소된 가입 요청·거절된 발송·보관 문서는 단가표 가격을 받지 않는다
  select * into r from public.self_order_price_v2(c, k2, p1, '2026-11-25', true);
  if r.source <> 'base' then raise exception 'unrelated_customer_%', row_to_json(r); end if;
  select * into r from public.self_order_price_v2(c, k3, p1, '2026-11-25', true);
  if r.source <> 'base' then raise exception 'cancelled_request_%', row_to_json(r); end if;
  select * into r from public.self_order_price_v2(c, k5, p8, '2026-11-25', true);
  if r.source <> 'base' then raise exception 'rejected_send_%', row_to_json(r); end if;
  select * into r from public.self_order_price_v2(c, k5, p3, '2026-11-25', true);
  if r.source <> 'base' then raise exception 'archived_document_%', row_to_json(r); end if;
  -- 8. include_promise=false는 단가표를 보지 않는다(확장 줄 규칙 그대로)
  select * into r from public.self_order_price_v2(c, k1, p1, '2026-11-25', false);
  if r.source <> 'base' then raise exception 'no_promise_%', row_to_json(r); end if;
end $t$;

-- 9. 단가표 가격 = 주문 가격 비교 행렬. 단가표 화면 규칙(documentDisplayPrice: 과세 + 세금포함 표시 → round(price*1.1))과 같은 값을 주문 함수가 돌려준다.
reset role;
create temp table parity(n int, price bigint, tax text, incl boolean) on commit drop;
insert into parity values (1, 6845, 'taxable', false), (2, 6850, 'taxable', true), (3, 6223, 'taxable', true), (4, 5500, 'exempt', true),
  (5, 6500, 'exempt', false), (6, 4545, 'taxable', true), (7, 9999, 'taxable', true), (8, 5, 'taxable', true);
do $$ declare m record; got record; want bigint; begin
  for m in select * from parity loop
    delete from public.pricing_document_versions where id = '50000000-0000-4000-8000-0000000000f1';
    insert into public.pricing_document_versions values ('50000000-0000-4000-8000-0000000000f1', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
      jsonb_build_object('showPrice', true, 'validUntil', '2026-12-31', 'display', jsonb_build_object('priceIncludesTax', m.incl),
        'lines', jsonb_build_array(jsonb_build_object('productId', '30000000-0000-4000-8000-000000000003', 'unit', 'EA', 'visible', true, 'price', m.price, 'taxType', m.tax))),
      '2026-11-25 09:00+00');
    select * into got from public.self_order_price_v2('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', '2026-11-25', true);
    want := case when m.tax = 'taxable' and m.incl then round(m.price * 1.1)::bigint else m.price end;
    if got.price is distinct from want or got.source <> 'promise' then raise exception 'parity_case_% want % got %', m.n, want, row_to_json(got); end if;
  end loop;
  delete from public.pricing_document_versions where id = '50000000-0000-4000-8000-0000000000f1';
end $$;

-- 10. 권한: service_role만 호출(authenticated 거부)
set role authenticated;
do $t$ declare ok boolean := false; begin
  begin perform * from public.self_order_price_v2('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '2026-11-25', true);
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'authenticated_can_call'; end if;
end $t$;
reset role;

-- 11. down: CX-120 본문으로 복귀하면 행사 줄·가입 문서가 다시 무시된다
\ir 2026-11-25-CX-148-order-price-received-documents.down.sql
do $$ declare r record; begin
  select * into r from public.self_order_price_v2('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '2026-11-25', true);
  if r.source <> 'base' then raise exception 'down_not_restored_%', row_to_json(r); end if;
  if not has_function_privilege('service_role', 'public.self_order_price_v2(uuid,uuid,uuid,date,boolean)', 'execute') then raise exception 'down_lost_grant'; end if;
end $$;
select 'CX-148 PG17 OK' as result;

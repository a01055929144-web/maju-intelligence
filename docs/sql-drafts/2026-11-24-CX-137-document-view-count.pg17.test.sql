-- CX-137 PG17: 조회수는 공개 문서 읽기(record_pricing_document_view_v1) 한 곳에서만 센다.
-- 운영과 같은 열·제약 일부를 가진 합성 표. 운영의 짧은 주소 함수(조회수 집계 포함)는 down 파일의 정의와 같다.
\set ON_ERROR_STOP on
do $r$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $r$;
begin;
create table public.pricing_document_share_links(
  id uuid not null, company_id uuid not null, lead_id uuid, short_code text, document_id uuid, document_version_id uuid,
  expires_at timestamptz not null, revoked_at timestamptz,
  first_viewed_at timestamptz, last_viewed_at timestamptz, view_count bigint not null default 0, primary key (company_id, id));
create table public.pricing_document_share_events(
  id uuid primary key default gen_random_uuid(), company_id uuid not null, share_link_id uuid not null,
  event_type text not null check (event_type in ('view','order_start','signup','first_order')),
  device_class text check (device_class in ('mobile','desktop','tablet','unknown')),
  requester_hash text check (requester_hash is null or requester_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key text, occurred_at timestamptz not null default clock_timestamp());
create function public.pricing_s2_public_request_guard(uuid, text, text, jsonb, integer) returns text
  language sql as $$ select 'allowed'::text $$;
commit;

-- 운영 현재 상태: 짧은 주소 해석 함수가 조회수를 올린다(down 파일이 같은 정의).
\ir 2026-11-24-CX-137-document-view-count.down.sql
begin;
insert into public.pricing_document_share_links(id, company_id, short_code, expires_at) values
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','2345678ABC', now() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000c1','3456789BCD', now() + interval '1 day');
do $t$ begin
  perform public.resolve_pricing_document_short_link_v1('2345678ABC', repeat('a', 64), 'mobile');
  if (select view_count from public.pricing_document_share_links where short_code = '2345678ABC') <> 1 then raise exception 'precondition_old_counts'; end if;
end $t$;
rollback;

\ir 2026-11-24-CX-137-document-view-count.sql

begin;
insert into public.pricing_document_share_links(id, company_id, short_code, expires_at) values
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','2345678ABC', now() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000c1','3456789BCD', now() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-0000000000c1','4567892CDE', now() + interval '1 day');
insert into public.pricing_document_share_links(id, company_id, expires_at, revoked_at) values
  ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000c1', now() + interval '1 day', now());
insert into public.pricing_document_share_links(id, company_id, expires_at) values
  ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-0000000000c1', now() - interval '1 day');
do $t$
declare c uuid := '00000000-0000-0000-0000-0000000000c1'; l1 uuid := '00000000-0000-0000-0000-000000000001';
  l2 uuid := '00000000-0000-0000-0000-000000000002'; h1 text := repeat('a', 64); h2 text := repeat('b', 64); n bigint; r jsonb;
begin
  -- 짧은 주소로 한 번 열면 조회수 1: 해석 함수는 세지 않고, 이어서 공개 문서를 읽을 때만 센다.
  r := public.resolve_pricing_document_short_link_v1('2345678ABC', h1, 'mobile');
  if r->>'status' <> 'available' or (r->>'shareLinkId')::uuid <> l1 then raise exception 'short_not_resolved %', r; end if;
  select view_count into n from public.pricing_document_share_links where id = l1;
  if n <> 0 or exists (select 1 from public.pricing_document_share_events where share_link_id = l1) then raise exception 'resolve_must_not_count %', n; end if;
  if not public.record_pricing_document_view_v1(c, l1, 'mobile', h1) then raise exception 'document_read_not_counted'; end if;
  select view_count into n from public.pricing_document_share_links where id = l1;
  if n <> 1 then raise exception 'short_open_total_1 %', n; end if;
  if (select count(*) from public.pricing_document_share_events where share_link_id = l1 and event_type = 'view') <> 1 then raise exception 'short_open_events_1'; end if;
  -- 긴 주소로 한 번 열면 조회수 1: 공개 문서 읽기만.
  if not public.record_pricing_document_view_v1(c, l2, 'desktop', h2) then raise exception 'long_open_not_counted'; end if;
  select view_count into n from public.pricing_document_share_links where id = l2;
  if n <> 1 then raise exception 'long_open_total_1 %', n; end if;
  -- 미리보기 봇이 짧은 주소를 열어도 안 센다(해석 함수는 원래대로 응답).
  perform public.resolve_pricing_document_short_link_v1('4567892CDE', h1, 'unknown', true);
  select view_count into n from public.pricing_document_share_links where id = '00000000-0000-0000-0000-000000000004';
  if n <> 0 then raise exception 'bot_resolve_counted %', n; end if;
  -- 같은 방문자 10분 안 재요청은 안 센다 / 다른 방문자는 센다 / 식별 없으면 매번 센다
  if public.record_pricing_document_view_v1(c, l1, 'mobile', h1) then raise exception 'dup_counted'; end if;
  if not public.record_pricing_document_view_v1(c, l1, 'desktop', h2) then raise exception 'other_visitor_not_counted'; end if;
  if not public.record_pricing_document_view_v1(c, l1) or not public.record_pricing_document_view_v1(c, l1) then raise exception 'anonymous_not_counted'; end if;
  select view_count into n from public.pricing_document_share_links where id = l1;
  if n <> 4 then raise exception 'view_count_4 %', n; end if;
  if (select first_viewed_at is null or last_viewed_at is null from public.pricing_document_share_links where id = l1) then raise exception 'viewed_at_missing'; end if;
  -- 봇·만료·폐기·없는 링크·다른 회사는 안 센다
  if public.record_pricing_document_view_v1(c, l1, 'unknown', h2, true) then raise exception 'bot_counted'; end if;
  if public.record_pricing_document_view_v1(c, '00000000-0000-0000-0000-000000000005') then raise exception 'expired_counted'; end if;
  if public.record_pricing_document_view_v1(c, '00000000-0000-0000-0000-000000000003') then raise exception 'revoked_counted'; end if;
  if public.record_pricing_document_view_v1(c, '00000000-0000-0000-0000-0000000000ff') then raise exception 'missing_counted'; end if;
  if public.record_pricing_document_view_v1('00000000-0000-0000-0000-0000000000c2', l1) then raise exception 'cross_company_counted'; end if;
  begin perform public.record_pricing_document_view_v1(c, l1, 'tv'); raise exception 'bad_device_accepted';
  exception when others then if sqlerrm <> 'document_view_invalid' then raise; end if; end;
  begin perform public.record_pricing_document_view_v1(c, l1, 'unknown', 'xyz'); raise exception 'bad_hash_accepted';
  exception when others then if sqlerrm <> 'document_view_invalid' then raise; end if; end;
end $t$;
rollback;

-- down: 새 함수는 사라지고 짧은 주소 함수는 이전처럼 다시 센다. 표와 데이터는 그대로.
\ir 2026-11-24-CX-137-document-view-count.down.sql
begin;
insert into public.pricing_document_share_links(id, company_id, short_code, expires_at) values
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1','2345678ABC', now() + interval '1 day');
do $d$ begin
  if to_regprocedure('public.record_pricing_document_view_v1(uuid,uuid,text,text,boolean)') is not null then raise exception 'down_function_remains'; end if;
  perform public.resolve_pricing_document_short_link_v1('2345678ABC', repeat('a', 64), 'mobile');
  if (select view_count from public.pricing_document_share_links where short_code = '2345678ABC') <> 1 then raise exception 'down_old_counting_not_restored'; end if;
end $d$;
rollback;

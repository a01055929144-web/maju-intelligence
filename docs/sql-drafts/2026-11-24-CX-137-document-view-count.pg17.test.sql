-- CX-137 PG17: record_pricing_document_view_v1 (운영과 같은 열·제약 일부를 가진 합성 표)
\set ON_ERROR_STOP on
do $r$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $r$;
begin;
create table public.pricing_document_share_links(
  id uuid not null, company_id uuid not null, lead_id uuid, expires_at timestamptz not null, revoked_at timestamptz,
  first_viewed_at timestamptz, last_viewed_at timestamptz, view_count bigint not null default 0, primary key (company_id, id));
create table public.pricing_document_share_events(
  id uuid primary key default gen_random_uuid(), company_id uuid not null, share_link_id uuid not null,
  event_type text not null check (event_type in ('view','order_start','signup','first_order')),
  device_class text check (device_class in ('mobile','desktop','tablet','unknown')),
  requester_hash text check (requester_hash is null or requester_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key text, occurred_at timestamptz not null default clock_timestamp());
commit;

\ir 2026-11-24-CX-137-document-view-count.sql

begin;
insert into public.pricing_document_share_links(id, company_id, expires_at) values
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000c1', now() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000c1', now() - interval '1 day');
insert into public.pricing_document_share_links(id, company_id, expires_at, revoked_at) values
  ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000c1', now() + interval '1 day', now());
do $t$
declare c uuid := '00000000-0000-0000-0000-0000000000c1'; l1 uuid := '00000000-0000-0000-0000-000000000001';
  h1 text := repeat('a', 64); h2 text := repeat('b', 64); n bigint;
begin
  if not public.record_pricing_document_view_v1(c, l1, 'mobile', h1) then raise exception 'first_view_not_counted'; end if;
  select view_count into n from public.pricing_document_share_links where id = l1;
  if n <> 1 then raise exception 'view_count_1 %', n; end if;
  if (select first_viewed_at is null or last_viewed_at is null from public.pricing_document_share_links where id = l1) then raise exception 'viewed_at_missing'; end if;
  if public.record_pricing_document_view_v1(c, l1, 'mobile', h1) then raise exception 'dup_counted'; end if;
  if not public.record_pricing_document_view_v1(c, l1, 'desktop', h2) then raise exception 'other_visitor_not_counted'; end if;
  if not public.record_pricing_document_view_v1(c, l1) or not public.record_pricing_document_view_v1(c, l1) then raise exception 'anonymous_not_counted'; end if;
  select view_count into n from public.pricing_document_share_links where id = l1;
  if n <> 4 then raise exception 'view_count_4 %', n; end if;
  if (select count(*) from public.pricing_document_share_events where share_link_id = l1 and event_type = 'view') <> 4 then raise exception 'events_4'; end if;
  if public.record_pricing_document_view_v1(c, l1, 'unknown', h2, true) then raise exception 'bot_counted'; end if;
  if public.record_pricing_document_view_v1(c, '00000000-0000-0000-0000-000000000002') then raise exception 'expired_counted'; end if;
  if public.record_pricing_document_view_v1(c, '00000000-0000-0000-0000-000000000003') then raise exception 'revoked_counted'; end if;
  if public.record_pricing_document_view_v1(c, '00000000-0000-0000-0000-0000000000ff') then raise exception 'missing_counted'; end if;
  if public.record_pricing_document_view_v1('00000000-0000-0000-0000-0000000000c2', l1) then raise exception 'cross_company_counted'; end if;
  begin perform public.record_pricing_document_view_v1(c, l1, 'tv'); raise exception 'bad_device_accepted';
  exception when others then if sqlerrm <> 'document_view_invalid' then raise; end if; end;
  begin perform public.record_pricing_document_view_v1(c, l1, 'unknown', 'xyz'); raise exception 'bad_hash_accepted';
  exception when others then if sqlerrm <> 'document_view_invalid' then raise; end if; end;
end $t$;
rollback;

-- down: 함수는 사라지고 표와 데이터는 그대로
\ir 2026-11-24-CX-137-document-view-count.down.sql
do $d$ begin
  if to_regprocedure('public.record_pricing_document_view_v1(uuid,uuid,text,text,boolean)') is not null then raise exception 'down_function_remains'; end if;
  if to_regclass('public.pricing_document_share_links') is null then raise exception 'down_table_lost'; end if;
end $d$;

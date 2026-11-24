-- CX-135 PG17: field_records / field_record_photos / create_field_record_v1 (운영과 같은 열·제약 일부를 가진 합성 표)
\set ON_ERROR_STOP on
do $r$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $r$;
begin;
create table public.companies(id uuid primary key);
create table public.app_users(id uuid primary key);
create table public.normalized_customers(id uuid primary key, company_id uuid not null, unique (company_id, id));
create table public.business_permit_leads(id uuid primary key, company_id uuid not null, unique (company_id, id));
create table public.lead_actions(
  id uuid primary key default gen_random_uuid(), company_id uuid not null, lead_id uuid not null, action_type text not null,
  result text, memo text, actor_name text, created_at timestamptz not null default clock_timestamp(),
  collateral_types text[] not null default '{}', follow_up_at timestamptz, metadata jsonb not null default '{}');
grant select, insert on public.lead_actions to service_role;
commit;

\ir 2026-11-24-CX-135-field-records.sql

begin;
insert into public.companies values ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000c2');
insert into public.app_users values ('00000000-0000-0000-0000-0000000000a1');
insert into public.normalized_customers values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c2');
insert into public.business_permit_leads values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1');
commit;

begin;
do $t$
declare
  c uuid := '00000000-0000-0000-0000-0000000000c1'; a uuid := '00000000-0000-0000-0000-0000000000a1';
  cust uuid := '00000000-0000-0000-0000-0000000000b1'; lead uuid := '00000000-0000-0000-0000-0000000000d1';
  photo jsonb := '[{"kind":"photo","storage_path":"c1/a.jpg","mime_type":"image/jpeg","size_bytes":1000}]';
  r jsonb; n integer; msg text;
begin
  -- 비치 + 사진 1장 + 리드 연결: 방문 인정, 리드 영업 기록 한 줄(단가표·브로슈어)
  r := public.create_field_record_v1(c, a, null, 'placement', array['price_sheet','catalog'], cust, lead, null, 37.5665, 126.978, 12.5, now(), '문 앞에 두고 옴', 'idem-key-0001', photo, '합성 알바');
  if (r->>'countsAsVisit')::boolean is not true or (r->>'reused')::boolean then raise exception 'placement_with_photo %', r; end if;
  if (select photo_count from public.field_records where id = (r->>'id')::uuid) <> 1 then raise exception 'photo_count_1'; end if;
  if (select counts_as_visit from public.field_records where id = (r->>'id')::uuid) is not true then raise exception 'counts_as_visit_true'; end if;
  if (select collateral_types from public.lead_actions where lead_id = lead) <> array['단가표','브로슈어'] then raise exception 'lead_collateral'; end if;
  if (select metadata->>'fieldRecordId' from public.lead_actions where lead_id = lead) <> r->>'id' then raise exception 'lead_metadata'; end if;
  -- 같은 멱등 키는 새 기록을 만들지 않는다
  r := public.create_field_record_v1(c, a, null, 'placement', array['price_sheet','catalog'], cust, lead, null, 37.5665, 126.978, 12.5, now(), '문 앞에 두고 옴', 'idem-key-0001', photo, '합성 알바');
  if (r->>'reused')::boolean is not true then raise exception 'not_idempotent'; end if;
  if (select count(*) from public.field_records) <> 1 or (select count(*) from public.lead_actions) <> 1 then raise exception 'idempotent_duplicate'; end if;
  -- 사진 없는 비치는 저장되지만 방문 인정 안 됨(표시)
  r := public.create_field_record_v1(c, a, null, 'placement', array['quote'], null, lead, null, 37.5, 127.0, 30, now(), null, 'idem-key-0002', '[]', null);
  if (r->>'countsAsVisit')::boolean then raise exception 'no_photo_counted'; end if;
  if (select result from public.lead_actions where id = (r->>'leadActionId')::uuid) not like '%방문 인정 안 됨%' then raise exception 'lead_no_photo_label'; end if;
  -- 영상만 있으면 사진 수 0 → 인정 안 됨. 영상 30초·50MB는 통과
  r := public.create_field_record_v1(c, a, null, 'visit', '{}', null, null, null, 37.5, 127.0, 5, now(), null, 'idem-key-0003',
    '[{"kind":"video","storage_path":"c1/v.mp4","mime_type":"video/mp4","size_bytes":52428800,"duration_seconds":30}]', null);
  if (r->>'countsAsVisit')::boolean or (select photo_count from public.field_records where id = (r->>'id')::uuid) <> 0 then raise exception 'video_only_counted'; end if;
  -- 사진 + 영상 → 사진 1장으로 인정
  r := public.create_field_record_v1(c, a, null, 'flyer', '{}', cust, null, null, 37.5, 127.0, 5, now(), null, 'idem-key-0004',
    '[{"kind":"photo","storage_path":"c1/b.jpg","mime_type":"image/jpeg","size_bytes":10},{"kind":"video","storage_path":"c1/w.mp4","mime_type":"video/mp4","size_bytes":10,"duration_seconds":12.5}]', null);
  if (r->>'countsAsVisit')::boolean is not true then raise exception 'photo_plus_video'; end if;
end $t$;
rollback;

-- 거절 규칙(각각 실패해야 함)
begin;
create function pg_temp.expect_fail(p_name text, p_sql text) returns void language plpgsql as $f$
begin
  begin execute p_sql; exception when others then return; end;
  raise exception 'should_have_failed: %', p_name;
end $f$;
select pg_temp.expect_fail('video_31s', $q$ select public.create_field_record_v1('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',null,'visit','{}',null,null,null,37.5,127,5,now(),null,'idem-key-0101','[{"kind":"video","storage_path":"x","mime_type":"video/mp4","size_bytes":10,"duration_seconds":30.01}]',null) $q$);
select pg_temp.expect_fail('video_51mb', $q$ select public.create_field_record_v1('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',null,'visit','{}',null,null,null,37.5,127,5,now(),null,'idem-key-0102','[{"kind":"video","storage_path":"x","mime_type":"video/mp4","size_bytes":52428801,"duration_seconds":10}]',null) $q$);
select pg_temp.expect_fail('video_no_duration', $q$ select public.create_field_record_v1('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',null,'visit','{}',null,null,null,37.5,127,5,now(),null,'idem-key-0103','[{"kind":"video","storage_path":"x","mime_type":"video/mp4","size_bytes":10}]',null) $q$);
select pg_temp.expect_fail('photo_9mb', $q$ select public.create_field_record_v1('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',null,'visit','{}',null,null,null,37.5,127,5,now(),null,'idem-key-0104','[{"kind":"photo","storage_path":"x","mime_type":"image/jpeg","size_bytes":8388609}]',null) $q$);
select pg_temp.expect_fail('placement_without_types', $q$ select public.create_field_record_v1('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',null,'placement','{}',null,null,null,37.5,127,5,now(),null,'idem-key-0105','[]',null) $q$);
select pg_temp.expect_fail('visit_with_types', $q$ select public.create_field_record_v1('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',null,'visit','{quote}',null,null,null,37.5,127,5,now(),null,'idem-key-0106','[]',null) $q$);
select pg_temp.expect_fail('bad_placement_type', $q$ select public.create_field_record_v1('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',null,'placement','{business_card}',null,null,null,37.5,127,5,now(),null,'idem-key-0107','[]',null) $q$);
select pg_temp.expect_fail('bad_kind_delivery', $q$ select public.create_field_record_v1('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',null,'delivery','{}',null,null,null,37.5,127,5,now(),null,'idem-key-0108','[]',null) $q$);
select pg_temp.expect_fail('latitude_out', $q$ select public.create_field_record_v1('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',null,'visit','{}',null,null,null,91,127,5,now(),null,'idem-key-0109','[]',null) $q$);
select pg_temp.expect_fail('accuracy_missing', $q$ select public.create_field_record_v1('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',null,'visit','{}',null,null,null,37.5,127,null,now(),null,'idem-key-0110','[]',null) $q$);
select pg_temp.expect_fail('captured_missing', $q$ select public.create_field_record_v1('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',null,'visit','{}',null,null,null,37.5,127,5,null,null,'idem-key-0111','[]',null) $q$);
select pg_temp.expect_fail('memo_501', format($q$ select public.create_field_record_v1('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',null,'visit','{}',null,null,null,37.5,127,5,now(),%L,'idem-key-0112','[]',null) $q$, repeat('가', 501)));
select pg_temp.expect_fail('cross_company_customer', $q$ select public.create_field_record_v1('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',null,'visit','{}','00000000-0000-0000-0000-0000000000b2',null,null,37.5,127,5,now(),null,'idem-key-0113','[]',null) $q$);
select pg_temp.expect_fail('cross_company_lead', $q$ select public.create_field_record_v1('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a1',null,'visit','{}',null,'00000000-0000-0000-0000-0000000000d1',null,37.5,127,5,now(),null,'idem-key-0114','[]',null) $q$);
select pg_temp.expect_fail('eleven_media', format($q$ select public.create_field_record_v1('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',null,'visit','{}',null,null,null,37.5,127,5,now(),null,'idem-key-0115',%L,null) $q$,
  (select jsonb_agg(jsonb_build_object('kind','photo','storage_path','p'||g,'mime_type','image/jpeg','size_bytes',1)) from generate_series(1, 11) g)));
select pg_temp.expect_fail('short_idempotency_key', $q$ select public.create_field_record_v1('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',null,'visit','{}',null,null,null,37.5,127,5,now(),null,'short','[]',null) $q$);
rollback;

-- 권한: anon/authenticated는 읽기·쓰기·함수 실행 모두 거부
begin;
set local role authenticated;
do $a$ begin begin perform 1 from public.field_records; raise exception 'should_have_failed: auth_select';
  exception when insufficient_privilege then null; end; end $a$;
do $a$ begin begin
  insert into public.field_records(company_id,kind,actor_user_id,latitude,longitude,accuracy_m,captured_at,idempotency_key)
  values ('00000000-0000-0000-0000-0000000000c1','visit','00000000-0000-0000-0000-0000000000a1',1,1,1,now(),'idem-key-0201');
  raise exception 'should_have_failed: auth_insert';
  exception when insufficient_privilege then null; end; end $a$;
do $a$ begin begin
  perform public.create_field_record_v1('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',null,'visit','{}',null,null,null,37.5,127,5,now(),null,'idem-key-0202','[]',null);
  raise exception 'should_have_failed: auth_rpc';
  exception when insufficient_privilege then null; end; end $a$;
reset role;
set local role anon;
do $a$ begin begin perform 1 from public.field_record_photos; raise exception 'should_have_failed: anon_select';
  exception when insufficient_privilege then null; end; end $a$;
reset role;
rollback;

-- down: 기록이 있으면 거절(표는 그대로), 비우면 표·함수가 사라진다
select public.create_field_record_v1('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1',null,'visit','{}',null,null,null,37.5,127,5,now(),null,'idem-key-0301','[]',null);
\set ON_ERROR_STOP off
\ir 2026-11-24-CX-135-field-records.down.sql
rollback;
\set ON_ERROR_STOP on
do $x$ begin
  if to_regclass('public.field_records') is null or (select count(*) from public.field_records) <> 1 then raise exception 'down_guard_did_not_protect'; end if;
end $x$;
delete from public.field_records;
\ir 2026-11-24-CX-135-field-records.down.sql
do $x$ begin
  if to_regclass('public.field_records') is not null or to_regclass('public.field_record_photos') is not null then raise exception 'down_tables_remain'; end if;
  if to_regprocedure('public.field_record_photo_count_sync_v1()') is not null then raise exception 'down_trigger_function_remains'; end if;
end $x$;

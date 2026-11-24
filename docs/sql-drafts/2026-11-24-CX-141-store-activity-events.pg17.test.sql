-- CX-141 C PG17
\set ON_ERROR_STOP on
begin;
create role service_role nologin; create role anon nologin; create role authenticated nologin;
create table public.companies(id uuid primary key);
create table public.store_accounts(id uuid primary key, company_id uuid not null references public.companies(id), unique(company_id, id));
insert into public.companies values ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000c2');
insert into public.store_accounts values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000c2');
commit;

\ir 2026-11-24-CX-141-store-activity-events.sql

do $t$
declare c1 uuid := '00000000-0000-0000-0000-0000000000c1'; c2 uuid := '00000000-0000-0000-0000-0000000000c2';
  a1 uuid := '00000000-0000-0000-0000-0000000000a1'; a2 uuid := '00000000-0000-0000-0000-0000000000a2';
  r1 uuid := '00000000-0000-0000-0000-0000000000f1'; r2 uuid := '00000000-0000-0000-0000-0000000000f2';
  ok boolean;
begin
  -- 저장하는 열은 종류·참조 id·시각뿐(검색어·가격·원가 열 없음)
  if (select array_agg(column_name::text order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'store_activity_events')
     <> array['company_id','id','kind','occurred_at','ref_id','store_account_id'] then raise exception 'unexpected_columns'; end if;
  if not public.record_store_activity_v1(c1, a1, 'home') then raise exception 'first_home_not_recorded'; end if;
  -- 5분 안의 같은 매장·종류·참조는 기록하지 않음
  if public.record_store_activity_v1(c1, a1, 'home') then raise exception 'home_dup_recorded'; end if;
  if not public.record_store_activity_v1(c1, a1, 'document', r1) then raise exception 'doc_r1'; end if;
  if public.record_store_activity_v1(c1, a1, 'document', r1) then raise exception 'doc_r1_dup'; end if;
  -- 다른 참조·다른 종류·다른 매장은 별개
  if not public.record_store_activity_v1(c1, a1, 'document', r2) then raise exception 'doc_r2'; end if;
  if not public.record_store_activity_v1(c1, a1, 'search') then raise exception 'search'; end if;
  if not public.record_store_activity_v1(c2, a2, 'home') then raise exception 'other_company_home'; end if;
  -- 5분이 지나면 다시 기록
  update public.store_activity_events set occurred_at = clock_timestamp() - interval '6 minutes' where company_id = c1 and store_account_id = a1 and kind = 'home';
  if not public.record_store_activity_v1(c1, a1, 'home') then raise exception 'home_after_5min'; end if;
  if (select count(*) from public.store_activity_events where company_id = c1 and store_account_id = a1 and kind = 'home') <> 2 then raise exception 'home_count'; end if;
  -- 잘못된 종류 거부
  ok := false;
  begin perform public.record_store_activity_v1(c1, a1, 'price_search_text'); exception when others then ok := sqlerrm = 'store_activity_invalid'; end;
  if not ok then raise exception 'invalid_kind_accepted'; end if;
  -- 다른 회사의 매장 계정으로는 기록할 수 없다(복합 외래키)
  ok := false;
  begin perform public.record_store_activity_v1(c1, a2, 'home'); exception when foreign_key_violation then ok := true; end;
  if not ok then raise exception 'cross_company_account'; end if;
  -- 권한: 익명·로그인 사용자는 읽기·쓰기·함수 실행 불가, service_role만
  if has_table_privilege('anon', 'public.store_activity_events', 'select') or has_table_privilege('authenticated', 'public.store_activity_events', 'insert')
    or has_function_privilege('anon', 'public.record_store_activity_v1(uuid,uuid,text,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.record_store_activity_v1(uuid,uuid,text,uuid)', 'execute')
    or not has_function_privilege('service_role', 'public.record_store_activity_v1(uuid,uuid,text,uuid)', 'execute')
    or not (select relrowsecurity from pg_class where oid = 'public.store_activity_events'::regclass)
    then raise exception 'privileges'; end if;
  -- 매장 계정을 지우면 활동 기록도 함께 사라진다
  delete from public.store_accounts where id = a2;
  if exists (select 1 from public.store_activity_events where store_account_id = a2) then raise exception 'cascade'; end if;
end $t$;

\ir 2026-11-24-CX-141-store-activity-events.down.sql
do $d$ begin
  if to_regclass('public.store_activity_events') is not null or to_regprocedure('public.record_store_activity_v1(uuid,uuid,text,uuid)') is not null then raise exception 'down_remains'; end if;
  if (select count(*) from public.store_accounts) <> 1 then raise exception 'down_touched_accounts'; end if;
end $d$;

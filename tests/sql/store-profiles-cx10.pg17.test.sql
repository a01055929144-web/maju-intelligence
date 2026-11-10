\set ON_ERROR_STOP on
-- CX-10 store profiles. Runs last in the disposable store_member_order_test chain (real store tables/RPCs).
do $$ begin
  if current_database() <> 'store_member_order_test' or current_setting('server_version_num')::int/10000 <> 17
    then raise exception 'disposable_store_profiles_pg17_required'; end if;
end $$;
\ir ../../docs/sql-drafts/20261111-CX-10-store-profiles.sql
insert into companies(id) values ('0b000000-0000-4000-8000-00000000000b') on conflict do nothing;
insert into app_users values ('f2100000-0000-4000-8000-000000000001','active'), ('f2100000-0000-4000-8000-000000000002','active')
  on conflict do nothing;

-- Direct API roles cannot touch the new tables or functions.
do $$ begin
  if has_table_privilege('anon','public.store_profiles','select') or has_table_privilege('authenticated','public.company_store_invite_codes','select')
    or has_function_privilege('anon','public.create_store_profile_v1(uuid,text,text,text,text,text,text)','execute')
    or has_function_privilege('authenticated','public.resolve_company_store_invite_code_v1(text)','execute')
    or not has_function_privilege('service_role','public.resolve_company_store_invite_code_v1(text)','execute')
    then raise exception 'cx10_privileges_wrong'; end if;
end $$;

set role service_role;
do $$
declare a uuid := '00000000-0000-4000-8000-000000000001'; b uuid := '0b000000-0000-4000-8000-00000000000b';
  created jsonb; pending jsonb; code_a uuid; code_b uuid; expired uuid; resolved jsonb;
begin
  -- 1) 직접 가입: 사업자번호 있음 → active, 없음(개업 예정) → registration_pending, 점주 1명.
  created := create_store_profile_v1('f2100000-0000-4000-8000-000000000001','합성 직접 가입 매장','1234567890','합성로 1','101호','v1');
  pending := create_store_profile_v1('f2100000-0000-4000-8000-000000000002','합성 개업 예정 매장','','합성로 2','','v1');
  if not exists(select 1 from store_profiles where id=(created->>'storeProfileId')::uuid and business_status='active' and origin='direct')
    or not exists(select 1 from store_profiles where id=(pending->>'storeProfileId')::uuid and business_status='registration_pending'
      and business_registration_number is null and address_detail is null)
    or (select count(*) from store_profile_members where store_profile_id=(created->>'storeProfileId')::uuid and role='owner' and status='active')<>1
    then raise exception 'cx10_direct_signup_wrong'; end if;
  begin
    perform create_store_profile_v1('f2100000-0000-4000-8000-0000000000ff','없는 사용자','','','','v1');
    raise exception 'cx10_missing_user_accepted';
  exception when raise_exception then if sqlerrm <> 'store_profile_user_missing' then raise; end if; end;
  begin
    insert into store_profile_members(store_profile_id, auth_user_id, role)
      values((created->>'storeProfileId')::uuid,'f2100000-0000-4000-8000-000000000002','owner');
    raise exception 'cx10_second_owner_accepted';
  exception when unique_violation then null; end;

  -- 2) 초대코드: 해시만 저장, 원문·짧은 값 거부, 만료·회수 코드는 확인되지 않음, 회수는 자기 회사만.
  code_a := issue_company_store_invite_code_v1(a, repeat('a',64), clock_timestamp() + interval '30 days', 'synthetic-owner-a');
  code_b := issue_company_store_invite_code_v1(b, repeat('b',64), clock_timestamp() + interval '30 days', 'synthetic-owner-b');
  begin
    perform issue_company_store_invite_code_v1(a, 'MAJU-1234', clock_timestamp() + interval '1 day', 'x');
    raise exception 'cx10_raw_code_accepted';
  exception when check_violation then null; end;
  begin
    perform issue_company_store_invite_code_v1(a, repeat('c',64), clock_timestamp() - interval '1 day', 'x');
    raise exception 'cx10_past_expiry_accepted';
  exception when raise_exception then if sqlerrm <> 'store_invite_code_expiry_invalid' then raise; end if; end;
  resolved := resolve_company_store_invite_code_v1(repeat('a',64));
  if resolved->>'companyId' <> a::text or resolved->>'inviteCodeId' <> code_a::text or resolved ? 'companyName'
    then raise exception 'cx10_resolve_wrong'; end if;
  begin
    perform revoke_company_store_invite_code_v1(b, code_a);
    raise exception 'cx10_cross_company_revoke_accepted';
  exception when raise_exception then if sqlerrm <> 'store_invite_code_not_found' then raise; end if; end;
  perform revoke_company_store_invite_code_v1(a, code_a);
  perform revoke_company_store_invite_code_v1(a, code_a); -- 멱등
  if resolve_company_store_invite_code_v1(repeat('a',64)) is not null then raise exception 'cx10_revoked_code_resolves'; end if;
  insert into company_store_invite_codes(company_id, code_hash, created_by_key, expires_at, created_at)
    values(a, repeat('d',64), 'x', clock_timestamp() - interval '1 minute', clock_timestamp() - interval '2 days') returning id into expired;
  if resolve_company_store_invite_code_v1(repeat('d',64)) is not null then raise exception 'cx10_expired_code_resolves'; end if;

  -- 3) 연결: 다른 회사 코드로 연결 기록 불가, 한 회사에 같은 매장 두 번 불가.
  begin
    update store_accounts set invite_code_id = code_b where company_id = a and id = (select id from store_accounts where company_id = a limit 1);
    raise exception 'cx10_cross_company_code_link_accepted';
  exception when foreign_key_violation then null; end;
end $$;
reset role;

-- 4) 기존 매장 1:1 백필 → 모든 매장 계정에 프로필, 구성원 복사, 같은 매장을 두 유통사가 각자 연결해도 서로의 행이 보이지 않는다.
\ir ../../docs/sql-drafts/20261111-CX-10-store-profiles-backfill.sql
set role service_role;
do $$
declare a uuid := '00000000-0000-4000-8000-000000000001'; b uuid := '0b000000-0000-4000-8000-00000000000b';
  shared uuid; account_a uuid;
begin
  if exists(select 1 from store_accounts where store_profile_id is null)
    or (select count(*) from store_profiles where origin='backfill') <> (select count(*) from store_accounts)
    or exists(select 1 from store_account_members m join store_accounts s on s.company_id=m.company_id and s.id=m.store_account_id
      where m.status='active' and m.auth_user_id is not null and not exists(select 1 from store_profile_members pm
        where pm.store_profile_id=s.store_profile_id and pm.auth_user_id=m.auth_user_id and pm.role=m.role and pm.status='active'))
    then raise exception 'cx10_backfill_wrong'; end if;
  select id, store_profile_id into account_a, shared from store_accounts where company_id = a limit 1;
  begin
    update store_accounts set store_profile_id = shared where company_id = a and id <> account_a and store_profile_id <> shared;
    if found then raise exception 'cx10_duplicate_company_profile_accepted'; end if;
  exception when unique_violation then null; end;
  -- 회사 B 범위 조회에는 회사 A의 연결이 나오지 않는다(서버는 항상 company_id로 거른다).
  if exists(select 1 from store_accounts where company_id = b and store_profile_id = shared)
    then raise exception 'cx10_cross_company_visible'; end if;
end $$;
reset role;

-- 5) down 거부(데이터 있음) → 백필 되돌리기 → 직접 가입 데이터 정리 → down 성공 → 다시 up 가능.
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/20261111-CX-10-store-profiles.down.sql
\set ON_ERROR_STOP on
do $$ begin if to_regclass('public.store_profiles') is null then raise exception 'cx10_down_dropped_existing_data'; end if; end $$;
\ir ../../docs/sql-drafts/20261111-CX-10-store-profiles-backfill.down.sql
do $$ begin
  if exists(select 1 from store_accounts where store_profile_id is not null) or exists(select 1 from store_profiles where origin='backfill')
    then raise exception 'cx10_backfill_down_incomplete'; end if;
end $$;
update store_accounts set invite_code_id = null;
delete from store_profile_members; delete from store_profiles; delete from company_store_invite_codes;
\ir ../../docs/sql-drafts/20261111-CX-10-store-profiles.down.sql
do $$ begin
  if to_regclass('public.store_profiles') is not null
    or exists(select 1 from information_schema.columns where table_name='store_accounts' and column_name in ('store_profile_id','invite_code_id'))
    then raise exception 'cx10_down_incomplete'; end if;
end $$;
\ir ../../docs/sql-drafts/20261111-CX-10-store-profiles.sql
\ir ../../docs/sql-drafts/20261111-CX-10-store-profiles.down.sql
select 'cx10 store profiles PG17 passed' result;

-- CX-144 U0 PG17: 11/07 활성화 초안 위에 U0 초안을 적용해 증명
\set ON_ERROR_STOP on
do $$ begin if current_setting('server_version_num')::int not between 170000 and 179999 then raise exception 'PostgreSQL 17 required'; end if; end $$;
create extension if not exists pgcrypto;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create table public.companies(id uuid primary key);
create table public.customer_imports(id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),source text,row_count int,status text,quality_score int,completed_at timestamptz);
create table public.normalized_customers(id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,
  import_id uuid,customer_name text,address text,phone text,business_registration_number text,representative_name text,normalized_key text,unique(company_id,id),unique(company_id,normalized_key));
create table public.pricing_documents(id uuid primary key,company_id uuid not null references public.companies(id),archived_at timestamptz,unique(company_id,id));
create table public.pricing_document_versions(id uuid primary key,company_id uuid not null,document_id uuid not null,content jsonb not null,
  unique(company_id,document_id,id),foreign key(company_id,document_id) references public.pricing_documents(company_id,id));
create table public.pricing_document_share_links(id uuid primary key,company_id uuid not null,document_id uuid not null,document_version_id uuid not null,
  expires_at timestamptz not null,revoked_at timestamptz,unique(company_id,id),foreign key(company_id,document_id,document_version_id)
  references public.pricing_document_versions(company_id,document_id,id));
create table public.app_users(id uuid primary key,status text not null);
create table public.company_members(id uuid primary key,company_id uuid not null references public.companies(id) on delete cascade,role text not null,permission_role text,status text not null,unique(company_id,id));
create table public.store_accounts(
  id uuid primary key,company_id uuid not null references public.companies(id),customer_id uuid not null,business_registration_number text not null,
  business_status text not null,business_status_verified_at timestamptz not null,verification_request_id text not null,
  terms_version text not null,terms_accepted_at timestamptz not null,terms_accepted_by_member_id uuid,status text not null,
  unique(company_id,id),unique(company_id,customer_id),foreign key(company_id,customer_id) references public.normalized_customers(company_id,id)
);
create table public.store_account_members(
  id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),store_account_id uuid not null,
  auth_user_id uuid,login_id_normalized text,role text not null check(role in ('owner','manager','staff')),status text not null,
  invited_by_member_id uuid,invite_token_hash text,invited_at timestamptz,joined_at timestamptz,removed_by_member_id uuid,removed_at timestamptz,last_ordered_at timestamptz,
  unique(company_id,id),unique(company_id,store_account_id,id),unique(login_id_normalized),foreign key(company_id,store_account_id) references public.store_accounts(company_id,id),
  foreign key(company_id,store_account_id,invited_by_member_id) references public.store_account_members(company_id,store_account_id,id) deferrable initially deferred,
  foreign key(company_id,store_account_id,removed_by_member_id) references public.store_account_members(company_id,store_account_id,id) deferrable initially deferred,
  check((status='removed')=(removed_at is not null))
);
create unique index store_account_one_active_owner on public.store_account_members(company_id,store_account_id) where role='owner' and status='active';
create table public.store_account_member_events(
  id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),store_account_id uuid not null,member_id uuid not null,
  event_type text not null,actor_member_id uuid,actor_user_key text,reason text,occurred_at timestamptz not null default clock_timestamp(),
  check(num_nonnulls(actor_member_id,actor_user_key)=1),foreign key(company_id,store_account_id,member_id) references public.store_account_members(company_id,store_account_id,id),
  foreign key(company_id,store_account_id,actor_member_id) references public.store_account_members(company_id,store_account_id,id)
);
alter table public.store_accounts add constraint store_accounts_terms_member_fk foreign key(company_id,id,terms_accepted_by_member_id)
  references public.store_account_members(company_id,store_account_id,id) deferrable initially deferred;
grant all on public.store_accounts,public.store_account_members,public.store_account_member_events,public.app_users to service_role;
grant all on public.company_members,public.normalized_customers,public.customer_imports,public.pricing_documents,public.pricing_document_versions,public.pricing_document_share_links to service_role;

insert into public.companies values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000003');
insert into public.pricing_documents values('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',null);
insert into public.pricing_document_versions values('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001','{"validUntil":"2099-12-31"}');
insert into public.pricing_document_share_links values('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',clock_timestamp()+interval '1 day',null);
insert into public.normalized_customers(id,company_id,business_registration_number) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','1234567890'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','2234567890'),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','3234567890'),
 ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000003','4234567890'),
 ('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','5234567890');
insert into public.app_users values('30000000-0000-4000-8000-000000000001','active'),
 ('30000000-0000-4000-8000-000000000002','active'),('30000000-0000-4000-8000-000000000003','active');
insert into public.company_members values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner','owner','active'),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','member','staff','active'),
 ('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','owner','owner','active'),
 ('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000003','owner','owner','active'),
 ('40000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','member','manager','active');

create table public.storefront_links(id uuid primary key default gen_random_uuid(),company_id uuid not null,customer_id uuid not null,revoked_at timestamptz,can_order boolean not null default true);
create table public.store_orders(id uuid primary key default gen_random_uuid(),company_id uuid not null,customer_id uuid not null,store_account_id uuid);
grant all on public.storefront_links,public.store_orders to service_role;
-- 운영 store_accounts에는 updated_at이 있다(11/07 합성 표에는 없어서 추가)
alter table public.store_accounts add column updated_at timestamptz not null default clock_timestamp();

\ir 20261105-store-kakao-membership.sql
\ir 20261107-store-owner-activation.sql
-- 운영 check2(11/10 개업 준비 반영본)와 똑같은 정의로 시험 준비: 번호 없는 개업 준비 공개 요청(4개 있고 사업자번호 null) 분기가 있다
alter table public.store_owner_activation_requests drop constraint store_owner_activation_requests_check2;
alter table public.store_owner_activation_requests add constraint store_owner_activation_requests_check2
  check ((customer_id is not null and prepared_by_company_member_id is not null and public_idempotency_key is null)
    or (prepared_by_company_member_id is null and public_idempotency_key is not null
      and num_nonnulls(document_id,document_version_id,share_link_id)=3
      and (num_nonnulls(store_name,representative_name,address,phone,business_registration_number)=0
        or (num_nonnulls(store_name,representative_name,address,phone)=4
          and business_registration_number is null)
        or num_nonnulls(store_name,representative_name,address,phone,business_registration_number)=5)));
select pg_get_constraintdef(oid) as prod_check2 from pg_constraint
  where conrelid='public.store_owner_activation_requests'::regclass and conname='store_owner_activation_requests_check2' \gset

\ir 2026-11-25-CX-144-u0-admin-store-connection.sql
-- 운영 후속(11/25 적용): 래퍼가 부르는 core 함수의 service_role 실행 권한
\ir 2026-11-25-CX-144-u0-grant-fix.sql

-- U0 이후에도 공개 링크 요청 분기가 운영과 같게 통과/거절된다(번호 없는 개업 준비 포함)
do $p$ declare ok boolean; d uuid := '50000000-0000-4000-8000-000000000001'; v uuid := '60000000-0000-4000-8000-000000000001'; l uuid := '70000000-0000-4000-8000-000000000001';
  c uuid := '10000000-0000-4000-8000-000000000001';
begin
  insert into public.store_owner_activation_requests(company_id,invite_token_hash,public_idempotency_key,document_id,document_version_id,share_link_id,store_name,representative_name,address,phone)
    values (c, repeat('1', 64), gen_random_uuid(), d, v, l, '번호 없는 매장', '대표', '서울', '01000000000');
  insert into public.store_owner_activation_requests(company_id,invite_token_hash,public_idempotency_key,document_id,document_version_id,share_link_id,store_name,representative_name,address,phone,business_registration_number)
    values (c, repeat('2', 64), gen_random_uuid(), d, v, l, '번호 있는 매장', '대표', '서울', '01000000000', '1234567890');
  insert into public.store_owner_activation_requests(company_id,invite_token_hash,public_idempotency_key,document_id,document_version_id,share_link_id)
    values (c, repeat('3', 64), gen_random_uuid(), d, v, l);
  ok := false;
  begin insert into public.store_owner_activation_requests(company_id,invite_token_hash,public_idempotency_key,document_id,document_version_id,share_link_id,store_name,representative_name,address)
    values (c, repeat('4', 64), gen_random_uuid(), d, v, l, '일부만', '대표', '서울'); exception when check_violation then ok := true; end;
  if not ok then raise exception 'partial_public_profile_accepted'; end if;
  ok := false;
  begin insert into public.store_owner_activation_requests(company_id,customer_id,invite_token_hash) values (c, '20000000-0000-4000-8000-000000000001', repeat('5', 64)); exception when check_violation then ok := true; end;
  if not ok then raise exception 'customer_request_without_preparer_accepted'; end if;
  delete from public.store_owner_activation_requests where invite_token_hash in (repeat('1', 64), repeat('2', 64), repeat('3', 64));
end $p$;

do $t$
declare c1 uuid := '10000000-0000-4000-8000-000000000001'; c2 uuid := '10000000-0000-4000-8000-000000000002';
  k1 uuid := '20000000-0000-4000-8000-000000000001'; k3 uuid := '20000000-0000-4000-8000-000000000003';
  u1 uuid := '30000000-0000-4000-8000-000000000001'; u2 uuid := '30000000-0000-4000-8000-000000000002';
  owner_member uuid := '40000000-0000-4000-8000-000000000001'; staff_member uuid := '40000000-0000-4000-8000-000000000002';
  admin_key text := repeat('d', 64);
  r jsonb; s1 uuid; m1 uuid; ok boolean; n integer;
begin
  -- 1. 기존 흐름(회사 구성원 초대 → 활성화)은 그대로 동작
  r := public.prepare_store_owner_activation_v1(c1, k1, owner_member, repeat('a', 64));
  s1 := (r->>'storeAccountId')::uuid;
  r := public.activate_store_owner_v1(repeat('a', 64), u1, '2026-11', clock_timestamp(), '1234567890', 'active', clock_timestamp(), 'verification-request-0001');
  if (r->>'storeAccountId')::uuid <> s1 then raise exception 'baseline_activation_changed'; end if;
  m1 := (r->>'ownerMemberId')::uuid;
  if (select count(*) from public.store_accounts where customer_id = k1) <> 1 then raise exception 'baseline_account_count'; end if;
  -- 활성 점주가 있으면 재초대 불가(기존 규칙 유지), 권한·번호 규칙도 그대로
  ok := false; begin perform public.prepare_store_owner_activation_v1(c1, k1, owner_member, repeat('b', 64)); exception when others then ok := sqlerrm = 'store_account_exists'; end;
  if not ok then raise exception 'active_owner_reinvited'; end if;
  ok := false; begin perform public.prepare_store_owner_activation_v1(c1, k1, staff_member, repeat('b', 64)); exception when others then ok := sqlerrm = 'store_owner_approval_forbidden'; end;
  if not ok then raise exception 'staff_prepared'; end if;
  ok := false; begin perform public.admin_prepare_store_owner_activation_v1(c1, k1, admin_key, repeat('b', 64)); exception when others then ok := sqlerrm = 'store_account_exists'; end;
  if not ok then raise exception 'admin_prepared_over_active_owner'; end if;
  ok := false; begin perform public.admin_prepare_store_owner_activation_v1(c1, k1, 'bad', repeat('b', 64)); exception when others then ok := sqlerrm = 'admin_key_invalid'; end;
  if not ok then raise exception 'bad_admin_key_prepare'; end if;

  -- 2. 관리자: 점주 연결 해제 → 매장은 활성 유지, 점주 없음, 이벤트는 관리자 키로 기록
  insert into public.store_orders(company_id, customer_id, store_account_id) values (c1, k1, s1);
  r := public.admin_change_store_connection_v1(c1, s1, admin_key, 'remove_member', m1);
  if r->>'removedMembers' <> '1' or (select status from public.store_accounts where id = s1) <> 'active'
    or (select status from public.store_account_members where id = m1) <> 'removed' then raise exception 'remove_member_failed'; end if;
  if (select array[actor_user_key, reason] from public.store_account_member_events where member_id = m1 and event_type = 'remove') <> array['maju-admin:' || admin_key, 'admin_member_removed'] then raise exception 'remove_event'; end if;
  ok := false; begin perform public.admin_change_store_connection_v1(c1, s1, admin_key, 'remove_member', m1); exception when others then ok := sqlerrm = 'store_connection_member_unavailable'; end;
  if not ok then raise exception 'second_remove_allowed'; end if;

  -- 3. 점주 추가(관리자 초대): 같은 매장 행에 새 점주가 붙고 거래처당 매장은 1개
  r := public.admin_prepare_store_owner_activation_v1(c1, k1, admin_key, repeat('b', 64));
  if (r->>'storeAccountId')::uuid <> s1 then raise exception 'admin_invite_new_row'; end if;
  r := public.activate_store_owner_v1(repeat('b', 64), u2, '2026-11', clock_timestamp(), '1234567890', 'active', clock_timestamp(), 'verification-request-0002');
  if (r->>'storeAccountId')::uuid <> s1 or (select count(*) from public.store_accounts where customer_id = k1) <> 1 then raise exception 'add_owner_new_account'; end if;
  if (select count(*) from public.store_account_members where store_account_id = s1 and role = 'owner' and status = 'active') <> 1 then raise exception 'owner_count'; end if;
  if not exists (select 1 from public.store_account_member_events where member_id = (r->>'ownerMemberId')::uuid and actor_user_key = 'maju-admin-invite:' || admin_key) then raise exception 'admin_invite_event'; end if;

  -- 4. 관리자: 매장 탈퇴 처리 = 상태 closed, 구성원 전원 제거, 매장 링크 회수, 주문 기록 유지
  insert into public.storefront_links(company_id, customer_id) values (c1, k1);
  r := public.admin_change_store_connection_v1(c1, s1, admin_key, 'close');
  if (select status from public.store_accounts where id = s1) <> 'closed'
    or exists (select 1 from public.store_account_members where store_account_id = s1 and status in ('active', 'invited'))
    or exists (select 1 from public.storefront_links where customer_id = k1 and (revoked_at is null or can_order))
    or (select count(*) from public.store_orders where store_account_id = s1) <> 1 then raise exception 'close_failed'; end if;
  ok := false; begin perform public.admin_change_store_connection_v1(c1, s1, admin_key, 'close'); exception when others then ok := sqlerrm = 'store_connection_unavailable'; end;
  if not ok then raise exception 'second_close_allowed'; end if;
  -- 다른 회사 id로는 접근 불가, 잘못된 동작 거부
  ok := false; begin perform public.admin_change_store_connection_v1(c2, s1, admin_key, 'close'); exception when others then ok := sqlerrm = 'store_connection_unavailable'; end;
  if not ok then raise exception 'cross_company_close'; end if;
  ok := false; begin perform public.admin_change_store_connection_v1(c1, s1, admin_key, 'delete'); exception when others then ok := sqlerrm = 'store_connection_invalid'; end;
  if not ok then raise exception 'invalid_action'; end if;

  -- 5. 탈퇴한 거래처는 다시 초대되고, 같은 카카오로 같은 매장 행에 재가입, 주문 기록은 같은 행에 그대로
  r := public.prepare_store_owner_activation_v1(c1, k1, owner_member, repeat('c', 64));
  if (r->>'storeAccountId')::uuid <> s1 then raise exception 'reinvite_new_row'; end if;
  r := public.activate_store_owner_v1(repeat('c', 64), u1, '2026-11', clock_timestamp(), '1234567890', 'active', clock_timestamp(), 'verification-request-0003');
  if (r->>'storeAccountId')::uuid <> s1 or (select status from public.store_accounts where id = s1) <> 'active'
    or (select count(*) from public.store_accounts where customer_id = k1) <> 1
    or (select terms_accepted_by_member_id from public.store_accounts where id = s1) is distinct from (r->>'ownerMemberId')::uuid
    or (select count(*) from public.store_orders where store_account_id = s1) <> 1
    or (select count(*) from public.store_account_members where store_account_id = s1 and status = 'active' and role = 'owner' and auth_user_id = u1) <> 1 then raise exception 'rejoin_failed'; end if;
  -- 이전 구성원 행은 removed로 그대로 남는다
  if (select count(*) from public.store_account_members where store_account_id = s1 and status = 'removed') < 2 then raise exception 'history_lost'; end if;

  -- 6. 다른 거래처·번호 없는 거래처 규칙은 그대로
  ok := false; begin perform public.admin_prepare_store_owner_activation_v1(c1, '20000000-0000-4000-8000-0000000000ff', admin_key, repeat('e', 64)); exception when others then ok := sqlerrm = 'store_customer_business_number_required'; end;
  if not ok then raise exception 'number_rule_changed'; end if;

  -- 7. 권한: service_role만
  if has_function_privilege('anon', 'public.admin_change_store_connection_v1(uuid,uuid,text,text,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.admin_prepare_store_owner_activation_v1(uuid,uuid,text,text)', 'execute')
    or has_function_privilege('anon', 'public.prepare_store_owner_activation_core_v1(uuid,uuid,uuid,text,text)', 'execute')
    or not has_function_privilege('service_role', 'public.admin_change_store_connection_v1(uuid,uuid,text,text,uuid)', 'execute')
    or not has_function_privilege('service_role', 'public.activate_store_owner_v1(text,uuid,text,timestamptz,text,text,timestamptz,text)', 'execute')
    then raise exception 'privileges'; end if;
end $t$;

-- 7b. service_role로 래퍼 함수 호출(운영 서버와 같은 권한). 함수 소유자(superuser)로만 시험하면 11/25 "permission denied for core" 같은 누락을 못 잡는다.
begin;
insert into public.normalized_customers(id, company_id, customer_name, business_registration_number)
  values ('20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001', 'service_role 시험 거래처', '9234567890'),
         ('20000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-000000000001', 'service_role 시험 거래처2', '9334567890');
set local role service_role;
do $r$
declare c1 uuid := '10000000-0000-4000-8000-000000000001'; owner_member uuid := '40000000-0000-4000-8000-000000000001';
  u1 uuid := '30000000-0000-4000-8000-000000000001'; admin_key text := repeat('d', 64); r jsonb; s uuid;
begin
  -- 점주(회사 구성원) 경로 래퍼 → core
  r := public.prepare_store_owner_activation_v1(c1, '20000000-0000-4000-8000-0000000000a1', owner_member, repeat('8', 64));
  if r->>'storeAccountId' is null then raise exception 'sr_prepare_failed'; end if;
  -- 관리자 경로 래퍼 → core
  r := public.admin_prepare_store_owner_activation_v1(c1, '20000000-0000-4000-8000-0000000000a2', admin_key, repeat('9', 64));
  s := (r->>'storeAccountId')::uuid;
  if s is null then raise exception 'sr_admin_prepare_failed'; end if;
  -- 활성화 → 연결 해제(탈퇴) 처리
  perform public.activate_store_owner_v1(repeat('9', 64), u1, '2026-11', clock_timestamp(), '9334567890', 'active', clock_timestamp(), 'verification-request-sr01');
  r := public.admin_change_store_connection_v1(c1, s, admin_key, 'close');
  if r is null then raise exception 'sr_change_failed'; end if;
end $r$;
rollback;
-- anon·authenticated는 래퍼를 호출할 수 없다(실제 role로 확인)
begin;
set local role authenticated;
do $r$ declare ok boolean := false; begin
  begin perform public.admin_prepare_store_owner_activation_v1('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', repeat('d', 64), repeat('7', 64));
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'authenticated_can_call_wrapper'; end if;
end $r$;
rollback;

-- 8. down: 관리자 초대 기록이 남아 있으면 중단, 정리 후에는 원래 함수로 복귀(탈퇴한 거래처 재초대는 다시 거절)
select public.admin_change_store_connection_v1('10000000-0000-4000-8000-000000000001', (select id from public.store_accounts where customer_id = '20000000-0000-4000-8000-000000000001'), repeat('d', 64), 'close');
select public.admin_prepare_store_owner_activation_v1('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', repeat('d', 64), repeat('f', 64));
-- 같은 매장에 사용 전 요청은 하나만(부분 고유 인덱스): 열린 요청이 있을 때 직접 하나 더 넣으면 거절
do $u$ declare ok boolean := false; begin
  begin insert into public.store_owner_activation_requests(company_id,customer_id,invite_token_hash,prepared_by_admin_key,store_account_id)
    select company_id, customer_id, repeat('7', 64), repeat('d', 64), store_account_id from public.store_owner_activation_requests where invite_token_hash = repeat('f', 64);
  exception when unique_violation then ok := true; end;
  if not ok then raise exception 'second_open_request_allowed'; end if;
  -- 재초대로 한 매장에 요청 행이 여러 개(사용 완료 포함) 남아 있다
  if (select count(*) from public.store_owner_activation_requests where customer_id = '20000000-0000-4000-8000-000000000001') < 4 then raise exception 'request_history_missing'; end if;
end $u$;
\set ON_ERROR_STOP off
\ir 2026-11-25-CX-144-u0-admin-store-connection.down.sql
rollback;
\set ON_ERROR_STOP on
do $b$ begin
  if to_regprocedure('public.admin_change_store_connection_v1(uuid,uuid,text,text,uuid)') is null then raise exception 'down_ran_with_admin_invite_rows'; end if;
end $b$;
delete from public.store_owner_activation_requests where prepared_by_admin_key is not null;
-- 같은 매장의 사용 완료 요청이 여러 행이면 되돌릴 수 없다 → 정리 전에는 중단, 가장 최근 1행만 남기면 통과
\set ON_ERROR_STOP off
\ir 2026-11-25-CX-144-u0-admin-store-connection.down.sql
rollback;
\set ON_ERROR_STOP on
do $b2$ begin
  if to_regprocedure('public.admin_change_store_connection_v1(uuid,uuid,text,text,uuid)') is null then raise exception 'down_ran_with_reopened_request_rows'; end if;
end $b2$;
delete from public.store_owner_activation_requests where id in (select id from (select id, row_number() over (partition by company_id, store_account_id order by prepared_at desc, id) as rn from public.store_owner_activation_requests) x where rn > 1);
\ir 2026-11-25-CX-144-u0-admin-store-connection.down.sql
do $d$ declare ok boolean := false; begin
  if to_regprocedure('public.admin_change_store_connection_v1(uuid,uuid,text,text,uuid)') is not null
    or to_regprocedure('public.admin_prepare_store_owner_activation_v1(uuid,uuid,text,text)') is not null
    or to_regprocedure('public.prepare_store_owner_activation_core_v1(uuid,uuid,uuid,text,text)') is not null then raise exception 'down_remains'; end if;
  begin perform public.prepare_store_owner_activation_v1('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', repeat('9', 64));
  exception when others then ok := sqlerrm = 'store_account_exists'; end;
  if not ok then raise exception 'down_did_not_restore_original_prepare'; end if;
  if (select count(*) from public.store_accounts where customer_id = '20000000-0000-4000-8000-000000000001') <> 1 then raise exception 'down_touched_accounts'; end if;
  if not exists (select 1 from pg_constraint where conname = 'store_owner_activation_requests_company_id_store_account_id_key') or exists (select 1 from pg_indexes where indexname = 'store_owner_activation_one_open_per_account') then raise exception 'down_did_not_restore_unique_rule'; end if;
end $d$;
select (select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.store_owner_activation_requests'::regclass and conname='store_owner_activation_requests_check2') = :'prod_check2' as ok \gset
\if :ok
\else
  do $x$ begin raise exception 'down_check2_differs_from_prod'; end $x$;
\endif

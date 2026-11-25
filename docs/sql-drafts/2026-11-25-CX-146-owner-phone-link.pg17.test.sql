-- CX-146 PG17: 운영과 같은 열·제약을 가진 합성 표 위에서 CX-122 → CX-142 → CX-146 초안 순서로 적용하고, service_role로 함수를 호출해 증명
\set ON_ERROR_STOP on
do $$ begin if current_setting('server_version_num')::int not between 170000 and 179999 then raise exception 'PostgreSQL 17 required'; end if; end $$;
create role service_role nologin; create role anon nologin; create role authenticated nologin;
create table public.companies(id uuid primary key);
create table public.company_members(id uuid primary key, company_id uuid not null references public.companies(id), status text not null default 'active',
  role text not null default 'owner', permission_role text, unique(company_id, id));
create table public.normalized_customers(id uuid primary key, company_id uuid not null references public.companies(id), customer_name text, address text,
  business_registration_number text, unique(company_id, id));
create table public.app_users(id uuid primary key, status text not null, kakao_user_id text);
create table public.store_accounts(id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), customer_id uuid not null,
  business_registration_number text check (business_registration_number is null or business_registration_number ~ '^\d{10}$'),
  business_status text not null check (business_status in ('active','closed','suspended','registration_pending')),
  business_status_verified_at timestamptz, verification_request_id text, terms_version text not null, terms_accepted_at timestamptz not null,
  terms_accepted_by_member_id uuid, status text not null default 'pending' check (status in ('pending','active','suspended','closed')),
  customer_review_status text not null default 'confirmed' check (customer_review_status in ('needs_review', 'confirmed')),
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  unique(company_id, id), unique(company_id, customer_id), foreign key(company_id, customer_id) references public.normalized_customers(company_id, id),
  constraint store_accounts_registration_pending_check check ((business_status <> 'registration_pending' or
    (business_registration_number is null and business_status_verified_at is null and verification_request_id is null))
    and (business_status <> 'active' or (business_registration_number is not null and business_status_verified_at is not null and verification_request_id is not null))));
create table public.store_account_members(id uuid primary key default gen_random_uuid(), company_id uuid not null, store_account_id uuid not null,
  auth_user_id uuid, role text not null check (role in ('owner','manager','staff')), status text not null check (status in ('invited','active','removed')),
  joined_at timestamptz, removed_at timestamptz, unique(company_id, id), unique(company_id, store_account_id, id),
  foreign key(company_id, store_account_id) references public.store_accounts(company_id, id));
create unique index store_account_one_active_owner on public.store_account_members(company_id, store_account_id) where role = 'owner' and status = 'active';
create table public.store_account_member_events(id uuid primary key default gen_random_uuid(), company_id uuid not null, store_account_id uuid not null,
  member_id uuid not null, event_type text not null, actor_member_id uuid, actor_user_key text, reason text, occurred_at timestamptz not null default clock_timestamp(),
  check (num_nonnulls(actor_member_id, actor_user_key) = 1), foreign key(company_id, store_account_id, member_id) references public.store_account_members(company_id, store_account_id, id));
create table public.store_owner_activation_requests(id uuid primary key default gen_random_uuid(), company_id uuid not null, invite_token_hash text not null unique,
  consumed_at timestamptz, cancelled_at timestamptz, expires_at timestamptz not null default now() + interval '7 days');
create table public.business_permit_leads(id uuid primary key, company_id uuid not null, merged_into_lead_id uuid, matched_customer_id uuid,
  matched_customer_at timestamptz, matched_customer_method text, matched_customer_confidence integer, updated_at timestamptz default now(),
  constraint business_permit_leads_match_method_check check (matched_customer_method is null or matched_customer_method in ('business_number', 'name_address', 'manual', 'conversion')),
  unique(company_id, id));
create table public.lead_actions(id uuid primary key default gen_random_uuid(), company_id uuid not null, lead_id uuid not null, action_type text not null,
  result text, memo text, actor_name text, created_at timestamptz not null default clock_timestamp());
grant all on public.companies, public.company_members, public.normalized_customers, public.app_users, public.store_accounts, public.store_account_members, public.store_account_member_events to service_role;

\ir 2026-11-18-CX-122-store-price-visibility.sql
\ir 2026-11-24-CX-142-store-signup.sql
\ir 2026-11-25-CX-146-owner-phone-link.sql

insert into public.companies values ('10000000-0000-4000-8000-000000000001'), ('10000000-0000-4000-8000-000000000002'), ('10000000-0000-4000-8000-000000000003');
insert into public.company_members(id, company_id) values ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');
insert into public.app_users values ('30000000-0000-4000-8000-000000000001', 'active', 'kakao-1'), ('30000000-0000-4000-8000-000000000002', 'active', 'kakao-2'),
  ('30000000-0000-4000-8000-000000000003', 'active', null), ('30000000-0000-4000-8000-000000000004', 'suspended', 'kakao-4'), ('30000000-0000-4000-8000-000000000005', 'active', 'kakao-5');
-- 같은 번호를 둔 거래처: k1·k2(회사1) k3(회사2) k4(회사1, 이미 다른 점주) k6(회사3, 허용 목록 밖) k7(회사1, 회사가 취소한 매장) k8(회사1, 사전 개통 매장). k5는 다른 번호.
insert into public.normalized_customers(id, company_id, customer_name, address, business_registration_number, owner_mobile) values
 ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '홍곱창 신촌점', '서울 서대문구 신촌로 1길 2', '1234567890', '01011112222'),
 ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '홍곱창 강남점', '서울 강남구', null, '01011112222'),
 ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '홍곱창 의정부점', '경기 의정부시', null, '01011112222'),
 ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '이미 점주 있는 매장', null, null, '01011112222'),
 ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '다른 번호 매장', null, null, '01099998888'),
 ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000003', '허용 밖 회사 매장', null, null, '01011112222'),
 ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', '취소된 매장', null, null, '01011112222'),
 ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000001', '사전 개통 매장', null, null, '01011112222');
insert into public.store_accounts(id, company_id, customer_id, business_registration_number, business_status, business_status_verified_at, verification_request_id, terms_version, terms_accepted_at, status) values
 ('50000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004', '4234567890', 'active', now(), 'req-4', '2026-11', now(), 'active'),
 ('50000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000007', '7234567890', 'active', now(), 'req-7', '2026-11', now(), 'active'),
 ('50000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000008', null, 'registration_pending', null, null, '2026-11', now(), 'active');
insert into public.store_account_members(id, company_id, store_account_id, auth_user_id, role, status, joined_at) values
 ('60000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000005', 'owner', 'active', now());
-- 회사가 확인했다가 취소한 매장(k7): 다시 켜지면 안 된다.
select public.set_store_price_visibility_v1('10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000001', 'confirm', '직접') \gset
select public.set_store_price_visibility_v1('10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000001', 'cancel', '취소') \gset

-- 제약: 고객사 보증(owner_vouched) 없이 사업자번호·확인 없는 active는 거부
do $t$ declare ok boolean := false; begin
  begin insert into public.store_accounts(company_id, customer_id, business_status, terms_version, terms_accepted_at, status)
    values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000005', 'active', 'x', now(), 'active');
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'unvouched_active_without_brn_accepted'; end if;
end $t$;

-- 이하 service_role로 호출(운영 서버와 같은 권한). 오늘 CX-144 권한 누락 재발 방지.
set role service_role;
do $t$
declare c1 uuid := '10000000-0000-4000-8000-000000000001'; c2 uuid := '10000000-0000-4000-8000-000000000002';
  u1 uuid := '30000000-0000-4000-8000-000000000001'; u2 uuid := '30000000-0000-4000-8000-000000000002'; u3 uuid := '30000000-0000-4000-8000-000000000003';
  u4 uuid := '30000000-0000-4000-8000-000000000004';
  k1 uuid := '20000000-0000-4000-8000-000000000001'; k2 uuid := '20000000-0000-4000-8000-000000000002'; k3 uuid := '20000000-0000-4000-8000-000000000003';
  k4 uuid := '20000000-0000-4000-8000-000000000004'; k7 uuid := '20000000-0000-4000-8000-000000000007'; k8 uuid := '20000000-0000-4000-8000-000000000008';
  ph text := '01011112222'; r jsonb; n integer; a1 uuid; a3 uuid; a7 uuid;
begin
  -- 후보: 같은 번호 · 허용 회사(1·2)만. k5(다른 번호)·k6(회사3)는 없다.
  select count(*) into n from public.phone_link_candidates_v1(u1, ph, array[c1, c2]);
  if n <> 6 then raise exception 'candidates_count_%', n; end if;
  if (select state from public.phone_link_candidates_v1(u1, ph, array[c1, c2]) where customer_id = k4) <> 'owner_conflict' then raise exception 'k4_state'; end if;
  if (select state from public.phone_link_candidates_v1(u1, ph, array[c1, c2]) where customer_id = k8) <> 'unavailable' then raise exception 'k8_state'; end if;
  if (select state from public.phone_link_candidates_v1(u1, ph, array[c1, c2]) where customer_id = k1) <> 'linkable' then raise exception 'k1_state'; end if;
  if (select address_hint from public.phone_link_candidates_v1(u1, ph, array[c1, c2]) where customer_id = k1) <> left('서울 서대문구 신촌로 1길 2', 10) then raise exception 'address_hint'; end if;
  if (select count(*) from public.phone_link_candidates_v1(u1, '01099990000', array[c1, c2])) <> 0 then raise exception 'other_phone_matched'; end if;
  if (select count(*) from public.phone_link_candidates_v1(u1, '0212345678', array[c1, c2])) <> 0 then raise exception 'invalid_phone_matched'; end if;
  if (select count(*) from public.phone_link_candidates_v1(u4, ph, array[c1, c2])) <> 0 then raise exception 'suspended_user_matched'; end if;
  if (select count(*) from public.phone_link_candidates_v1(u1, ph, null)) <> 0 then raise exception 'null_allowlist_matched'; end if;

  -- 카카오 로그인 이력이 없는 사용자·잘못된 번호는 연결 불가
  begin perform public.confirm_phone_link_v1(u3, ph, array[k1], array[c1]); raise exception 'no_kakao_linked';
  exception when others then if sqlerrm <> 'phone_link_user_unavailable' then raise; end if; end;
  begin perform public.confirm_phone_link_v1(u1, '010', array[k1], array[c1]); raise exception 'bad_phone_linked';
  exception when others then if sqlerrm <> 'phone_link_phone_invalid' then raise; end if; end;

  -- 확인: k1·k3·k7·k8 선택(k2는 선택 안 함). k4는 점주가 있어 고객사 알림, k8은 건너뜀.
  r := public.confirm_phone_link_v1(u1, ph, array[k1, k3, k7, k8], array[c1, c2]);
  if jsonb_array_length(r->'linked') <> 3 or (r->>'conflicts')::int <> 1 or (r->>'skipped')::int <> 1 then raise exception 'confirm_result_%', r; end if;
  a1 := (select id from public.store_accounts where customer_id = k1); a3 := (select id from public.store_accounts where customer_id = k3);
  a7 := (select id from public.store_accounts where customer_id = k7);
  if (select count(*) from public.store_accounts where customer_id = k2) <> 0 then raise exception 'unselected_store_created'; end if;
  if (select array[business_status, owner_vouched::text, business_registration_number, price_visibility_status, price_visibility_confirmed_source]
      from public.store_accounts where id = a1) is distinct from array['active', 'true', null, 'confirmed', 'phone_match'] then raise exception 'k1_account_shape'; end if;
  if (select price_visibility_confirmed_by_member_id from public.store_accounts where id = a1) is not null then raise exception 'k1_confirmed_by_member'; end if;
  if not public.store_price_visible_v1(c1, a1) or not public.store_price_visible_v1(c2, a3) then raise exception 'price_not_visible'; end if;
  if (select count(*) from public.store_account_members where store_account_id = a1 and auth_user_id = u1 and role = 'owner' and status = 'active') <> 1 then raise exception 'k1_owner_missing'; end if;
  if (select count(*) from public.store_account_member_events where store_account_id = a1 and event_type = 'join' and actor_user_key = 'phone-match:' || k1::text and reason = 'phone_match:2222') <> 1 then raise exception 'join_event'; end if;
  if (select count(*) from public.store_price_visibility_events where store_account_id = a1 and actor_role = 'system') <> 1 then raise exception 'system_price_event'; end if;
  -- 회사가 취소했던 매장: 점주는 연결되지만 가격은 다시 켜지지 않는다.
  if (select count(*) from public.store_account_members where store_account_id = a7 and auth_user_id = u1 and role = 'owner') <> 1 then raise exception 'k7_owner_missing'; end if;
  if public.store_price_visible_v1(c1, a7) or (select price_visibility_status from public.store_accounts where id = a7) <> 'pending' then raise exception 'cancelled_store_reconfirmed'; end if;
  -- 이미 다른 활성 점주가 있는 매장(k4): 연결하지 않고 알림만, 기존 점주 그대로.
  if exists (select 1 from public.store_account_members where store_account_id = '50000000-0000-4000-8000-000000000004' and auth_user_id = u1) then raise exception 'k4_owner_overwritten'; end if;
  if (select count(*) from public.store_phone_link_notices where customer_id = k4 and kind = 'owner_conflict' and phone_last4 = '2222' and resolved_at is null) <> 1 then raise exception 'k4_notice'; end if;
  -- 번호 원문은 어디에도 남지 않는다(뒤 4자리만).
  if exists (select 1 from public.store_account_member_events where reason like '%' || ph || '%' or actor_user_key like '%' || ph || '%')
    or exists (select 1 from public.store_price_visibility_events where memo like '%' || ph || '%')
    or exists (select 1 from public.store_phone_link_notices where phone_last4 = ph) then raise exception 'phone_leaked'; end if;
  -- 멱등: 다시 확인해도 새 구성원·이벤트·알림이 늘지 않는다.
  r := public.confirm_phone_link_v1(u1, ph, array[k1, k3, k7, k8], array[c1, c2]);
  if jsonb_array_length(r->'linked') <> 0 or (select count(*) from public.store_account_member_events where store_account_id = a1) <> 1
    or (select count(*) from public.store_phone_link_notices where customer_id = k4) <> 1 then raise exception 'not_idempotent_%', r; end if;
  -- 연결된 매장은 후보에서 빠지고, 선택 안 한 k2는 그대로 남는다.
  if (select count(*) from public.phone_link_candidates_v1(u1, ph, array[c1, c2]) where customer_id in (k1, k3, k7)) <> 0 then raise exception 'linked_still_candidate'; end if;
  if (select count(*) from public.phone_link_candidates_v1(u1, ph, array[c1, c2]) where customer_id = k2) <> 1 then raise exception 'k2_missing'; end if;

  -- 거절: 다른 사용자(u2)가 k2를 아니라고 하면 알림만 남고 다시 묻지 않는다.
  n := public.decline_phone_link_v1(u2, ph, array[k2], array[c1, c2]);
  if n <> 1 or (select count(*) from public.store_phone_link_notices where customer_id = k2 and auth_user_id = u2 and kind = 'declined') <> 1 then raise exception 'decline_notice'; end if;
  if (select count(*) from public.phone_link_candidates_v1(u2, ph, array[c1, c2]) where customer_id = k2) <> 0 then raise exception 'declined_still_candidate'; end if;
  if (select count(*) from public.store_accounts where customer_id = k2) <> 0 then raise exception 'declined_store_created'; end if;
  if public.decline_phone_link_v1(u2, ph, array[k2], array[c1, c2]) <> 0 then raise exception 'decline_not_idempotent'; end if;
end $t$;

-- service_role 외(authenticated)는 호출 불가
reset role;
set role authenticated;
do $t$ declare ok boolean := false; begin
  begin perform public.phone_link_candidates_v1('30000000-0000-4000-8000-000000000001', '01011112222', array['10000000-0000-4000-8000-000000000001']::uuid[]);
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'authenticated_can_call'; end if;
end $t$;
reset role;
select 'CX-146 PG17 OK' as result;

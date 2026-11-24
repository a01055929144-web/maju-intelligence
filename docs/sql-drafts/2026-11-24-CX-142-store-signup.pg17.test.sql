-- CX-142 PG17: 운영과 같은 열을 가진 합성 표 위에서 CX-122 초안 → CX-142 초안 순서로 적용
\set ON_ERROR_STOP on
begin;
create role service_role nologin; create role anon nologin; create role authenticated nologin;
create table public.companies(id uuid primary key);
create table public.company_members(id uuid primary key, company_id uuid not null references public.companies(id), status text not null default 'active',
  role text not null default 'owner', permission_role text, unique(company_id, id));
create table public.normalized_customers(id uuid primary key, company_id uuid not null, unique(company_id, id));
create table public.store_accounts(id uuid primary key, company_id uuid not null references public.companies(id), customer_id uuid,
  status text not null default 'active', business_status text not null default 'active',
  customer_review_status text not null default 'confirmed' check (customer_review_status in ('needs_review', 'confirmed')),
  updated_at timestamptz not null default now(), unique(company_id, id));
create table public.store_owner_activation_requests(id uuid primary key default gen_random_uuid(), company_id uuid not null, invite_token_hash text not null unique,
  consumed_at timestamptz, cancelled_at timestamptz, expires_at timestamptz not null default now() + interval '7 days');
create table public.business_permit_leads(id uuid primary key, company_id uuid not null, merged_into_lead_id uuid, matched_customer_id uuid,
  matched_customer_at timestamptz, matched_customer_method text, matched_customer_confidence integer, updated_at timestamptz default now(),
  constraint business_permit_leads_match_method_check check (matched_customer_method is null or matched_customer_method in ('business_number', 'name_address', 'manual', 'conversion')),
  unique(company_id, id));
create table public.lead_actions(id uuid primary key default gen_random_uuid(), company_id uuid not null, lead_id uuid not null, action_type text not null,
  result text, memo text, actor_name text, created_at timestamptz not null default clock_timestamp());
insert into public.companies values ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000c2');
insert into public.company_members(id, company_id) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1');
insert into public.store_accounts(id, company_id, customer_id, customer_review_status) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1', 'confirmed'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d2', 'needs_review'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d3', 'confirmed'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d4', 'confirmed'),
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000d5', 'confirmed');
commit;

\ir 2026-11-18-CX-122-store-price-visibility.sql

-- 적용 전부터 회사가 직접 확인한 매장(a3): 기존 확인은 그대로 유지돼야 한다
select public.set_store_price_visibility_v1('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000b1', 'confirm', '직접') \gset

begin;
insert into public.business_permit_leads(id, company_id, matched_customer_id, matched_customer_method) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', null, null),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000dd', 'business_number'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d4', 'business_number'),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000c2', null, null);
insert into public.business_permit_leads(id, company_id, merged_into_lead_id) values
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1');
insert into public.store_owner_activation_requests(id, company_id, invite_token_hash, consumed_at, cancelled_at, expires_at) values
  (gen_random_uuid(), '00000000-0000-0000-0000-0000000000c1', 'open-ok-token-hash-0001', null, null, now() + interval '1 day'),
  (gen_random_uuid(), '00000000-0000-0000-0000-0000000000c1', 'consumed-token-hash-001', now(), null, now() + interval '1 day'),
  (gen_random_uuid(), '00000000-0000-0000-0000-0000000000c1', 'expired-token-hash-001', null, null, now() - interval '1 day');
commit;

\ir 2026-11-24-CX-142-store-signup.sql

do $t$
declare c1 uuid := '00000000-0000-0000-0000-0000000000c1'; c2 uuid := '00000000-0000-0000-0000-0000000000c2';
  a1 uuid := '00000000-0000-0000-0000-0000000000a1'; a2 uuid := '00000000-0000-0000-0000-0000000000a2'; a3 uuid := '00000000-0000-0000-0000-0000000000a3';
  a4 uuid := '00000000-0000-0000-0000-0000000000a4'; a5 uuid := '00000000-0000-0000-0000-0000000000a5';
  m1 uuid := '00000000-0000-0000-0000-0000000000b1';
  l1 uuid := '00000000-0000-0000-0000-0000000000e1'; l2 uuid := '00000000-0000-0000-0000-0000000000e2'; l3 uuid := '00000000-0000-0000-0000-0000000000e3';
  l4 uuid := '00000000-0000-0000-0000-0000000000e4'; l5 uuid := '00000000-0000-0000-0000-0000000000e5';
  r jsonb; ok boolean;
begin
  -- 기존 직접 확인(a3)은 그대로: source member, 기록자 있음
  if (select price_visibility_confirmed_source from public.store_accounts where id = a3) <> 'member'
    or (select price_visibility_confirmed_by_member_id from public.store_accounts where id = a3) is distinct from m1 then raise exception 'existing_member_confirm_changed'; end if;

  -- 가입 완료(초대): 시스템 자동 확인, 기록자 없음
  r := public.finalize_store_signup_v1(c1, a1, 'invite');
  if r->>'autoConfirmed' <> 'true' then raise exception 'not_auto_confirmed'; end if;
  if (select array[price_visibility_status, price_visibility_confirmed_source] from public.store_accounts where id = a1) <> array['confirmed', 'system_signup']
    or (select price_visibility_confirmed_by_member_id from public.store_accounts where id = a1) is not null then raise exception 'system_confirm_shape'; end if;
  if not public.store_price_visible_v1(c1, a1) then raise exception 'price_not_visible_after_auto_confirm'; end if;
  if (select array[actor_role, memo] from public.store_price_visibility_events where store_account_id = a1) <> array['system', '초대 가입 자동 확인'] then raise exception 'system_event'; end if;
  -- 재진입(멱등): 두 번째는 아무것도 바꾸지 않는다
  r := public.finalize_store_signup_v1(c1, a1, 'invite');
  if r->>'autoConfirmed' <> 'false' or (select count(*) from public.store_price_visibility_events where store_account_id = a1) <> 1 then raise exception 'not_idempotent'; end if;

  -- 고객사 확인 대기(needs_review, 전화번호만 일치한 경우 등)는 자동 확인하지 않는다
  r := public.finalize_store_signup_v1(c1, a2, 'company_link');
  if r->>'autoConfirmed' <> 'false' or (select price_visibility_status from public.store_accounts where id = a2) <> 'pending' then raise exception 'needs_review_auto_confirmed'; end if;
  -- 이미 회사가 직접 확인한 매장은 시스템이 덮어쓰지 않는다
  r := public.finalize_store_signup_v1(c1, a3, 'invite');
  if r->>'autoConfirmed' <> 'false' or (select price_visibility_confirmed_source from public.store_accounts where id = a3) <> 'member' then raise exception 'member_confirm_overwritten'; end if;

  -- 회사가 시스템 확인을 취소하면 pending·member로 돌아가고, 같은 매장이 다시 가입해도 되살아나지 않는다
  perform public.set_store_price_visibility_v1(c1, a1, m1, 'cancel', '취소');
  if (select array[price_visibility_status, price_visibility_confirmed_source] from public.store_accounts where id = a1) <> array['pending', 'member'] then raise exception 'cancel_shape'; end if;
  r := public.finalize_store_signup_v1(c1, a1, 'invite');
  if r->>'autoConfirmed' <> 'false' or public.store_price_visible_v1(c1, a1) then raise exception 'cancelled_store_reconfirmed'; end if;
  -- 회사가 다시 직접 확인하면 member
  perform public.set_store_price_visibility_v1(c1, a1, m1, 'confirm', '직접');
  if (select array[price_visibility_confirmed_source, price_visibility_confirmed_by_member_id::text] from public.store_accounts where id = a1) <> array['member', m1::text] then raise exception 'member_reconfirm'; end if;

  -- 잘못된 경로·없는 매장·다른 회사
  ok := false; begin perform public.finalize_store_signup_v1(c1, a4, 'direct'); exception when others then ok := sqlerrm = 'store_signup_invalid_route'; end;
  if not ok then raise exception 'invalid_route'; end if;
  ok := false; begin perform public.finalize_store_signup_v1(c2, a4, 'invite'); exception when others then ok := sqlerrm = 'store_account_not_found'; end;
  if not ok then raise exception 'cross_company_account'; end if;

  -- 리드 연결: 새 리드는 store_signup으로 연결 + 타임라인 한 줄, 다시 가입해도 한 줄
  r := public.finalize_store_signup_v1(c1, a4, 'invite', l1);
  if r->>'leadLinked' <> 'true' or (select array[matched_customer_id::text, matched_customer_method] from public.business_permit_leads where id = l1) <> array['00000000-0000-0000-0000-0000000000d4', 'store_signup'] then raise exception 'lead_not_linked'; end if;
  perform public.finalize_store_signup_v1(c1, a4, 'invite', l1);
  if (select count(*) from public.lead_actions where lead_id = l1 and action_type = 'store_signup') <> 1 then raise exception 'lead_action_duplicated'; end if;
  -- 다른 거래처에 이미 연결된 리드는 건드리지 않는다
  r := public.finalize_store_signup_v1(c1, a2, 'invite', l2);
  if r->>'leadLinked' <> 'false' or (select matched_customer_id from public.business_permit_leads where id = l2) <> '00000000-0000-0000-0000-0000000000dd'
    or exists (select 1 from public.lead_actions where lead_id = l2) then raise exception 'other_customer_lead_touched'; end if;
  -- 같은 거래처에 이미 연결된 리드는 방법(business_number)을 보존하고 타임라인 한 줄만 추가
  r := public.finalize_store_signup_v1(c1, a4, 'invite', l3);
  if r->>'leadLinked' <> 'true' or (select matched_customer_method from public.business_permit_leads where id = l3) <> 'business_number'
    or (select count(*) from public.lead_actions where lead_id = l3 and action_type = 'store_signup') <> 1 then raise exception 'same_customer_lead'; end if;
  -- 다른 회사의 리드·병합된 리드는 연결하지 않는다
  if (public.finalize_store_signup_v1(c1, a4, 'invite', l4))->>'leadLinked' <> 'false' or (select matched_customer_id from public.business_permit_leads where id = l4) is not null then raise exception 'cross_company_lead'; end if;
  if (public.finalize_store_signup_v1(c1, a4, 'invite', l5))->>'leadLinked' <> 'false' then raise exception 'merged_lead'; end if;
  -- 연락 집계 대상이 아닌 종류(contact 유형 call·visit 등과 다름)로만 기록
  if exists (select 1 from public.lead_actions where action_type = 'store_signup' and action_type in ('call','dm','visit','quote','sms','talktalk','email','fax')) then raise exception 'counted_as_contact'; end if;
  -- 허용하지 않는 방법 이름은 거부
  ok := false; begin update public.business_permit_leads set matched_customer_method = 'bogus' where id = l4; exception when check_violation then ok := true; end;
  if not ok then raise exception 'bogus_method_accepted'; end if;

  -- 초대 열람 기록: 열 때마다 횟수 +1, 처음 열람 시각은 유지, 가입 완료·만료·없는 토큰은 기록 안 함
  if not public.record_store_invite_open_v1('open-ok-token-hash-0001') or not public.record_store_invite_open_v1('open-ok-token-hash-0001') then raise exception 'open_not_recorded'; end if;
  if (select open_count from public.store_owner_activation_requests where invite_token_hash = 'open-ok-token-hash-0001') <> 2
    or (select first_opened_at > last_opened_at from public.store_owner_activation_requests where invite_token_hash = 'open-ok-token-hash-0001') then raise exception 'open_count'; end if;
  if public.record_store_invite_open_v1('consumed-token-hash-001') or public.record_store_invite_open_v1('expired-token-hash-001')
    or public.record_store_invite_open_v1('missing-token-hash-0001') or public.record_store_invite_open_v1('short') then raise exception 'open_recorded_for_unavailable'; end if;

  -- 권한: service_role만
  if has_function_privilege('anon', 'public.finalize_store_signup_v1(uuid,uuid,text,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.record_store_invite_open_v1(text)', 'execute')
    or not has_function_privilege('service_role', 'public.finalize_store_signup_v1(uuid,uuid,text,uuid)', 'execute') then raise exception 'privileges'; end if;
end $t$;

-- down: 시스템 확인·store_signup 연결이 남아 있으면 중단(데이터를 바꾸지 않음)
\set ON_ERROR_STOP off
\ir 2026-11-24-CX-142-store-signup.down.sql
rollback;
\set ON_ERROR_STOP on
do $b$ begin
  if to_regprocedure('public.finalize_store_signup_v1(uuid,uuid,text,uuid)') is null then raise exception 'down_ran_despite_system_rows'; end if;
end $b$;

-- 시스템 기록을 모두 걷어낸 뒤에는 down이 끝까지 적용되고 CX-122 상태로 돌아간다
begin;
delete from public.store_price_visibility_events where actor_role = 'system';
update public.store_accounts set price_visibility_status = 'pending', price_visibility_confirmed_at = null,
  price_visibility_confirmed_by_member_id = null, price_visibility_confirmed_source = 'member' where price_visibility_confirmed_source = 'system_signup';
update public.business_permit_leads set matched_customer_method = 'manual' where matched_customer_method = 'store_signup';
commit;
\ir 2026-11-24-CX-142-store-signup.down.sql
do $d$ begin
  if to_regprocedure('public.finalize_store_signup_v1(uuid,uuid,text,uuid)') is not null or to_regprocedure('public.record_store_invite_open_v1(text)') is not null
    or exists (select 1 from information_schema.columns where table_name = 'store_accounts' and column_name = 'price_visibility_confirmed_source')
    or exists (select 1 from information_schema.columns where table_name = 'store_owner_activation_requests' and column_name = 'open_count')
    then raise exception 'down_remains'; end if;
  -- CX-122 본문으로 복귀: 직접 확인/취소가 그대로 동작
  perform public.set_store_price_visibility_v1('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000b1', 'confirm', '복귀 후');
  if not public.store_price_visible_v1('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a4') then raise exception 'down_cx122_broken'; end if;
  if (select count(*) from public.store_accounts) <> 5 then raise exception 'down_touched_accounts'; end if;
end $d$;

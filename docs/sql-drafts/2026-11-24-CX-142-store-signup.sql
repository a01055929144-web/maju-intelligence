-- DRAFT ONLY. CX-142: 기존 거래처 카카오 초대 가입 완료 처리(시스템 외식업 확인 · 리드 연결 · 초대 열람 기록). 운영 적용은 대표 승인 문구 후 컨트롤타워.
-- 선행: CX-122(store_price_visibility)·CX-13(customer_review_status)·store_owner_activation_requests·business_permit_leads·lead_actions. 기존 행의 값은 바꾸지 않는다.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if to_regclass('public.store_owner_activation_requests') is null
    or to_regclass('public.store_price_visibility_events') is null
    or to_regclass('public.business_permit_leads') is null
    or to_regclass('public.lead_actions') is null
    or to_regprocedure('public.set_store_price_visibility_v1(uuid,uuid,uuid,text,text,jsonb)') is null
    or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'store_accounts' and column_name = 'customer_review_status')
  then raise exception 'cx142_prerequisites_required'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'store_accounts' and column_name = 'price_visibility_confirmed_source')
  then raise exception 'cx142_already_applied'; end if;
end $$;

-- A. 시스템 확인(링크·초대 가입 자동 확인): 기록자 없이 'system_signup'. 회사가 취소하면 member 기본값으로 돌아간다.
alter table public.store_accounts
  add column price_visibility_confirmed_source text not null default 'member'
    check (price_visibility_confirmed_source in ('member', 'system_signup'));
alter table public.store_accounts drop constraint store_accounts_price_visibility_state_ck;
alter table public.store_accounts add constraint store_accounts_price_visibility_state_ck check (
  (price_visibility_status = 'pending' and price_visibility_confirmed_at is null
    and price_visibility_confirmed_by_member_id is null and price_visibility_confirmed_source = 'member')
  or (price_visibility_status = 'confirmed' and price_visibility_confirmed_at is not null and (
    (price_visibility_confirmed_source = 'member' and price_visibility_confirmed_by_member_id is not null)
    or (price_visibility_confirmed_source = 'system_signup' and price_visibility_confirmed_by_member_id is null)))
);

alter table public.store_price_visibility_events alter column actor_company_member_id drop not null;
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid = 'public.store_price_visibility_events'::regclass
    and contype = 'c' and pg_get_constraintdef(oid) like '%actor_role%'
  loop execute format('alter table public.store_price_visibility_events drop constraint %I', c.conname); end loop;
end $$;
alter table public.store_price_visibility_events
  add constraint store_price_visibility_events_actor_role_ck check (actor_role in ('owner', 'manager', 'system')),
  add constraint store_price_visibility_events_actor_system_ck check ((actor_role = 'system') = (actor_company_member_id is null));

-- 회사가 확인·취소할 때 source를 member로 되돌리도록 기존 함수를 교체(본문은 CX-122와 같고 source 한 줄만 추가).
create or replace function public.set_store_price_visibility_v1(
  p_company uuid, p_store_account uuid, p_actor_company_member uuid, p_action text, p_memo text default null,
  p_reference_snapshot jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare account public.store_accounts%rowtype; actor_role text; target_status text;
begin
  if p_action not in ('confirm', 'cancel') then raise exception 'store_price_visibility_invalid_action'; end if;
  if p_reference_snapshot is null or jsonb_typeof(p_reference_snapshot) <> 'object'
    or exists (select 1 from jsonb_each(p_reference_snapshot) where jsonb_typeof(value) not in ('boolean', 'null'))
    then raise exception 'store_price_visibility_invalid_reference'; end if;
  select coalesce(permission_role, case when role in ('owner', 'manager') then role else 'staff' end)
    into actor_role from public.company_members
    where company_id = p_company and id = p_actor_company_member and status = 'active' for share;
  if actor_role is null or actor_role not in ('owner', 'manager')
    then raise exception 'store_price_visibility_forbidden'; end if;
  select * into account from public.store_accounts
    where company_id = p_company and id = p_store_account and status = 'active' for update;
  if not found then raise exception 'store_account_not_found'; end if;
  if account.business_status = 'registration_pending'
    then raise exception 'store_price_visibility_preopening'; end if;
  target_status := case p_action when 'confirm' then 'confirmed' else 'pending' end;
  if account.price_visibility_status = target_status then
    return jsonb_build_object('storeAccountId', account.id, 'status', target_status, 'alreadyApplied', true);
  end if;
  update public.store_accounts set
    price_visibility_status = target_status,
    price_visibility_confirmed_at = case when target_status = 'confirmed' then clock_timestamp() end,
    price_visibility_confirmed_by_member_id = case when target_status = 'confirmed' then p_actor_company_member end,
    price_visibility_confirmed_source = 'member',
    updated_at = clock_timestamp()
    where company_id = p_company and id = p_store_account;
  insert into public.store_price_visibility_events(company_id, store_account_id, event_type,
    actor_company_member_id, actor_role, memo, reference_snapshot)
    values (p_company, p_store_account, case p_action when 'confirm' then 'confirmed' else 'cancelled' end,
      p_actor_company_member, actor_role, left(nullif(btrim(p_memo), ''), 500), p_reference_snapshot);
  return jsonb_build_object('storeAccountId', account.id, 'status', target_status, 'alreadyApplied', false);
end $$;

-- B. 초대 열람 기록(누가가 아니라 몇 번·언제: 열기 전에는 로그인 전이라 익명, 가입하면 consumed_at이 가입자를 대신한다).
alter table public.store_owner_activation_requests
  add column first_opened_at timestamptz,
  add column last_opened_at timestamptz,
  add column open_count integer not null default 0 check (open_count >= 0);

create function public.record_store_invite_open_v1(p_invite_token_hash text) returns boolean
language plpgsql security invoker set search_path = public, pg_temp as $$
declare n integer;
begin
  if p_invite_token_hash is null or length(p_invite_token_hash) < 16 then return false; end if;
  update public.store_owner_activation_requests set
    first_opened_at = coalesce(first_opened_at, clock_timestamp()), last_opened_at = clock_timestamp(), open_count = open_count + 1
    where invite_token_hash = p_invite_token_hash and consumed_at is null and cancelled_at is null and expires_at > clock_timestamp();
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- C. 리드 연결과 타임라인 한 줄(영업 성과 "연락" 집계에는 들어가지 않는 action_type 'store_signup'), 같은 리드에 한 번만.
alter table public.business_permit_leads drop constraint if exists business_permit_leads_match_method_check;
alter table public.business_permit_leads add constraint business_permit_leads_match_method_check
  check (matched_customer_method is null or matched_customer_method in ('business_number', 'name_address', 'manual', 'conversion', 'store_signup'));
create unique index lead_actions_store_signup_once_uq on public.lead_actions(company_id, lead_id) where action_type = 'store_signup';

-- D. 가입 완료 처리(멱등): 시스템 자동 확인(고객사가 확인을 마친 매장만, 한 번도 확인·취소 기록이 없을 때만) + 리드 연결.
create function public.finalize_store_signup_v1(p_company uuid, p_store_account uuid, p_route text, p_lead uuid default null)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare account public.store_accounts%rowtype; lead public.business_permit_leads%rowtype; confirmed boolean := false; linked boolean := false;
begin
  if p_route not in ('invite', 'company_link') then raise exception 'store_signup_invalid_route'; end if;
  select * into account from public.store_accounts where company_id = p_company and id = p_store_account and status = 'active' for update;
  if not found then raise exception 'store_account_not_found'; end if;
  -- 이전에 회사가 확인했다가 취소한 매장을 가입 재진입으로 다시 켜지 않도록, 기록이 하나도 없을 때만 자동 확인한다.
  if account.price_visibility_status = 'pending' and account.business_status = 'active' and account.customer_review_status = 'confirmed'
    and not exists (select 1 from public.store_price_visibility_events where company_id = p_company and store_account_id = p_store_account)
  then
    update public.store_accounts set price_visibility_status = 'confirmed', price_visibility_confirmed_at = clock_timestamp(),
      price_visibility_confirmed_by_member_id = null, price_visibility_confirmed_source = 'system_signup', updated_at = clock_timestamp()
      where company_id = p_company and id = p_store_account;
    insert into public.store_price_visibility_events(company_id, store_account_id, event_type, actor_company_member_id, actor_role, memo)
      values (p_company, p_store_account, 'confirmed', null, 'system',
        case p_route when 'invite' then '초대 가입 자동 확인' else '링크 가입 자동 확인' end);
    confirmed := true;
  end if;
  if p_lead is not null then
    select * into lead from public.business_permit_leads where company_id = p_company and id = p_lead and merged_into_lead_id is null for update;
    if found and (lead.matched_customer_id is null or lead.matched_customer_id = account.customer_id) then
      if lead.matched_customer_id is null then
        update public.business_permit_leads set matched_customer_id = account.customer_id, matched_customer_at = clock_timestamp(),
          matched_customer_method = 'store_signup', matched_customer_confidence = 100, updated_at = clock_timestamp()
          where company_id = p_company and id = p_lead;
      end if;
      insert into public.lead_actions(company_id, lead_id, action_type, result, memo, actor_name)
        values (p_company, p_lead, 'store_signup', '카카오 가입·매장 등록', '카카오 가입·매장 등록', '시스템')
        on conflict (company_id, lead_id) where action_type = 'store_signup' do nothing;
      linked := true;
    end if;
  end if;
  return jsonb_build_object('storeAccountId', p_store_account, 'autoConfirmed', confirmed, 'leadLinked', linked);
end $$;

revoke all on function public.set_store_price_visibility_v1(uuid, uuid, uuid, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.record_store_invite_open_v1(text) from public, anon, authenticated, service_role;
revoke all on function public.finalize_store_signup_v1(uuid, uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_store_price_visibility_v1(uuid, uuid, uuid, text, text, jsonb) to service_role;
grant execute on function public.record_store_invite_open_v1(text) to service_role;
grant execute on function public.finalize_store_signup_v1(uuid, uuid, text, uuid) to service_role;
notify pgrst, 'reload schema';

commit;

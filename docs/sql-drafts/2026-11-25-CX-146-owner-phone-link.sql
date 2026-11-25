-- DRAFT ONLY. CX-146: 점주 휴대폰으로 매장 자동 연결(거래처 '점주 휴대폰' 칸 · 후보 조회 · 확인 후 연결 · 알림). 운영 적용은 대표 승인 문구 후 컨트롤타워.
-- 선행: CX-122(store_price_visibility)·CX-142(price_visibility_confirmed_source)·20261110 store-preopening·CX-13(customer_review_status)·store_account_members/events.
-- 번호 원문은 서버 전용 함수 안에서만 대조한다. 이벤트·알림에는 뒤 4자리만 남긴다.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if to_regclass('public.normalized_customers') is null or to_regclass('public.store_accounts') is null
    or to_regclass('public.store_account_members') is null or to_regclass('public.store_account_member_events') is null
    or to_regclass('public.store_price_visibility_events') is null or to_regclass('public.app_users') is null
    or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'store_accounts' and column_name = 'price_visibility_confirmed_source')
    or not exists (select 1 from pg_constraint where conrelid = 'public.store_accounts'::regclass and conname = 'store_accounts_registration_pending_check')
  then raise exception 'cx146_prerequisites_required'; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'normalized_customers' and column_name = 'owner_mobile')
  then raise exception 'cx146_already_applied'; end if;
end $$;

-- A. 거래처 '점주 휴대폰'(정규화 010xxxxxxxx). 같은 번호를 여러 거래처에 넣을 수 있어 unique가 아니다.
alter table public.normalized_customers
  add column owner_mobile text check (owner_mobile is null or owner_mobile ~ '^010[0-9]{8}$');
create index normalized_customers_owner_mobile_idx on public.normalized_customers(owner_mobile) where owner_mobile is not null;

-- B. 가격 확인 출처 'phone_match'(고객사가 입력한 번호 + 점주 카카오 확인). 고객사 보증 매장은 사업자번호·국세청 확인 없이 active.
alter table public.store_accounts add column owner_vouched boolean not null default false;
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid = 'public.store_accounts'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%price_visibility_confirmed_source%' and conname <> 'store_accounts_price_visibility_state_ck'
  loop execute format('alter table public.store_accounts drop constraint %I', c.conname); end loop;
end $$;
alter table public.store_accounts add constraint store_accounts_price_visibility_source_ck
  check (price_visibility_confirmed_source in ('member', 'system_signup', 'phone_match'));
alter table public.store_accounts drop constraint store_accounts_price_visibility_state_ck;
alter table public.store_accounts add constraint store_accounts_price_visibility_state_ck check (
  (price_visibility_status = 'pending' and price_visibility_confirmed_at is null
    and price_visibility_confirmed_by_member_id is null and price_visibility_confirmed_source = 'member')
  or (price_visibility_status = 'confirmed' and price_visibility_confirmed_at is not null and (
    (price_visibility_confirmed_source = 'member' and price_visibility_confirmed_by_member_id is not null)
    or (price_visibility_confirmed_source in ('system_signup', 'phone_match') and price_visibility_confirmed_by_member_id is null)))
);
alter table public.store_accounts drop constraint store_accounts_registration_pending_check;
alter table public.store_accounts add constraint store_accounts_registration_pending_check
  check ((business_status <> 'registration_pending' or
    (business_registration_number is null and business_status_verified_at is null and verification_request_id is null))
    and (business_status <> 'active' or owner_vouched or
    (business_registration_number is not null and business_status_verified_at is not null and verification_request_id is not null)));

-- C. 고객사 알림: 점주가 "내 매장 아님"이라고 했거나(declined), 이미 다른 활성 점주가 있어 자동 연결하지 않은 경우(owner_conflict).
create table public.store_phone_link_notices(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null,
  auth_user_id uuid not null references public.app_users(id) on delete cascade,
  kind text not null check (kind in ('declined', 'owner_conflict')),
  phone_last4 text not null check (phone_last4 ~ '^[0-9]{4}$'),
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  foreign key (company_id, customer_id) references public.normalized_customers(company_id, id) on delete cascade
);
create unique index store_phone_link_notices_open_uq on public.store_phone_link_notices(company_id, customer_id, auth_user_id, kind) where resolved_at is null;
alter table public.store_phone_link_notices enable row level security;
revoke all on public.store_phone_link_notices from public, anon, authenticated;
grant select, insert, update on public.store_phone_link_notices to service_role;

-- D. 후보 조회(읽기). 같은 번호 · 허용 회사 · 이 사용자가 아직 구성원이 아닌 거래처. 거절한 거래처는 다시 묻지 않는다.
create function public.phone_link_candidates_v1(p_auth_user uuid, p_phone text, p_companies uuid[])
returns table(company_id uuid, customer_id uuid, customer_name text, address_hint text, store_account_id uuid, state text)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if p_phone is null or p_phone !~ '^010[0-9]{8}$' then return; end if;
  perform 1 from public.app_users u where u.id = p_auth_user and u.status = 'active';
  if not found then return; end if;
  return query
    select c.company_id, c.id, c.customer_name, left(coalesce(c.address, ''), 10), a.id,
      case when a.id is null then 'linkable'
        when a.status <> 'active' or a.business_status = 'registration_pending' then 'unavailable'
        when exists (select 1 from public.store_account_members o where o.company_id = a.company_id and o.store_account_id = a.id
          and o.role = 'owner' and o.status = 'active' and o.auth_user_id is distinct from p_auth_user) then 'owner_conflict'
        else 'linkable' end
    from public.normalized_customers c
    left join public.store_accounts a on a.company_id = c.company_id and a.customer_id = c.id
    where c.owner_mobile = p_phone and c.company_id = any(coalesce(p_companies, '{}'::uuid[]))
      and not exists (select 1 from public.store_account_members m where m.company_id = c.company_id and m.store_account_id = a.id
        and m.auth_user_id = p_auth_user and m.status = 'active')
      and not exists (select 1 from public.store_phone_link_notices n where n.company_id = c.company_id and n.customer_id = c.id
        and n.auth_user_id = p_auth_user and n.kind = 'declined' and n.resolved_at is null)
    order by c.company_id, c.customer_name, c.id;
end $$;

-- E. 확인 후 연결(멱등). 선택한 거래처만 점주로 연결한다. 번호는 다시 대조하고, 이미 다른 활성 점주가 있으면 연결하지 않고 고객사 알림만 남긴다.
create function public.confirm_phone_link_v1(p_auth_user uuid, p_phone text, p_customer_ids uuid[], p_companies uuid[])
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare c record; a public.store_accounts%rowtype; v_member public.store_account_members%rowtype; v_last4 text;
  v_linked jsonb := '[]'::jsonb; v_conflicts integer := 0; v_skipped integer := 0; v_confirmed boolean; v_has boolean;
begin
  if p_phone is null or p_phone !~ '^010[0-9]{8}$' then raise exception 'phone_link_phone_invalid'; end if;
  v_last4 := right(p_phone, 4);
  perform 1 from public.app_users where id = p_auth_user and status = 'active' and kakao_user_id is not null for share;
  if not found then raise exception 'phone_link_user_unavailable'; end if;
  for c in select nc.company_id, nc.id as customer_id from public.normalized_customers nc
    where nc.owner_mobile = p_phone and nc.company_id = any(coalesce(p_companies, '{}'::uuid[])) order by nc.company_id, nc.id
  loop
    perform pg_advisory_xact_lock(hashtextextended(c.company_id::text || '|' || c.customer_id::text, 0));
    select * into a from public.store_accounts where company_id = c.company_id and customer_id = c.customer_id for update;
    v_has := found;
    if v_has and exists (select 1 from public.store_account_members o where o.company_id = a.company_id and o.store_account_id = a.id
      and o.role = 'owner' and o.status = 'active' and o.auth_user_id is distinct from p_auth_user) then
      insert into public.store_phone_link_notices(company_id, customer_id, auth_user_id, kind, phone_last4)
        values (c.company_id, c.customer_id, p_auth_user, 'owner_conflict', v_last4) on conflict do nothing;
      v_conflicts := v_conflicts + 1; continue;
    end if;
    if not (c.customer_id = any(coalesce(p_customer_ids, '{}'::uuid[]))) then continue; end if;
    if v_has and (a.status <> 'active' or a.business_status = 'registration_pending') then v_skipped := v_skipped + 1; continue; end if;
    if v_has and exists (select 1 from public.store_account_members m where m.company_id = a.company_id and m.store_account_id = a.id
      and m.auth_user_id = p_auth_user and m.status = 'active') then continue; end if;
    if not v_has then
      insert into public.store_accounts(company_id, customer_id, business_registration_number, business_status, business_status_verified_at,
          verification_request_id, terms_version, terms_accepted_at, status, owner_vouched)
        values (c.company_id, c.customer_id, null, 'active', null, null, 'phone-match', clock_timestamp(), 'active', true)
        returning * into a;
    end if;
    insert into public.store_account_members(company_id, store_account_id, auth_user_id, role, status, joined_at)
      values (c.company_id, a.id, p_auth_user, 'owner', 'active', clock_timestamp()) returning * into v_member;
    insert into public.store_account_member_events(company_id, store_account_id, member_id, event_type, actor_user_key, reason)
      values (c.company_id, a.id, v_member.id, 'join', 'phone-match:' || c.customer_id::text, 'phone_match:' || v_last4);
    update public.store_accounts set terms_accepted_by_member_id = coalesce(terms_accepted_by_member_id, v_member.id), updated_at = clock_timestamp()
      where company_id = a.company_id and id = a.id;
    -- 가격 공개: 확인·취소 기록이 하나도 없을 때만 system 확인(회사가 취소한 매장을 다시 켜지 않는다).
    v_confirmed := false;
    if a.price_visibility_status = 'pending' and a.customer_review_status = 'confirmed'
      and not exists (select 1 from public.store_price_visibility_events e where e.company_id = a.company_id and e.store_account_id = a.id) then
      update public.store_accounts set price_visibility_status = 'confirmed', price_visibility_confirmed_at = clock_timestamp(),
        price_visibility_confirmed_by_member_id = null, price_visibility_confirmed_source = 'phone_match'
        where company_id = a.company_id and id = a.id;
      insert into public.store_price_visibility_events(company_id, store_account_id, event_type, actor_company_member_id, actor_role, memo)
        values (a.company_id, a.id, 'confirmed', null, 'system', '점주 휴대폰 확인 연결');
      v_confirmed := true;
    end if;
    v_linked := v_linked || jsonb_build_array(jsonb_build_object('companyId', c.company_id, 'customerId', c.customer_id,
      'storeAccountId', a.id, 'priceConfirmed', v_confirmed));
  end loop;
  return jsonb_build_object('linked', v_linked, 'conflicts', v_conflicts, 'skipped', v_skipped);
end $$;

-- F. "내 매장이 아님": 연결하지 않고 고객사 알림만 남긴다(같은 사용자에게 다시 묻지 않음).
create function public.decline_phone_link_v1(p_auth_user uuid, p_phone text, p_customer_ids uuid[], p_companies uuid[])
returns integer language plpgsql security invoker set search_path = public, pg_temp as $$
declare n integer;
begin
  if p_phone is null or p_phone !~ '^010[0-9]{8}$' then raise exception 'phone_link_phone_invalid'; end if;
  perform 1 from public.app_users where id = p_auth_user and status = 'active' and kakao_user_id is not null;
  if not found then raise exception 'phone_link_user_unavailable'; end if;
  insert into public.store_phone_link_notices(company_id, customer_id, auth_user_id, kind, phone_last4)
    select c.company_id, c.id, p_auth_user, 'declined', right(p_phone, 4) from public.normalized_customers c
    where c.owner_mobile = p_phone and c.company_id = any(coalesce(p_companies, '{}'::uuid[])) and c.id = any(coalesce(p_customer_ids, '{}'::uuid[]))
    on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.phone_link_candidates_v1(uuid, text, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.confirm_phone_link_v1(uuid, text, uuid[], uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.decline_phone_link_v1(uuid, text, uuid[], uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.phone_link_candidates_v1(uuid, text, uuid[]) to service_role;
grant execute on function public.confirm_phone_link_v1(uuid, text, uuid[], uuid[]) to service_role;
grant execute on function public.decline_phone_link_v1(uuid, text, uuid[], uuid[]) to service_role;
notify pgrst, 'reload schema';
commit;

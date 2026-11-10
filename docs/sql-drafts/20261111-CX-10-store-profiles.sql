-- DRAFT ONLY (CX-10, R2 S1). Requires separate operating DB approval. No flag, no backfill here
-- (backfill is 20261111-CX-10-store-profiles-backfill.sql, approved separately).
-- MAJU store profile = one real store on the platform; store_accounts stay per-distributor connections.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

do $$ begin
  if to_regclass('public.store_accounts') is null or to_regclass('public.app_users') is null
    or to_regclass('public.companies') is null
    then raise exception 'cx10_store_profile_prerequisites_required'; end if;
  if to_regclass('public.store_profiles') is not null then raise exception 'cx10_already_applied'; end if;
end $$;

create table public.store_profiles (
  id uuid primary key default gen_random_uuid(),
  store_name text not null check (length(btrim(store_name)) between 1 and 100 and store_name = btrim(store_name)),
  business_registration_number text check (business_registration_number ~ '^\d{10}$'),
  business_status text not null default 'registration_pending'
    check (business_status in ('active','closed','suspended','registration_pending')),
  base_address text check (base_address is null or length(base_address) between 1 and 300),
  address_detail text check (address_detail is null or length(address_detail) <= 200),
  status text not null default 'active' check (status in ('active','suspended','closed')),
  origin text not null check (origin in ('direct','link','backfill')),
  backfilled_from_store_account_id uuid unique,
  terms_version text not null check (length(terms_version) between 1 and 40),
  terms_accepted_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  -- 개업 예정 매장은 사업자번호 없이 가입한다. 번호가 없으면 registration_pending만 허용.
  check (business_registration_number is not null or business_status = 'registration_pending'),
  check ((origin = 'backfill') = (backfilled_from_store_account_id is not null))
);

create table public.store_profile_members (
  id uuid primary key default gen_random_uuid(),
  store_profile_id uuid not null references public.store_profiles(id) on delete restrict,
  auth_user_id uuid not null references public.app_users(id) on delete restrict,
  role text not null check (role in ('owner','manager','staff')),
  status text not null default 'active' check (status in ('active','removed')),
  joined_at timestamptz not null default clock_timestamp(),
  removed_at timestamptz,
  unique (store_profile_id, id),
  check ((status = 'removed') = (removed_at is not null))
);
create unique index store_profile_one_active_owner on public.store_profile_members(store_profile_id)
  where role = 'owner' and status = 'active';
create unique index store_profile_member_active_user on public.store_profile_members(store_profile_id, auth_user_id)
  where status = 'active';
create index store_profile_members_user_idx on public.store_profile_members(auth_user_id) where status = 'active';

create table public.company_store_invite_codes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- 원문 코드는 저장하지 않는다. 서버가 정규화한 코드의 SHA-256(hex)만 저장.
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_by_key text not null check (length(created_by_key) between 1 and 200),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (company_id, id),
  check (expires_at > created_at),
  check (revoked_at is null or revoked_at >= created_at)
);
create index company_store_invite_codes_company_idx on public.company_store_invite_codes(company_id, created_at desc);

alter table public.store_accounts
  add column store_profile_id uuid references public.store_profiles(id) on delete restrict,
  add column invite_code_id uuid;
-- 같은 매장은 한 유통사와 한 번만 연결. 다른 유통사 연결은 각자 회사 범위 행이라 서로 보이지 않는다.
alter table public.store_accounts add constraint store_accounts_company_profile_uq unique (company_id, store_profile_id);
-- 다른 회사의 초대코드로 연결 기록을 남길 수 없게 회사까지 묶는다.
alter table public.store_accounts add constraint store_accounts_invite_code_fk
  foreign key (company_id, invite_code_id) references public.company_store_invite_codes(company_id, id) on delete restrict;
create index store_accounts_store_profile_idx on public.store_accounts(store_profile_id) where store_profile_id is not null;

alter table public.store_profiles enable row level security;
alter table public.store_profile_members enable row level security;
alter table public.company_store_invite_codes enable row level security;
revoke all on public.store_profiles, public.store_profile_members, public.company_store_invite_codes from public, anon, authenticated;
grant select, insert, update on public.store_profiles, public.store_profile_members, public.company_store_invite_codes to service_role;

-- 직접 가입: 매장 프로필 + 점주 구성원 1명을 한 번에 만든다.
create function public.create_store_profile_v1(
  p_auth_user_id uuid, p_store_name text, p_business_registration_number text,
  p_base_address text, p_address_detail text, p_terms_version text, p_origin text default 'direct'
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_profile uuid; v_member uuid; v_name text := btrim(coalesce(p_store_name,''));
begin
  if p_origin not in ('direct','link') then raise exception 'store_profile_origin_invalid'; end if;
  if not exists(select 1 from app_users where id = p_auth_user_id) then raise exception 'store_profile_user_missing'; end if;
  insert into store_profiles(store_name, business_registration_number, business_status, base_address, address_detail,
      origin, terms_version, terms_accepted_at)
    values(v_name, nullif(p_business_registration_number,''),
      case when nullif(p_business_registration_number,'') is null then 'registration_pending' else 'active' end,
      nullif(btrim(coalesce(p_base_address,'')),''), nullif(btrim(coalesce(p_address_detail,'')),''),
      p_origin, p_terms_version, clock_timestamp())
    returning id into v_profile;
  insert into store_profile_members(store_profile_id, auth_user_id, role) values(v_profile, p_auth_user_id, 'owner')
    returning id into v_member;
  return jsonb_build_object('storeProfileId', v_profile, 'memberId', v_member);
end $$;

-- 회사 설정에서 초대코드 발급. 서버가 원문 코드를 만들고 해시만 넘긴다.
create function public.issue_company_store_invite_code_v1(
  p_company_id uuid, p_code_hash text, p_expires_at timestamptz, p_created_by_key text
) returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  if p_expires_at <= clock_timestamp() or p_expires_at > clock_timestamp() + interval '366 days'
    then raise exception 'store_invite_code_expiry_invalid'; end if;
  insert into company_store_invite_codes(company_id, code_hash, created_by_key, expires_at)
    values(p_company_id, p_code_hash, p_created_by_key, p_expires_at) returning id into v_id;
  return v_id;
end $$;

-- 회수는 자기 회사 코드만. 이미 회수된 코드는 그대로 둔다(멱등).
create function public.revoke_company_store_invite_code_v1(p_company_id uuid, p_code_id uuid)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  update company_store_invite_codes set revoked_at = coalesce(revoked_at, clock_timestamp())
    where company_id = p_company_id and id = p_code_id;
  if not found then raise exception 'store_invite_code_not_found'; end if;
  return true;
end $$;

-- 매장이 입력한 코드 확인: 살아 있는 코드면 회사·코드 ID만 돌려준다(회사 이름·목록은 노출하지 않음).
create function public.resolve_company_store_invite_code_v1(p_code_hash text)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
  select jsonb_build_object('companyId', c.company_id, 'inviteCodeId', c.id)
    from company_store_invite_codes c
    where c.code_hash = p_code_hash and c.revoked_at is null and c.expires_at > clock_timestamp();
$$;

revoke all on function public.create_store_profile_v1(uuid,text,text,text,text,text,text) from public, anon, authenticated, service_role;
revoke all on function public.issue_company_store_invite_code_v1(uuid,text,timestamptz,text) from public, anon, authenticated, service_role;
revoke all on function public.revoke_company_store_invite_code_v1(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.resolve_company_store_invite_code_v1(text) from public, anon, authenticated, service_role;
grant execute on function public.create_store_profile_v1(uuid,text,text,text,text,text,text) to service_role;
grant execute on function public.issue_company_store_invite_code_v1(uuid,text,timestamptz,text) to service_role;
grant execute on function public.revoke_company_store_invite_code_v1(uuid,uuid) to service_role;
grant execute on function public.resolve_company_store_invite_code_v1(text) to service_role;
commit;

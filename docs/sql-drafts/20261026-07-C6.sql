-- 운영 적용 완료(2026-10-26 23:44 KST). 재실행 금지.
-- C6 권한/업무 분리 + 알바(임시) 계정 기반 스키마. 기존 데이터 UPDATE는 포함하지 않는다.
-- 운영 스키마 확인(2026-10-26): company_members/staff_invitations에는 role CHECK가 없다.
-- 다른 환경에 역할 제한 CHECK가 추가됐다면 아래 사전 점검에서 중단한다.
-- 사용자 정의 직책 문자열을 허용하는 기존 제약을 임의로 재작성하지 않는다.
begin;

do $$
declare v_check record;
begin
  for v_check in
    select c.conrelid::regclass::text as table_name, c.conname, pg_get_constraintdef(c.oid) as definition
      from pg_constraint c
     where c.conrelid in ('public.company_members'::regclass, 'public.staff_invitations'::regclass)
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ~* '\mrole\M'
       and pg_get_constraintdef(c.oid) !~* '\mpermission_role\M'
  loop
    if v_check.definition !~* 'temporary' then
      raise exception 'legacy_role_check_needs_review: %.%: %', v_check.table_name, v_check.conname, v_check.definition;
    end if;
  end loop;
end $$;

alter table public.company_members
  add column if not exists permission_role text,
  add column if not exists duties text[] not null default '{}'::text[],
  add column if not exists membership_expires_at timestamptz;

alter table public.staff_invitations
  add column if not exists permission_role text,
  add column if not exists duties text[] not null default '{}'::text[],
  add column if not exists membership_expires_at timestamptz;

do $$ begin
  alter table public.company_members add constraint company_members_permission_role_check
    check (permission_role is null or permission_role in ('owner','manager','staff','temporary'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.company_members add constraint company_members_duties_check
    check (duties <@ array['sales','delivery']::text[]);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.company_members add constraint company_members_temporary_expiry_check
    check (permission_role <> 'temporary' or membership_expires_at is not null);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.staff_invitations add constraint staff_invitations_permission_role_check
    check (permission_role is null or permission_role in ('owner','manager','staff','temporary'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.staff_invitations add constraint staff_invitations_duties_check
    check (duties <@ array['sales','delivery']::text[]);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.staff_invitations add constraint staff_invitations_temporary_expiry_check
    check (permission_role <> 'temporary' or membership_expires_at is not null);
exception when duplicate_object then null; end $$;

create index if not exists company_members_active_expiry_idx
  on public.company_members(company_id, membership_expires_at)
  where status = 'active' and membership_expires_at is not null;

create table if not exists public.staff_account_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  device_hash text not null,
  device_label text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(company_id, user_id, device_hash)
);
alter table public.staff_account_sessions enable row level security;
revoke all on public.staff_account_sessions from public, anon, authenticated;
grant all on public.staff_account_sessions to service_role;
create index if not exists staff_account_sessions_active_user_idx
  on public.staff_account_sessions(company_id, user_id, last_seen_at desc)
  where revoked_at is null;

-- 동시 활성 기기가 2대 이상이면 서버가 관리자 알림을 만들 때 쓰는 이벤트 큐입니다.
create table if not exists public.staff_security_alerts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references public.app_users(id) on delete set null,
  alert_type text not null check (alert_type in ('concurrent_devices','temporary_access_expiring','temporary_access_expired')),
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.app_users(id) on delete set null
);
alter table public.staff_security_alerts enable row level security;
revoke all on public.staff_security_alerts from public, anon, authenticated;
grant all on public.staff_security_alerts to service_role;
create index if not exists staff_security_alerts_company_created_idx
  on public.staff_security_alerts(company_id, created_at desc);

create or replace function public.update_staff_access_v2(
  p_company_id uuid,
  p_invitation_id uuid,
  p_actor_user_id uuid,
  p_actor_is_maju_admin boolean,
  p_permission_role text,
  p_duties text[],
  p_membership_expires_at timestamptz,
  p_assigned_vehicle text
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor_role text;
  v_target_user_id uuid;
  v_target_current_role text;
  v_invitation_current_role text;
begin
  if p_permission_role not in ('owner','manager','staff','temporary') then raise exception 'invalid_permission_role'; end if;
  if not (coalesce(p_duties, '{}'::text[]) <@ array['sales','delivery']::text[]) or cardinality(coalesce(p_duties, '{}'::text[])) = 0 then
    raise exception 'invalid_duties';
  end if;
  if p_permission_role = 'temporary' and p_membership_expires_at is null then raise exception 'temporary_expiry_required'; end if;

  select coalesce(permission_role, case when role in ('owner','manager') then role else 'staff' end)
    into v_actor_role from public.company_members
   where company_id = p_company_id and user_id = p_actor_user_id and status = 'active' for update;
  if not p_actor_is_maju_admin and v_actor_role not in ('owner','manager') then raise exception 'forbidden'; end if;
  if p_permission_role = 'owner' and not p_actor_is_maju_admin and v_actor_role <> 'owner' then raise exception 'owner_grant_forbidden'; end if;

  select accepted_by, case when role = 'owner' or permission_role = 'owner' then 'owner'
                           else coalesce(permission_role, case when role = 'manager' then 'manager' else 'staff' end) end
    into v_target_user_id, v_invitation_current_role from public.staff_invitations
   where id = p_invitation_id and company_id = p_company_id for update;
  if not found then raise exception 'staff_invitation_not_found'; end if;
  if v_invitation_current_role = 'owner' and not p_actor_is_maju_admin and v_actor_role <> 'owner' then
    raise exception 'owner_target_forbidden';
  end if;
  if v_target_user_id is not null then
    select case when role = 'owner' or permission_role = 'owner' then 'owner'
                else coalesce(permission_role, case when role = 'manager' then 'manager' else 'staff' end) end
      into v_target_current_role from public.company_members
     where company_id = p_company_id and user_id = v_target_user_id for update;
    if v_target_current_role = 'owner' and not p_actor_is_maju_admin and v_actor_role <> 'owner' then
      raise exception 'owner_target_forbidden';
    end if;
    if v_target_current_role = 'owner' and p_permission_role <> 'owner' and
       (select count(*) from public.company_members where company_id = p_company_id and status = 'active' and coalesce(permission_role, case when role = 'owner' then 'owner' else 'staff' end) = 'owner') <= 1
    then raise exception 'minimum_owner_required'; end if;
  end if;

  update public.staff_invitations set
    assigned_vehicle = case when 'delivery' = any(p_duties) then nullif(btrim(p_assigned_vehicle), '') else null end,
    duties = p_duties,
    membership_expires_at = case when p_permission_role = 'temporary' then p_membership_expires_at else null end,
    permission_role = p_permission_role,
    role = case p_permission_role when 'owner' then 'owner' when 'manager' then 'manager' when 'temporary' then 'temporary' else 'member' end
  where id = p_invitation_id and company_id = p_company_id;

  if v_target_user_id is not null then
    update public.company_members set
      duties = p_duties,
      membership_expires_at = case when p_permission_role = 'temporary' then p_membership_expires_at else null end,
      permission_role = p_permission_role,
      role = case p_permission_role when 'owner' then 'owner' when 'manager' then 'manager' when 'temporary' then 'temporary' else 'member' end,
      updated_at = now()
    where company_id = p_company_id and user_id = v_target_user_id;
  end if;

  insert into public.admin_audit_logs(actor_user_id, company_id, action, target_type, target_id, metadata)
  values (case when p_actor_is_maju_admin then null else p_actor_user_id end, p_company_id, 'staff_access_updated', 'staff_invitation', p_invitation_id,
    jsonb_build_object('permissionRole', p_permission_role, 'duties', p_duties, 'hasExpiry', p_membership_expires_at is not null, 'hasVehicle', nullif(btrim(p_assigned_vehicle), '') is not null));
end;
$$;
revoke all on function public.update_staff_access_v2(uuid,uuid,uuid,boolean,text,text[],timestamptz,text) from public, anon, authenticated;
grant execute on function public.update_staff_access_v2(uuid,uuid,uuid,boolean,text,text[],timestamptz,text) to service_role;

create or replace function public.sync_accepted_staff_access_v2()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.status = 'accepted' and new.accepted_by is not null then
    update public.company_members set
      duties = new.duties,
      membership_expires_at = new.membership_expires_at,
      permission_role = new.permission_role,
      role = case new.permission_role when 'owner' then 'owner' when 'manager' then 'manager' when 'temporary' then 'temporary' else role end,
      updated_at = now()
    where company_id = new.company_id and user_id = new.accepted_by;
  end if;
  return new;
end;
$$;
drop trigger if exists staff_invitations_sync_access_v2 on public.staff_invitations;
create trigger staff_invitations_sync_access_v2 after insert or update of status, accepted_by, duties, permission_role, membership_expires_at
on public.staff_invitations for each row execute function public.sync_accepted_staff_access_v2();
revoke all on function public.sync_accepted_staff_access_v2() from public, anon, authenticated;

commit;

-- 역할 변환은 docs/sql-drafts/20261026-07-C6-legacy-dry-run.sql의 읽기 전용 결과를 확인한 뒤 별도 승인.
-- 롤백(데이터 백필 전에만): 위 인덱스·제약을 제거한 뒤 추가 컬럼 3개씩 DROP.

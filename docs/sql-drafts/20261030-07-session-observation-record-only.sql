-- REVIEW ONLY. 운영 적용 및 프로덕션 DB 실행 금지.
-- 목적: 기록 전용 세션 관찰의 전역 5분 dedupe, 앱 세션 연결, 동시 기기 판정 계약 검토.
-- 비목적: staff_security_alerts 쓰기, 앱 내 알림, 자동 차단, 강제 로그아웃.
-- 선행 조건: 20261026234400_c6_staff_access_v2.sql이 적용된 PostgreSQL 16.

begin;

alter table public.staff_account_sessions
  add column if not exists session_source text,
  add column if not exists session_hash text,
  add column if not exists expires_at timestamptz;

do $$ begin
  alter table public.staff_account_sessions
    add constraint staff_account_sessions_source_check
    check (session_source is null or session_source in ('supabase_auth', 'application_cookie'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.staff_account_sessions
    add constraint staff_account_sessions_hash_check
    check ((session_source is null and session_hash is null)
      or (session_source is not null and session_hash ~ '^[0-9a-f]{64}$'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.staff_account_sessions
    add constraint staff_account_sessions_device_hash_check
    check (device_hash ~ '^[0-9a-f]{64}$') not valid;
exception when duplicate_object then null; end $$;

-- 원본 appSessionId/auth session_id는 저장하지 않고 서버 비밀값을 포함한 SHA-256 해시만 저장한다.
create unique index if not exists staff_account_sessions_session_hash_uq
  on public.staff_account_sessions(company_id, user_id, session_source, session_hash)
  where session_hash is not null;

create index if not exists staff_account_sessions_active_detection_v2_idx
  on public.staff_account_sessions(company_id, user_id, last_seen_at desc, device_hash)
  where revoked_at is null and session_hash is not null;

create or replace function public.record_staff_session_observation(
  p_company_id uuid, p_user_id uuid, p_device_hash text, p_session_source text,
  p_session_hash text, p_expires_at timestamptz
)
returns table (recorded boolean, active_device_count integer, concurrent_devices boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_recorded boolean := false;
  v_active_device_count integer := 0;
begin
  if p_company_id is null
     or p_user_id is null
     or p_device_hash is null
     or p_device_hash !~ '^[0-9a-f]{64}$'
     or p_session_hash is null
     or p_session_hash !~ '^[0-9a-f]{64}$'
     or p_session_source is null
     or p_session_source not in ('supabase_auth', 'application_cookie')
     or p_expires_at is null
     or p_expires_at <= v_now then
    raise exception using errcode = '22023', message = 'invalid session observation';
  end if;

  -- service_role은 RLS를 우회하므로 함수 안에서 회사·사용자·현재 멤버십을 다시 고정한다.
  perform 1 from public.company_members as member
   where member.company_id = p_company_id and member.user_id = p_user_id
     and member.status = 'active'
     and (coalesce(member.permission_role,
       case when member.role = 'owner' then 'owner' else 'staff' end) <> 'temporary'
       or member.membership_expires_at > v_now)
   for share;
  if not found then
    raise exception using errcode = '42501', message = 'active company membership required';
  end if;

  insert into public.staff_account_sessions as existing (
    company_id, user_id, device_hash, session_source, session_hash, expires_at,
    first_seen_at, last_seen_at, revoked_at
  ) values (
    p_company_id, p_user_id, p_device_hash, p_session_source, p_session_hash, p_expires_at,
    v_now, v_now, null
  )
  on conflict (company_id, user_id, device_hash) do update
     set session_source = excluded.session_source, session_hash = excluded.session_hash,
         expires_at = excluded.expires_at,
         first_seen_at = case when existing.session_hash is distinct from excluded.session_hash
           then excluded.first_seen_at else existing.first_seen_at end,
         last_seen_at = excluded.last_seen_at,
         revoked_at = case when existing.session_hash is distinct from excluded.session_hash
           then null else existing.revoked_at end
   where existing.session_hash is distinct from excluded.session_hash
      or (existing.revoked_at is null and existing.expires_at > v_now
        and existing.last_seen_at <= v_now - interval '5 minutes')
  returning true into v_recorded;

  -- 판정만 반환한다. 알림/차단 행은 만들지 않는다.
  select count(distinct session.device_hash)::integer into v_active_device_count
    from public.staff_account_sessions as session
   where session.company_id = p_company_id and session.user_id = p_user_id
     and session.revoked_at is null and session.session_hash is not null
     and session.expires_at > v_now
     and session.last_seen_at >= v_now - interval '15 minutes';

  return query select coalesce(v_recorded, false), v_active_device_count,
    v_active_device_count >= 2;
end;
$$;

comment on function public.record_staff_session_observation(uuid, uuid, text, text, text, timestamptz) is
  'Record-only, cross-instance 5-minute heartbeat dedupe and concurrent-device determination. No alert or blocking side effects.';

alter table public.staff_account_sessions enable row level security;
revoke all on table public.staff_account_sessions from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.staff_account_sessions to service_role;
revoke execute on function public.record_staff_session_observation(uuid, uuid, text, text, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.record_staff_session_observation(uuid, uuid, text, text, text, timestamptz)
  to service_role;

-- companies/app_users 삭제는 기존 FK의 ON DELETE CASCADE로 관찰 행을 제거한다.
-- 멤버십 비활성/만료는 활성 멤버십 검사로 즉시 기록에서 제외한다.
-- company_members 행만 삭제하는 흐름은 승인 적용본에서 같은 트랜잭션으로 관찰 행 삭제를 묶는다.
-- 레거시 device_hash 제약은 정리 후 별도 VALIDATE CONSTRAINT 단계로 검증한다.

rollback;

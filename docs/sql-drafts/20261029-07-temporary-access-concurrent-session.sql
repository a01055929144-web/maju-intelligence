-- REVIEW ONLY. 구현/운영 적용 금지.
-- 목적: 알바(임시) 만료와 동일 계정 동시 2기기 관리자 알림의 세션 식별 계약 검토.
-- 주의: 20261026234400_c6_staff_access_v2.sql은 운영 적용 기록이므로 수정하거나 재실행하지 않는다.

begin;

-- 기존 device_hash 행을 인증 세션과 연결하기 위한 확장안.
-- Supabase Auth의 session_id 또는 자체 로그인에서 서버가 발급한 app_session_id 중 하나만 저장한다.
alter table public.staff_account_sessions
  add column if not exists session_source text,
  add column if not exists auth_session_id uuid,
  add column if not exists app_session_id uuid,
  add column if not exists expires_at timestamptz;

do $$ begin
  alter table public.staff_account_sessions
    add constraint staff_account_sessions_source_check
    check (session_source in ('supabase_auth', 'application_cookie'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.staff_account_sessions
    add constraint staff_account_sessions_identity_check
    check (
      (session_source = 'supabase_auth' and auth_session_id is not null and app_session_id is null)
      or
      (session_source = 'application_cookie' and app_session_id is not null and auth_session_id is null)
    );
exception when duplicate_object then null; end $$;

create unique index if not exists staff_account_sessions_auth_session_uq
  on public.staff_account_sessions(auth_session_id)
  where auth_session_id is not null;

create unique index if not exists staff_account_sessions_app_session_uq
  on public.staff_account_sessions(app_session_id)
  where app_session_id is not null;

create index if not exists staff_account_sessions_active_detection_idx
  on public.staff_account_sessions(company_id, user_id, last_seen_at desc)
  where revoked_at is null;

-- 30분 버킷 dedupe. 서버가 date_bin('30 minutes', now(), timestamptz '2000-01-01')로 계산한다.
alter table public.staff_security_alerts
  add column if not exists dedupe_window_started_at timestamptz;

create unique index if not exists staff_security_alerts_concurrent_dedupe_uq
  on public.staff_security_alerts(company_id, user_id, alert_type, dedupe_window_started_at)
  where alert_type = 'concurrent_devices' and dedupe_window_started_at is not null;

-- exposed public schema의 테이블은 브라우저에서 직접 접근하지 못한다.
alter table public.staff_account_sessions enable row level security;
alter table public.staff_security_alerts enable row level security;
revoke all on table public.staff_account_sessions from public, anon, authenticated;
revoke all on table public.staff_security_alerts from public, anon, authenticated;
grant all on table public.staff_account_sessions to service_role;
grant all on table public.staff_security_alerts to service_role;

-- 실제 적용본에서는 기존 행 backfill/격리 전략과 NOT NULL 전환을 별도 검토한다.
-- auth.sessions 직접 참조 FK는 두지 않는다. 자체 쿠키 세션이 공존하고 auth 스키마 결합을 피하기 위함이다.
-- 임시 권한 30일 기본값은 UI만 믿지 않고 application use case/RPC가 명시적 timestamptz로 저장해야 한다.

rollback;


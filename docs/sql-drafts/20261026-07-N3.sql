-- REVIEW ONLY. 운영 적용 전 대표 승인 필요.
-- N3 민감 정보 열람 감사 로그. 값 자체(비밀번호·전화번호·사업자등록증·토큰)는 절대 저장하지 않는다.
begin;

create table if not exists public.sensitive_access_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id uuid references public.app_users(id) on delete set null,
  actor_name text not null,
  actor_role text not null,
  store_id uuid,
  store_name text,
  access_item text not null check (access_item in ('entry_password','owner_phone','business_registration','excel_export','log_hidden')),
  device_hash text,
  device_label text,
  request_path text not null,
  context jsonb not null default '{}'::jsonb,
  accessed_at timestamptz not null default now(),
  hidden_at timestamptz,
  hidden_by uuid references public.app_users(id) on delete set null
);

alter table public.sensitive_access_logs enable row level security;
revoke all on public.sensitive_access_logs from public, anon, authenticated;
grant all on public.sensitive_access_logs to service_role;

create index if not exists sensitive_access_logs_company_time_idx
  on public.sensitive_access_logs(company_id, accessed_at desc);
create index if not exists sensitive_access_logs_company_actor_idx
  on public.sensitive_access_logs(company_id, actor_user_id, accessed_at desc);
create index if not exists sensitive_access_logs_company_item_idx
  on public.sensitive_access_logs(company_id, access_item, accessed_at desc);

create or replace function public.guard_sensitive_access_log_mutation()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'sensitive_access_logs_are_append_only'; end if;
  if (to_jsonb(old) - array['hidden_at','hidden_by']) is distinct from (to_jsonb(new) - array['hidden_at','hidden_by']) then
    raise exception 'sensitive_access_logs_are_append_only';
  end if;
  if old.hidden_at is not null then raise exception 'hidden_log_is_immutable'; end if;
  return new;
end;
$$;
drop trigger if exists sensitive_access_logs_guard on public.sensitive_access_logs;
create trigger sensitive_access_logs_guard before update or delete on public.sensitive_access_logs
for each row execute function public.guard_sensitive_access_log_mutation();

revoke all on function public.guard_sensitive_access_log_mutation() from public, anon, authenticated;

commit;

-- 보존 정책: 1년. 자동 삭제 작업은 별도 승인 전 만들지 않는다.
-- 서버 구현 선행 조건: owner만 조회, MAJU 관리자 기본 403, 열람·숨김 모두 새 로그 INSERT,
-- 담당 외/근무 외/하루 20회+/내보내기 주의 판정은 원본 값 없이 context의 boolean·횟수만 저장.
-- 퇴사자 즉시 차단은 모든 인증 요청에서 company_members active/expiry 확인 + 세션·기기 토큰 폐기가 필요하다.
-- 롤백: drop trigger/function → drop table public.sensitive_access_logs (운영 로그 생성 전만 허용).

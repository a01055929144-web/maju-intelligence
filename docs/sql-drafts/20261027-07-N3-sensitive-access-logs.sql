-- N3 민감정보 열람 로그 SQL 초안. 운영 적용 전 대표 별도 승인 필요.
-- 이 파일은 저장소 초안일 뿐 마이그레이션으로 자동 적용되지 않는다.
begin;

create table if not exists public.sensitive_access_logs (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id uuid references public.app_users(id) on delete set null,
  actor_kind text not null check (actor_kind in ('app_user','legacy_owner','maju_admin','system')),
  actor_name text not null,
  actor_role text not null,
  store_id uuid,
  store_name text,
  lead_id uuid,
  lead_name text,
  item_type text not null check (item_type in ('access_password','owner_phone','business_registration','export','log_hidden')),
  device_label text,
  page_path text not null,
  warning_codes text[] not null default '{}'::text[] check (warning_codes <@ array['unassigned','outside_work_session','daily_20_plus','export']::text[]),
  target_log_id bigint,
  accessed_at timestamptz not null default now(),
  hidden_at timestamptz,
  hidden_by uuid references public.app_users(id) on delete set null,
  hidden_by_actor_kind text check (hidden_by_actor_kind is null or hidden_by_actor_kind in ('app_user','legacy_owner')),
  hidden_by_name text,
  constraint sensitive_access_logs_company_id_id_uq unique(company_id, id),
  constraint sensitive_access_logs_store_fk foreign key(company_id, store_id)
    references public.normalized_customers(company_id, id) on delete set null (store_id),
  constraint sensitive_access_logs_lead_fk foreign key(company_id, lead_id)
    references public.business_permit_leads(company_id, id) on delete set null (lead_id),
  constraint sensitive_access_logs_target_fk foreign key(company_id, target_log_id)
    references public.sensitive_access_logs(company_id, id) on delete cascade,
  constraint sensitive_access_logs_single_subject_check check (not (store_id is not null and lead_id is not null)),
  constraint sensitive_access_logs_hidden_actor_check check (
    (hidden_at is null and hidden_by is null and hidden_by_actor_kind is null and hidden_by_name is null)
    or (hidden_at is not null and hidden_by_actor_kind is not null and hidden_by_name is not null)
  )
);

alter table public.sensitive_access_logs enable row level security;
revoke all on table public.sensitive_access_logs from public, anon, authenticated;
revoke all on sequence public.sensitive_access_logs_id_seq from public, anon, authenticated;
grant select, insert, update on table public.sensitive_access_logs to service_role;
grant usage, select on sequence public.sensitive_access_logs_id_seq to service_role;

create index if not exists sensitive_access_logs_company_time_idx on public.sensitive_access_logs(company_id, accessed_at desc);
create index if not exists sensitive_access_logs_company_actor_time_idx on public.sensitive_access_logs(company_id, actor_user_id, accessed_at desc);
create index if not exists sensitive_access_logs_company_item_time_idx on public.sensitive_access_logs(company_id, item_type, accessed_at desc);
create index if not exists sensitive_access_logs_company_lead_time_idx on public.sensitive_access_logs(company_id, lead_id, accessed_at desc) where lead_id is not null;
create index if not exists sensitive_access_logs_warning_codes_idx on public.sensitive_access_logs using gin(warning_codes);

create or replace function public.guard_sensitive_access_logs()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.actor_kind = 'app_user' and new.actor_user_id is null then
      raise exception 'sensitive_access_logs_app_user_required';
    end if;
    if new.hidden_by_actor_kind = 'app_user' and new.hidden_by is null then
      raise exception 'sensitive_access_logs_hidden_app_user_required';
    end if;
    return new;
  end if;

  if row(old.company_id, old.actor_kind, old.actor_name, old.actor_role, old.store_name, old.lead_name, old.item_type, old.device_label, old.page_path, old.warning_codes, old.target_log_id, old.accessed_at)
     is distinct from row(new.company_id, new.actor_kind, new.actor_name, new.actor_role, new.store_name, new.lead_name, new.item_type, new.device_label, new.page_path, new.warning_codes, new.target_log_id, new.accessed_at)
  then raise exception 'sensitive_access_logs_immutable'; end if;

  -- 참조 대상 삭제가 중첩 실행한 FK SET NULL만 허용한다. 일반 UPDATE로 ID를 지우는 우회는 막는다.
  if old.actor_user_id is distinct from new.actor_user_id
     and not (pg_trigger_depth() > 1 and old.actor_user_id is not null and new.actor_user_id is null)
  then raise exception 'sensitive_access_logs_immutable'; end if;
  if old.hidden_by is distinct from new.hidden_by
     and not (pg_trigger_depth() > 1 and old.hidden_by is not null and new.hidden_by is null)
  then raise exception 'sensitive_access_logs_immutable'; end if;
  if old.store_id is distinct from new.store_id
     and not (pg_trigger_depth() > 1 and old.store_id is not null and new.store_id is null)
  then raise exception 'sensitive_access_logs_immutable'; end if;
  if old.lead_id is distinct from new.lead_id
     and not (pg_trigger_depth() > 1 and old.lead_id is not null and new.lead_id is null)
  then raise exception 'sensitive_access_logs_immutable'; end if;

  -- FK SET NULL만 일어난 경우에는 새 숨김 감사 행을 만들지 않는다.
  if row(old.hidden_at, old.hidden_by_actor_kind, old.hidden_by_name)
     is not distinct from row(new.hidden_at, new.hidden_by_actor_kind, new.hidden_by_name)
  then return new; end if;

  if old.hidden_at is not null or new.hidden_at is null or new.hidden_by_actor_kind is null or new.hidden_by_name is null
     or (new.hidden_by_actor_kind = 'app_user' and new.hidden_by is null)
  then
    raise exception 'sensitive_access_logs_invalid_hide';
  end if;
  insert into public.sensitive_access_logs(company_id, actor_user_id, actor_kind, actor_name, actor_role, item_type, page_path, target_log_id)
  values (new.company_id, new.hidden_by, new.hidden_by_actor_kind, new.hidden_by_name, 'owner', 'log_hidden', '/dashboard/settings/security', new.id);
  return new;
end;
$$;

drop trigger if exists sensitive_access_logs_guard on public.sensitive_access_logs;
create trigger sensitive_access_logs_guard before insert or update on public.sensitive_access_logs for each row execute function public.guard_sensitive_access_logs();
revoke all on function public.guard_sensitive_access_logs() from public, anon, authenticated, service_role;

commit;

-- 승인·적용 후에만 SENSITIVE_ACCESS_LOGS_ENABLED=true로 전환한다.
-- DELETE 권한은 부여하지 않아 API 직접 삭제를 막되, 회사 FK cascade와 postgres 전용 보관 삭제는 트리거로 막지 않는다.
-- 1년 보관 삭제는 별도 postgres 전용 유지관리 함수/스케줄로 작성해 따로 승인한다.
-- 열람 값, 마스킹 값, 토큰, 비밀번호를 저장할 자유형 metadata/payload 컬럼은 의도적으로 두지 않는다.
-- actor_user_id가 없는 기존 대표 로그인은 actor_kind='legacy_owner', actor_user_id=null로 기록한다.
-- app_users 삭제 시 actor_user_id/hidden_by만 null이 되고 이름·역할·행위 스냅샷은 유지된다.
-- 거래처/리드 삭제 시 store_id/lead_id만 null이 되고 store_name/lead_name 스냅샷은 유지된다.
-- 사장님 휴대폰이 기존 거래처가 아닌 리드에서 열렸다면 lead_id를 사용하고 store_id는 비워 둔다.

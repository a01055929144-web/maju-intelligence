-- SQL 초안 전용. 운영 적용 금지. 승인 후 별도 migration으로 승격한다.
-- NEXT_PUBLIC_STORE_REVISION_HISTORY_ENABLED는 이 초안만으로 켜지 않는다.
--
-- 역할 경계:
-- - admin_audit_logs: 관리자 작업 단위 감사 로그(유지)
-- - lead_field_value_changes: 회사별 사용자 정의 리드 칸 변경(유지)
-- - common_revision_history: 리드·거래처 공통 칸의 이전/이후 값 표시 전용(이 초안)

begin;

create table if not exists public.common_revision_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  target_type text not null,
  target_id uuid not null,
  field_key text not null,
  old_value jsonb,
  new_value jsonb,
  actor_user_id uuid references public.app_users(id) on delete set null,
  actor_name text not null,
  actor_role text not null,
  source_path text not null,
  created_at timestamptz not null default now(),
  constraint common_revision_history_target_type_check
    check (target_type in ('lead', 'customer')),
  constraint common_revision_history_field_key_check
    check (char_length(btrim(field_key)) between 1 and 120),
  constraint common_revision_history_field_allowlist_check
    check (field_key in (
      'business_name',
      'business_number',
      'representative_name',
      'phone',
      'address',
      'lead_stage',
      'sales_status',
      'next_action_at',
      'important_note',
      'loading_location',
      'assigned_member_id',
      'assigned_vehicle_id',
      'photo_added',
      'photo_removed',
      'delivery_status',
      'delivery_completed_at',
      'delivery_shared',
      'excluded'
    )),
  constraint common_revision_history_actor_name_check
    check (char_length(btrim(actor_name)) between 1 and 120),
  constraint common_revision_history_actor_role_check
    check (char_length(btrim(actor_role)) between 1 and 60),
  constraint common_revision_history_source_path_check
    check (source_path in ('pc', 'mobile', 'admin', 'automation')),
  constraint common_revision_history_value_changed_check
    check (old_value is distinct from new_value),
  constraint common_revision_history_value_size_check
    check (
      coalesce(octet_length(old_value::text), 0) <= 65536
      and coalesce(octet_length(new_value::text), 0) <= 65536
    )
);

comment on table public.common_revision_history is
  '승인 전 SQL 초안: 리드·거래처 공통 칸 변경 이력. 추가 전용이며 비밀번호·토큰·자격증명 값 저장 금지.';
comment on column public.common_revision_history.actor_name is
  '사용자 삭제 후에도 표시할 당시 이름 스냅샷. 자동 작업은 시스템 이름을 기록한다.';
comment on column public.common_revision_history.actor_role is
  '변경 당시 권한 스냅샷. 현재 company_members 역할과 달라질 수 있다.';
comment on column public.common_revision_history.source_path is
  '변경 진입 경로: pc, mobile, admin, automation.';
comment on column public.common_revision_history.field_key is
  '명시적 allow-list만 기록한다. 신규 컬럼은 이 제약을 승인 변경하기 전까지 기본 미기록한다.';
comment on column public.common_revision_history.old_value is
  '사진 변경은 첨부 ID 등 비민감 식별자만 저장하며 URL·저장 경로·서명 값은 저장하지 않는다.';
comment on column public.common_revision_history.new_value is
  '사진 변경은 첨부 ID 등 비민감 식별자만 저장하며 URL·저장 경로·서명 값은 저장하지 않는다.';

create index if not exists common_revision_history_target_time_idx
  on public.common_revision_history(company_id, target_type, target_id, created_at desc, id);

create index if not exists common_revision_history_company_time_idx
  on public.common_revision_history(company_id, created_at desc, id);

-- JSON 배열·객체 안쪽의 키까지 검사해 자격증명이 우회 저장되는 것을 막는다.
create or replace function public.revision_json_contains_sensitive_key(p_value jsonb)
returns boolean
language plpgsql
immutable
strict
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_key text;
  v_child jsonb;
begin
  if jsonb_typeof(p_value) = 'object' then
    for v_key, v_child in select key, value from jsonb_each(p_value)
    loop
      if lower(v_key) ~ '(password|passcode|token|secret|credential|authorization|cookie|api[_-]?key|private[_-]?key|access[_-]?key|refresh[_-]?token|door[_-]?(code|pin)|entrance[_-]?(code|pin)|url|uri|storage[_-]?path|signed[_-]?url|download[_-]?url)'
        or public.revision_json_contains_sensitive_key(v_child) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_child in select value from jsonb_array_elements(p_value)
    loop
      if public.revision_json_contains_sensitive_key(v_child) then
        return true;
      end if;
    end loop;
  end if;

  return false;
end;
$$;

revoke all on function public.revision_json_contains_sensitive_key(jsonb) from public, anon, authenticated;
grant execute on function public.revision_json_contains_sensitive_key(jsonb) to service_role;

create or replace function public.guard_common_revision_history()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'common_revision_history is append-only';
  end if;

  new.field_key := btrim(new.field_key);
  new.actor_name := btrim(new.actor_name);
  new.actor_role := btrim(new.actor_role);

  if lower(new.field_key) ~ '(password|passcode|token|secret|credential|authorization|cookie|api[_-]?key|private[_-]?key|access[_-]?key|refresh[_-]?token|door[_-]?(code|pin)|entrance[_-]?(code|pin)|url|uri|storage[_-]?path|signed[_-]?url|download[_-]?url)'
    or coalesce(public.revision_json_contains_sensitive_key(new.old_value), false)
    or coalesce(public.revision_json_contains_sensitive_key(new.new_value), false)
    or coalesce(new.old_value::text ~* '(https?://|storage/v1/object|[?&](token|signature|expires)=)', false)
    or coalesce(new.new_value::text ~* '(https?://|storage/v1/object|[?&](token|signature|expires)=)', false) then
    raise exception 'sensitive credential values must not be recorded';
  end if;

  if new.target_type = 'lead' and not exists (
    select 1
    from public.business_permit_leads lead
    where lead.company_id = new.company_id
      and lead.id = new.target_id
  ) then
    raise exception 'lead target does not belong to company';
  elsif new.target_type = 'customer' and not exists (
    select 1
    from public.normalized_customers customer
    where customer.company_id = new.company_id
      and customer.id = new.target_id
  ) then
    raise exception 'customer target does not belong to company';
  end if;

  if new.actor_user_id is not null
    and not exists (
      select 1
      from public.company_members member
      where member.company_id = new.company_id
        and member.user_id = new.actor_user_id
        and member.status = 'active'
    )
    and not (
      new.source_path = 'admin'
      and exists (
        select 1
        from public.app_users app_user
        where app_user.id = new.actor_user_id
          and app_user.status = 'active'
          and app_user.role in ('super_admin', 'maju_super_admin', 'maju_operator', 'operator')
      )
    ) then
    raise exception 'actor is not an active company member or platform admin';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_common_revision_history() from public, anon, authenticated;
grant execute on function public.guard_common_revision_history() to service_role;

drop trigger if exists common_revision_history_guard on public.common_revision_history;
create trigger common_revision_history_guard
before insert or update or delete on public.common_revision_history
for each row execute function public.guard_common_revision_history();

alter table public.common_revision_history enable row level security;
alter table public.common_revision_history force row level security;

-- 이 프로젝트는 자체 앱 세션을 사용하므로 auth.uid()와 app_users.id의 동일성을 가정하지 않는다.
-- 승인된 서버 API가 회사·권한을 확인한 뒤 service_role로만 접근한다. 정책이 없는 RLS는
-- anon/authenticated에 기본 거부로 동작하며, 아래 권한 회수로 Data API 직접 접근도 차단한다.
revoke all on table public.common_revision_history from public, anon, authenticated;
grant select, insert on table public.common_revision_history to service_role;

commit;

-- 승인 후 검증 항목:
-- 1) 다른 company_id의 lead/customer target_id 삽입 거부
-- 2) 비밀번호·토큰 필드명 및 중첩 JSON 키 삽입 거부
-- 3) update/delete 거부와 service_role select/insert만 허용
-- 4) EXPLAIN으로 회사+대상+시각 조회가 common_revision_history_target_time_idx 사용
-- 5) UI/API 연결 전 NEXT_PUBLIC_STORE_REVISION_HISTORY_ENABLED는 계속 false 유지
-- 6) 개인정보 보존·삭제 정책 승인: actor_name 스냅샷, phone/address 이전값의 보존 기간,
--    회사 탈퇴·폐업·정보주체 삭제 요청 시 익명화 또는 파기 방식과 법정 보존 예외를 결정한다.
-- 7) 신규 추적 필드는 민감도 검토 후 common_revision_history_field_allowlist_check를
--    별도 승인 SQL로 변경한다. 앱 컬럼 추가만으로 자동 기록하지 않는다.


-- 검토 전용 SQL 초안. 운영 DB 적용 금지. migration 파일이 아니다.
-- LEAD_CUSTOMER_CONTINUITY_ENABLED=false를 유지한다.
-- 선행 조건: common_revision_history 초안이 별도 승인 후 migration으로 승격·적용되어 있어야 한다.
-- 기준안: 공통 매장 ID를 새로 만들지 않고 기존 matched_customer_id를 회사 범위 연결로 사용한다.
-- 이 파일만 단독 실행하지 않는다.

begin;

-- 운영 대조(2026-10-30): 이 초안은 common_revision_history 선행 초안이 적용된 뒤에만 실행한다.
-- 운영 대상은 PostgreSQL 17.6이며, 아래 복합 FK의 SET NULL 열 목록은 PostgreSQL 15+ 문법이다.
do $$
declare
  v_missing text[];
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'postgresql_15_or_newer_required';
  end if;

  if to_regclass('public.common_revision_history') is null then
    raise exception 'common_revision_history_prerequisite_not_applied';
  end if;

  select array_agg(required.column_name order by required.column_name)
    into v_missing
  from (values
    ('company_id'), ('target_type'), ('target_id'), ('field_key'),
    ('old_value'), ('new_value'), ('created_at')
  ) required(column_name)
  where not exists (
    select 1
    from information_schema.columns existing
    where existing.table_schema = 'public'
      and existing.table_name = 'common_revision_history'
      and existing.column_name = required.column_name
  );

  if v_missing is not null then
    raise exception 'common_revision_history_prerequisite_columns_missing: %', array_to_string(v_missing, ',');
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.normalized_customers'::regclass
      and constraint_row.contype in ('p', 'u')
      and (
        select array_agg(attribute_row.attname order by key_row.ordinality)
        from unnest(constraint_row.conkey) with ordinality key_row(attnum, ordinality)
        join pg_attribute attribute_row
          on attribute_row.attrelid = constraint_row.conrelid
         and attribute_row.attnum = key_row.attnum
      ) = array['company_id', 'id']::name[]
  ) then
    raise exception 'normalized_customers_company_id_id_candidate_key_required';
  end if;
end $$;

-- 거래처 상세에 필요한 채널 칸. business_hours는 기존 컬럼을 그대로 사용한다.
alter table public.normalized_customers
  add column if not exists fax text,
  add column if not exists instagram_url text,
  add column if not exists naver_talktalk_url text,
  add column if not exists contact_channels_updated_at timestamptz;

comment on column public.normalized_customers.fax is '거래처 팩스. 리드 전환 시 기존 값이 비어 있을 때만 숫자 중심 정규화 값으로 이어받는다.';
comment on column public.normalized_customers.instagram_url is '확인된 인스타그램 프로필 URL. 리드 전환 시 기존 값을 덮어쓰지 않는다.';
comment on column public.normalized_customers.naver_talktalk_url is '확인된 네이버 톡톡 URL. 리드 전환 시 기존 값을 덮어쓰지 않는다.';

-- 기존 matched_customer_id 단일 FK는 대상 존재만 보장한다. 회사 경계는 복합 FK로 DB에서도 강제한다.
create index if not exists business_permit_leads_company_matched_customer_idx
  on public.business_permit_leads(company_id, matched_customer_id)
  where matched_customer_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.business_permit_leads'::regclass
      and conname = 'business_permit_leads_company_matched_customer_fk'
  ) then
    alter table public.business_permit_leads
      add constraint business_permit_leads_company_matched_customer_fk
      foreign key (company_id, matched_customer_id)
      references public.normalized_customers(company_id, id)
      on delete set null (matched_customer_id)
      not valid;
  end if;
end $$;

-- 적용 승인 시점의 기존 행까지 회사 경계가 맞아야 통과한다. 실패하면 데이터 보정 승인부터 별도로 받는다.
alter table public.business_permit_leads
  validate constraint business_permit_leads_company_matched_customer_fk;

-- 앱은 계속 append-only다. 내부 보존 작업만 원문을 익명화할 수 있도록 상태 칸을 둔다.
alter table public.common_revision_history
  add column if not exists redacted_at timestamptz,
  add column if not exists redaction_reason text;

alter table public.common_revision_history
  drop constraint if exists common_revision_history_redaction_reason_check;
alter table public.common_revision_history
  add constraint common_revision_history_redaction_reason_check
  check (redaction_reason is null or redaction_reason in ('retention_expired', 'data_subject_request'));

-- 익명화 뒤에는 old/new가 같은 redacted 표식이 되므로 기존 변경값 제약에 예외를 둔다.
alter table public.common_revision_history
  drop constraint if exists common_revision_history_value_changed_check;
alter table public.common_revision_history
  add constraint common_revision_history_value_changed_check
  check (redacted_at is not null or old_value is distinct from new_value);

create schema if not exists maju_private;
revoke all on schema maju_private from public, anon, authenticated, service_role;

-- contact-channels.ts의 숫자 정규화 뒤 모바일 판정과 같은 경계를 SQL 보존 작업에서도 사용한다.
-- 현재 앱 helper가 인정하는 010 및 앞자리 0이 빠진 10자리 휴대폰을 true로 본다.
create or replace function maju_private.revision_json_is_mobile_phone(p_value jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  select regexp_replace(trim(both '"' from coalesce(p_value::text, '')), '[^0-9]', '', 'g')
    ~ '^(010[0-9]{8}|10[0-9]{8})$';
$$;

revoke all on function maju_private.revision_json_is_mobile_phone(jsonb) from public, anon, authenticated, service_role;

create table if not exists maju_private.customer_revision_redaction_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null,
  approved_by_user_id uuid references public.app_users(id) on delete set null,
  approver_role text not null check (approver_role in ('owner', 'manager')),
  reason_code text not null check (reason_code in ('data_subject_request', 'store_self_request', 'legal_obligation', 'correction')),
  included_mobile_phone boolean not null default false,
  redacted_row_count integer not null check (redacted_row_count >= 0),
  approved_at timestamptz not null default clock_timestamp()
);

create index if not exists customer_revision_redaction_audit_lookup_idx
  on maju_private.customer_revision_redaction_audit(company_id, customer_id, approved_at desc);

revoke all on table maju_private.customer_revision_redaction_audit from public, anon, authenticated, service_role;

-- 90일 경과 전화·주소 원문 익명화. 앱 역할에는 실행 권한을 주지 않는다.
create or replace function maju_private.redact_expired_customer_revision_values(
  p_now timestamptz default clock_timestamp(),
  p_company_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  update public.common_revision_history history
  set old_value = jsonb_build_object('redacted', true),
      new_value = jsonb_build_object('redacted', true),
      redacted_at = p_now,
      redaction_reason = 'retention_expired'
  where history.target_type = 'customer'
    and history.field_key in ('phone', 'address')
    and history.redacted_at is null
    and history.created_at < p_now - interval '90 days'
    and (
      history.field_key = 'address'
      or (
        history.field_key = 'phone'
        and not maju_private.revision_json_is_mobile_phone(history.old_value)
        and not maju_private.revision_json_is_mobile_phone(history.new_value)
      )
    )
    and (p_company_id is null or history.company_id = p_company_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 검증된 삭제 요청의 즉시 익명화. 대상 UUID·회사 범위는 남겨 감사 연속성을 보존한다.
create or replace function maju_private.anonymize_customer_revision_values_for_request(
  p_company_id uuid,
  p_customer_id uuid,
  p_approved_by_user_id uuid,
  p_reason_code text,
  p_store_self_request boolean default false,
  p_now timestamptz default clock_timestamp()
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
  v_approver_role text;
begin
  if p_company_id is null or p_customer_id is null or p_approved_by_user_id is null then
    raise exception 'company_customer_and_approver_required';
  end if;

  if p_reason_code not in ('data_subject_request', 'store_self_request', 'legal_obligation', 'correction') then
    raise exception 'approved_reason_code_required';
  end if;

  select coalesce(
    member.permission_role,
    case when member.role in ('owner', 'manager') then member.role else 'staff' end
  ) into v_approver_role
  from public.company_members member
  where member.company_id = p_company_id
    and member.user_id = p_approved_by_user_id
    and member.status = 'active'
    and (member.membership_expires_at is null or member.membership_expires_at > p_now)
  limit 1;
  if v_approver_role is null or v_approver_role not in ('owner', 'manager') then
    raise insufficient_privilege using message = 'owner_or_manager_required';
  end if;

  if p_store_self_request is distinct from (p_reason_code = 'store_self_request') then
    raise exception 'store_self_request_scope_mismatch';
  end if;

  update public.common_revision_history history
  set old_value = jsonb_build_object('redacted', true),
      new_value = jsonb_build_object('redacted', true),
      redacted_at = p_now,
      redaction_reason = 'data_subject_request'
  where history.company_id = p_company_id
    and history.target_type = 'customer'
    and history.target_id = p_customer_id
    and history.field_key in ('phone', 'address')
    and history.redacted_at is null
    and (
      history.field_key = 'address'
      or p_store_self_request
      or (
        not maju_private.revision_json_is_mobile_phone(history.old_value)
        and not maju_private.revision_json_is_mobile_phone(history.new_value)
      )
    );
  get diagnostics v_count = row_count;

  insert into maju_private.customer_revision_redaction_audit (
    company_id, customer_id, approved_by_user_id, approver_role, reason_code,
    included_mobile_phone, redacted_row_count, approved_at
  ) values (
    p_company_id, p_customer_id, p_approved_by_user_id, v_approver_role, p_reason_code,
    p_store_self_request, v_count, p_now
  );
  return v_count;
end;
$$;

revoke all on function maju_private.redact_expired_customer_revision_values(timestamptz, uuid) from public, anon, authenticated, service_role;
revoke all on function maju_private.anonymize_customer_revision_values_for_request(uuid, uuid, uuid, text, boolean, timestamptz) from public, anon, authenticated, service_role;
-- service_role에는 의도적으로 실행권한을 주지 않는다. 승인자 UUID를 인자로 받으므로 일반 서버 호출자가
-- 다른 owner/manager UUID를 넣어 승인을 가장할 수 있다. 별도 운영자 자격으로 승인된 내부 작업만 실행한다.
do $$
declare
  v_operator_oid oid;
  v_operator_can_login boolean;
begin
  select oid, rolcanlogin
    into v_operator_oid, v_operator_can_login
  from pg_roles
  where rolname = 'maju_revision_redaction_operator';

  if v_operator_oid is null then
    create role maju_revision_redaction_operator nologin;
  elsif v_operator_can_login then
    raise exception 'maju_revision_redaction_operator_must_be_nologin';
  elsif exists (
    select 1 from pg_auth_members membership
    where membership.roleid = v_operator_oid
  ) then
    raise exception 'maju_revision_redaction_operator_must_have_no_members';
  end if;
end $$;
grant usage on schema maju_private to maju_revision_redaction_operator;
grant execute on function maju_private.anonymize_customer_revision_values_for_request(uuid, uuid, uuid, text, boolean, timestamptz) to maju_revision_redaction_operator;

-- 전환 UI는 기존 requestPermitLeadConversion을 재사용한다. 서버 플래그가 true인 경로만 이 함수를 호출한다.
-- 새 거래처/기존 거래처의 현재 값을 우선하고 비어 있는 칸만 리드에서 채운다.
create or replace function public.apply_lead_customer_continuity_draft(
  p_company_id uuid,
  p_lead_id uuid,
  p_customer_id uuid,
  p_rollout_enabled boolean default false
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_lead public.business_permit_leads%rowtype;
  v_hours text;
  v_fax text;
  v_instagram_handle text;
  v_instagram_match text[];
  v_instagram_url text;
  v_talktalk_id text;
  v_talktalk_match text[];
  v_talktalk_url text;
begin
  if not p_rollout_enabled then
    raise exception 'lead_customer_continuity_disabled';
  end if;

  select * into v_lead
  from public.business_permit_leads lead
  where lead.company_id = p_company_id
    and lead.id = p_lead_id
    and lead.merged_into_lead_id is null
  for update;
  if not found then raise exception 'company_scoped_lead_not_found'; end if;

  perform 1
  from public.normalized_customers customer
  where customer.company_id = p_company_id and customer.id = p_customer_id
  for update;
  if not found then raise exception 'company_scoped_customer_not_found'; end if;

  select string_agg(
    case when hours.is_closed then hours.weekday::text || ':휴무'
         else hours.weekday::text || ':' || to_char(hours.opens_at, 'HH24:MI') || '-' || to_char(hours.closes_at, 'HH24:MI') end,
    ', ' order by hours.weekday, hours.interval_index
  ) into v_hours
  from public.lead_business_hour_intervals hours
  where hours.company_id = p_company_id and hours.lead_id = p_lead_id and hours.source = 'manual';

  -- domains/lead/contact-channels.ts의 정규화·허용 규칙과 동등하게 맞춘다.
  v_fax := nullif(regexp_replace(coalesce(v_lead.fax, ''), '[^0-9]', '', 'g'), '');
  if v_fax is not null
    and v_fax !~ '^(0[0-9]{8,10}|1[568][0-9]{6})$'
  then
    v_fax := null;
  end if;

  v_instagram_match := regexp_match(
    btrim(coalesce(v_lead.instagram_url, '')),
    '^(https?://)?(www\.)?instagram\.com/([A-Za-z0-9._]{1,30})([/?#].*)?$',
    'i'
  );
  v_instagram_handle := coalesce(
    v_instagram_match[3],
    substring(btrim(coalesce(v_lead.instagram_url, '')) from '^@?([A-Za-z0-9._]{1,30})/?$')
  );
  if lower(coalesce(v_instagram_handle, '')) in ('p', 'reel', 'explore', 'accounts', 'stories') then
    v_instagram_handle := null;
  end if;
  v_instagram_url := case when v_instagram_handle is not null
    then 'https://www.instagram.com/' || v_instagram_handle || '/'
    else null end;

  v_talktalk_match := regexp_match(
    btrim(coalesce(v_lead.naver_talktalk_url, '')),
    '^(https?://)?(m\.)?talk\.naver\.com/(ct/)?([A-Za-z0-9_-]{3,64})([/?#].*)?$',
    'i'
  );
  v_talktalk_id := coalesce(
    v_talktalk_match[4],
    substring(btrim(coalesce(v_lead.naver_talktalk_url, '')) from '^([A-Za-z0-9_-]{3,64})$')
  );
  v_talktalk_url := case when v_talktalk_id is not null
    then 'https://talk.naver.com/ct/' || v_talktalk_id
    else null end;

  update public.normalized_customers customer
  set representative_name = coalesce(nullif(customer.representative_name, ''), nullif(v_lead.representative_name, '')),
      address = coalesce(nullif(customer.address, ''), nullif(v_lead.address, '')),
      phone = coalesce(nullif(customer.phone, ''), nullif(regexp_replace(v_lead.phone, '[^0-9]', '', 'g'), '')),
      email = coalesce(nullif(customer.email, ''), nullif(lower(btrim(v_lead.email)), '')),
      industry = coalesce(nullif(customer.industry, ''), nullif(v_lead.industry_primary, '')),
      opening_date = coalesce(customer.opening_date, v_lead.open_date),
      naver_place_url = coalesce(nullif(customer.naver_place_url, ''), nullif(btrim(v_lead.naver_place_url), '')),
      kakao_place_url = coalesce(nullif(customer.kakao_place_url, ''), nullif(btrim(v_lead.kakao_place_url), '')),
      google_map_url = coalesce(nullif(customer.google_map_url, ''), nullif(btrim(v_lead.google_place_url), '')),
      fax = coalesce(nullif(customer.fax, ''), v_fax),
      instagram_url = coalesce(nullif(customer.instagram_url, ''), v_instagram_url),
      naver_talktalk_url = coalesce(nullif(customer.naver_talktalk_url, ''), v_talktalk_url),
      business_hours = coalesce(nullif(customer.business_hours, ''), nullif(v_hours, '')),
      contact_channels_updated_at = case
        when (nullif(customer.fax, '') is null and v_fax is not null)
          or (nullif(customer.instagram_url, '') is null and v_instagram_url is not null)
          or (nullif(customer.naver_talktalk_url, '') is null and v_talktalk_url is not null)
          then clock_timestamp()
        else customer.contact_channels_updated_at
      end
  where customer.company_id = p_company_id and customer.id = p_customer_id;

  update public.business_permit_leads lead
  set matched_customer_id = p_customer_id,
      matched_customer_at = clock_timestamp(),
      matched_customer_method = coalesce(lead.matched_customer_method, 'conversion'),
      matched_customer_confidence = coalesce(lead.matched_customer_confidence, 100),
      status = '거래처 전환',
      updated_at = clock_timestamp()
  where lead.company_id = p_company_id and lead.id = p_lead_id;

  -- lead_actions와 company_do_not_contact는 복사·수정하지 않는다.
end;
$$;

revoke all on function public.apply_lead_customer_continuity_draft(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.apply_lead_customer_continuity_draft(uuid, uuid, uuid, boolean) to service_role;

-- 거래처 상세 영업 기록: 원본 lead_actions를 matched_customer_id로 읽는다.
create or replace view public.customer_linked_lead_actions_v1
with (security_invoker = true)
as
select
  lead.company_id,
  lead.matched_customer_id as customer_id,
  lead.id as lead_id,
  lead.source as lead_source,
  lead.matched_customer_method,
  lead.matched_customer_confidence,
  action.id as action_id,
  action.action_type,
  action.result,
  action.memo,
  action.actor_name,
  action.created_at
from public.business_permit_leads lead
join public.lead_actions action
  on action.company_id = lead.company_id and action.lead_id = lead.id
where lead.matched_customer_id is not null;

-- DNC는 거래처 상세에서 읽기만 한다. 등록·해제는 기존 lead 소유 경로만 사용한다.
create or replace view public.customer_linked_lead_dnc_v1
with (security_invoker = true)
as
select
  lead.company_id,
  lead.matched_customer_id as customer_id,
  lead.id as lead_id,
  dnc.id as dnc_id,
  dnc.channel,
  dnc.reason,
  dnc.blocked_at
from public.business_permit_leads lead
join public.company_do_not_contact dnc
  on dnc.company_id = lead.company_id and dnc.source_lead_id = lead.id
where lead.matched_customer_id is not null and dnc.released_at is null;

-- 칸별 출처도 원본 lead_contact_field_sources를 연결해 읽으며 거래처 쪽으로 복사하지 않는다.
create or replace view public.customer_linked_lead_contact_sources_v1
with (security_invoker = true)
as
select
  lead.company_id,
  lead.matched_customer_id as customer_id,
  lead.id as lead_id,
  source.id as source_id,
  source.field_name,
  source.source_type,
  source.source_reference,
  source.collected_at
from public.business_permit_leads lead
join public.lead_contact_field_sources source
  on source.company_id = lead.company_id and source.lead_id = lead.id
where lead.matched_customer_id is not null;

revoke all on public.customer_linked_lead_actions_v1 from public, anon, authenticated;
revoke all on public.customer_linked_lead_dnc_v1 from public, anon, authenticated;
revoke all on public.customer_linked_lead_contact_sources_v1 from public, anon, authenticated;
grant select on public.customer_linked_lead_actions_v1 to service_role;
grant select on public.customer_linked_lead_dnc_v1 to service_role;
grant select on public.customer_linked_lead_contact_sources_v1 to service_role;

commit;

-- 승인 전 검증 항목:
-- 1) 다른 company_id의 lead/customer 연결 거부
-- 2) 기존 거래처 값 보존, 빈 칸만 정규화해 이어받기
-- 3) lead_actions 및 company_do_not_contact 행 수·내용 무변경
-- 4) DNC view SELECT만 허용되고 쓰기 권한 없음
-- 5) 전화·주소 90일 익명화와 삭제 요청 즉시 익명화
-- 6) LEAD_CUSTOMER_CONTINUITY_ENABLED=false에서는 기존 전환 경로 유지

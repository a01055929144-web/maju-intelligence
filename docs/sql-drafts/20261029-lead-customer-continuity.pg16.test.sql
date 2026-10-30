\set ON_ERROR_STOP on

-- 로컬 PostgreSQL 16+ 실행 테스트. 운영 DB 실행 금지. 운영 적용 전 PostgreSQL 17에서도 재실행한다.
create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create table public.companies (id uuid primary key);
create table public.app_users (id uuid primary key);
create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  user_id uuid references public.app_users(id) on delete set null,
  role text not null,
  permission_role text,
  status text not null,
  membership_expires_at timestamptz
);
create table public.normalized_customers (
  id uuid primary key,
  company_id uuid not null references public.companies(id),
  representative_name text,
  address text,
  phone text,
  email text,
  industry text,
  opening_date date,
  naver_place_url text,
  kakao_place_url text,
  google_map_url text,
  business_hours text,
  -- 운영 migration과 이름이 달라도 초안은 실제 후보키 컬럼 순서로 인식해야 한다.
  constraint fixture_customer_company_id_unique unique (company_id, id)
);
create table public.business_permit_leads (
  id uuid primary key,
  company_id uuid not null references public.companies(id),
  merged_into_lead_id uuid,
  representative_name text,
  address text,
  phone text,
  email text,
  industry_primary text,
  open_date date,
  naver_place_url text,
  kakao_place_url text,
  google_place_url text,
  fax text,
  instagram_url text,
  naver_talktalk_url text,
  matched_customer_id uuid,
  matched_customer_at timestamptz,
  matched_customer_method text,
  matched_customer_confidence integer,
  status text,
  source text,
  updated_at timestamptz
);
create table public.lead_business_hour_intervals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  lead_id uuid not null,
  weekday smallint not null,
  interval_index smallint not null,
  opens_at time,
  closes_at time,
  is_closed boolean not null,
  source text not null
);
create table public.lead_actions (
  id uuid primary key default gen_random_uuid(), company_id uuid, lead_id uuid,
  action_type text, result text, memo text, actor_name text, created_at timestamptz default now()
);
create table public.company_do_not_contact (
  id uuid primary key default gen_random_uuid(), company_id uuid, source_lead_id uuid,
  channel text, reason text, blocked_at timestamptz default now(), released_at timestamptz
);
create table public.lead_contact_field_sources (
  id uuid primary key default gen_random_uuid(), company_id uuid, lead_id uuid,
  field_name text, source_type text, source_reference text, collected_at timestamptz default now()
);
create table public.common_revision_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  target_type text not null,
  target_id uuid not null,
  field_key text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null,
  constraint common_revision_history_value_changed_check check (old_value is distinct from new_value)
);

\ir 20261029-lead-customer-continuity.sql

insert into public.companies(id) values
  ('10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002');
insert into public.app_users(id) values
  ('30000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-000000000003');
insert into public.company_members(company_id, user_id, role, permission_role, status) values
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'member', 'owner', 'active'),
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'member', 'staff', 'active'),
  ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'owner', 'staff', 'active');
insert into public.normalized_customers(id, company_id) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002');

insert into public.business_permit_leads(id, company_id) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');

-- matched_customer_id는 대상 UUID뿐 아니라 회사까지 일치해야 한다.
do $$
begin
  update public.business_permit_leads
     set matched_customer_id='40000000-0000-0000-0000-000000000002'
   where id='60000000-0000-0000-0000-000000000001';
  raise exception 'cross_company_matched_customer_should_be_forbidden';
exception
  when foreign_key_violation then null;
end $$;

-- 100일 유선, 100일 010, 정확히 90일 유선, 89일 유선, 타 회사, 유선→010 혼합, 앞자리 0 누락 휴대폰.
insert into public.common_revision_history(id, company_id, target_type, target_id, field_key, old_value, new_value, created_at) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'customer', '40000000-0000-0000-0000-000000000001', 'phone', to_jsonb('02-111-2222'::text), to_jsonb('02-333-4444'::text), timestamptz '2026-07-21 00:00:00+00'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'customer', '40000000-0000-0000-0000-000000000001', 'phone', to_jsonb('010-1111-2222'::text), to_jsonb('010-3333-4444'::text), timestamptz '2026-07-21 00:00:00+00'),
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'customer', '40000000-0000-0000-0000-000000000001', 'phone', to_jsonb('02-555-6666'::text), to_jsonb('02-777-8888'::text), timestamptz '2026-07-31 00:00:00+00'),
  ('50000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'customer', '40000000-0000-0000-0000-000000000001', 'phone', to_jsonb('02-444-5555'::text), to_jsonb('02-666-7777'::text), timestamptz '2026-08-01 00:00:00+00'),
  ('50000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', 'customer', '40000000-0000-0000-0000-000000000002', 'phone', to_jsonb('031-111-2222'::text), to_jsonb('031-333-4444'::text), timestamptz '2026-07-21 00:00:00+00'),
  ('50000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'customer', '40000000-0000-0000-0000-000000000001', 'phone', to_jsonb('02-999-0000'::text), to_jsonb('010-9999-0000'::text), timestamptz '2026-07-21 00:00:00+00'),
  ('50000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'customer', '40000000-0000-0000-0000-000000000001', 'phone', to_jsonb('1011112222'::text), to_jsonb('1033334444'::text), timestamptz '2026-07-21 00:00:00+00');

do $$
declare v_count integer;
begin
  v_count := maju_private.redact_expired_customer_revision_values(
    timestamptz '2026-10-29 00:00:00+00',
    '10000000-0000-0000-0000-000000000001'
  );
  if v_count <> 1 then raise exception 'expected_one_automatic_redaction_got_%', v_count; end if;
  if not exists (select 1 from public.common_revision_history where id='50000000-0000-0000-0000-000000000001' and redaction_reason='retention_expired') then raise exception '100_day_landline_not_redacted'; end if;
  if exists (select 1 from public.common_revision_history where id='50000000-0000-0000-0000-000000000002' and redacted_at is not null) then raise exception '100_day_mobile_was_redacted'; end if;
  if exists (select 1 from public.common_revision_history where id='50000000-0000-0000-0000-000000000003' and redacted_at is not null) then raise exception 'exactly_90_day_landline_was_redacted'; end if;
  if exists (select 1 from public.common_revision_history where id='50000000-0000-0000-0000-000000000004' and redacted_at is not null) then raise exception '89_day_landline_was_redacted'; end if;
  if exists (select 1 from public.common_revision_history where id='50000000-0000-0000-0000-000000000005' and redacted_at is not null) then raise exception 'other_company_was_redacted'; end if;
  if exists (select 1 from public.common_revision_history where id='50000000-0000-0000-0000-000000000006' and redacted_at is not null) then raise exception 'mixed_mobile_landline_row_was_redacted'; end if;
  if exists (select 1 from public.common_revision_history where id='50000000-0000-0000-0000-000000000007' and redacted_at is not null) then raise exception 'mobile_without_leading_zero_was_redacted'; end if;
end $$;

-- 일반 service_role은 owner UUID를 가장해도 함수 자체를 실행할 수 없어야 한다.
do $$
begin
  set local role service_role;
  perform maju_private.anonymize_customer_revision_values_for_request(
    '10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'data_subject_request', false, timestamptz '2026-10-29 00:00:00+00'
  );
  raise exception 'service_role_spoofed_owner_should_be_forbidden';
exception
  when insufficient_privilege then null;
end $$;

-- 신뢰된 내부 운영자 경로에서도 member는 42501(HTTP 403 경계)이어야 한다.
set role maju_revision_redaction_operator;
do $$
begin
  perform maju_private.anonymize_customer_revision_values_for_request(
    '10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002',
    'data_subject_request', false, timestamptz '2026-10-29 00:00:00+00'
  );
  raise exception 'member_should_be_forbidden';
exception
  when insufficient_privilege then
    if sqlstate <> '42501' or sqlerrm <> 'owner_or_manager_required' then raise; end if;
end $$;
reset role;

-- permission_role이 있으면 레거시 role보다 우선한다. owner→staff 강등을 우회할 수 없어야 한다.
set role maju_revision_redaction_operator;
do $$
begin
  perform maju_private.anonymize_customer_revision_values_for_request(
    '10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000003',
    'data_subject_request', false, timestamptz '2026-10-29 00:00:00+00'
  );
  raise exception 'legacy_owner_downgraded_to_staff_should_be_forbidden';
exception
  when insufficient_privilege then
    if sqlstate <> '42501' or sqlerrm <> 'owner_or_manager_required' then raise; end if;
end $$;
reset role;

-- owner가 승인한 매장 본인 요청은 휴대폰도 익명화하고 비민감 감사 행만 남긴다.
set role maju_revision_redaction_operator;
select maju_private.anonymize_customer_revision_values_for_request(
  '10000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'store_self_request', true, timestamptz '2026-10-29 00:01:00+00'
);
reset role;

do $$
begin
  if not exists (select 1 from public.common_revision_history where id='50000000-0000-0000-0000-000000000002' and redaction_reason='data_subject_request') then raise exception 'store_self_mobile_not_redacted'; end if;
  if not exists (
    select 1 from maju_private.customer_revision_redaction_audit
    where approved_by_user_id='30000000-0000-0000-0000-000000000001'
      and approver_role='owner' and reason_code='store_self_request'
      and included_mobile_phone and redacted_row_count >= 1
  ) then raise exception 'approval_audit_missing'; end if;
end $$;

-- 사용자 계정 삭제는 감사 로그 때문에 막히지 않으며 당시 역할 스냅샷은 남아야 한다.
delete from public.app_users where id='30000000-0000-0000-0000-000000000001';
do $$
begin
  if not exists (
    select 1 from maju_private.customer_revision_redaction_audit
    where approved_by_user_id is null and approver_role='owner'
      and reason_code='store_self_request' and approved_at=timestamptz '2026-10-29 00:01:00+00'
  ) then raise exception 'approval_snapshot_not_preserved_after_user_delete'; end if;
end $$;

select 'pg16 lead-customer continuity tests passed' as result;

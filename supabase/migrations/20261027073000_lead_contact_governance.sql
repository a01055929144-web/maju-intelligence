-- 운영 적용 완료(2026-10-27). 재실행 금지.
-- P1-4 B4·C7 승인본을 운영 DB에 적용한 뒤 동일 본문을 migration 이력으로 남긴다.
-- 기능 활성화와 신규 테이블 쓰기 경로 배포는 별도 승인 전 금지한다.

begin;

-- 복합 FK가 리드와 회사의 소유권을 DB에서도 함께 검증하도록 후보 키를 둔다.
do $$
declare has_company_lead_unique boolean;
begin
  select exists (
    select 1
    from pg_constraint constraint_row
    join lateral (
      select array_agg(attribute_row.attname order by key_row.ordinality) as columns
      from unnest(constraint_row.conkey) with ordinality key_row(attnum, ordinality)
      join pg_attribute attribute_row
        on attribute_row.attrelid = constraint_row.conrelid
       and attribute_row.attnum = key_row.attnum
    ) key_columns on true
    where constraint_row.conrelid = 'public.business_permit_leads'::regclass
      and constraint_row.contype in ('p', 'u')
      and key_columns.columns = array['company_id', 'id']::name[]
  ) into has_company_lead_unique;
  if not has_company_lead_unique then
    alter table public.business_permit_leads
      add constraint business_permit_leads_company_id_id_uq unique (company_id, id);
  end if;
end $$;

create table if not exists public.lead_contact_field_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null,
  field_name text not null check (field_name in ('phone','email','fax','instagram_url','naver_talktalk_url','address','business_name')),
  source_type text not null check (source_type in ('kakao','permit','manual','upload','naver_homepage','google','other')),
  source_reference text,
  collected_at timestamptz not null default now(),
  recorded_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, lead_id, field_name, source_type, collected_at),
  constraint lead_contact_field_sources_company_lead_fk
    foreign key (company_id, lead_id) references public.business_permit_leads(company_id, id) on delete cascade
);

create index if not exists lead_contact_field_sources_company_lead_idx
  on public.lead_contact_field_sources (company_id, lead_id, collected_at desc);

create table if not exists public.company_do_not_contact (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  channel text not null check (channel in ('sms','instagram','talktalk','email','fax','visit')),
  normalized_value text not null,
  reason text not null default '연락 거부',
  source_lead_id uuid,
  blocked_at timestamptz not null default now(),
  blocked_by uuid references public.app_users(id) on delete set null,
  released_at timestamptz,
  released_by uuid references public.app_users(id) on delete set null,
  release_reason text,
  created_at timestamptz not null default now(),
  check ((released_at is null and released_by is null) or released_at is not null),
  constraint company_do_not_contact_company_lead_fk
    foreign key (company_id, source_lead_id) references public.business_permit_leads(company_id, id)
    on delete set null (source_lead_id)
);

create unique index if not exists company_do_not_contact_active_key
  on public.company_do_not_contact (company_id, channel, normalized_value)
  where released_at is null;

create index if not exists company_do_not_contact_company_blocked_idx
  on public.company_do_not_contact (company_id, blocked_at desc);

create table if not exists public.sales_outreach_policy_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references public.app_users(id) on delete cascade,
  actor_kind text not null check (actor_kind in ('app_user','legacy_owner')),
  actor_subject text not null,
  policy_version text not null,
  role_at_ack text not null,
  surface text not null check (surface in ('pc','mobile','admin_assisted')),
  acknowledged_at timestamptz not null default now(),
  check (
    (actor_kind = 'app_user' and user_id is not null and actor_subject = 'app_user:' || user_id::text)
    or
    (actor_kind = 'legacy_owner' and user_id is null and actor_subject = 'legacy_owner:' || company_id::text)
  ),
  unique (company_id, actor_subject, policy_version)
);

create index if not exists sales_outreach_policy_ack_company_idx
  on public.sales_outreach_policy_acknowledgements (company_id, policy_version, acknowledged_at desc);

alter table public.lead_contact_field_sources enable row level security;
alter table public.company_do_not_contact enable row level security;
alter table public.sales_outreach_policy_acknowledgements enable row level security;

revoke all on public.lead_contact_field_sources from public, anon, authenticated;
revoke all on public.company_do_not_contact from public, anon, authenticated;
revoke all on public.sales_outreach_policy_acknowledgements from public, anon, authenticated;
grant select, insert, update, delete on public.lead_contact_field_sources to service_role;
grant select, insert, update, delete on public.company_do_not_contact to service_role;
grant select, insert, update, delete on public.sales_outreach_policy_acknowledgements to service_role;

-- 후속 구현 조건(아직 기능 활성화 금지):
-- 1. 연락 거부 기록과 리드 상태 제외를 한 트랜잭션/RPC로 처리한다.
-- 2. 수집·업로드·병합 전 company_do_not_contact 활성 키를 조회해 재활성화를 막는다.
-- 3. 해제 API는 고객사 owner/manager 및 MAJU 관리자만 허용하고 변경 이력을 남긴다.
-- 4. 첫 사용 화면은 sales_outreach_policy_acknowledgements의 현재 policy_version 부재 시 표시한다.
-- 5. 고객사별 조회 API는 반드시 company_id 범위를 강제한다.
-- 6. 서버는 app_users.id가 있는 세션은 actor_kind='app_user', actor_subject='app_user:<uuid>'로 저장한다.
--    기존 대표 세션처럼 user_id가 없는 owner는 actor_kind='legacy_owner',
--    actor_subject='legacy_owner:<company_id>'로 저장해 확인 기록을 묵음 누락하지 않는다.
--    C6 전환으로 대표에게 app_users.id가 생기면 같은 policy_version의 legacy_owner 확인을
--    새 app_user 주체로 이관하거나 다시 확인받는 정책을 전환 배포 전에 명시해야 한다.

commit;

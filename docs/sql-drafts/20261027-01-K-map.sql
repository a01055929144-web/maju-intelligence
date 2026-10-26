-- P1-5 K 지도 필터 저장 + 영업 필요 지역 구분 대표 승인 후보
-- 승인 전 실행 금지. 이 파일은 migration이 아니며 운영 DB에 적용하지 않는다.
-- MAP_FILTER_PERSISTENCE_ENABLED는 기본 OFF이며, API·크론·운영 migration을 함께 승인하기 전까지 켜지 않는다.
-- 5건 SQL 초안 일괄 승인 뒤에는 이 DDL을 먼저 migration으로 적용할 수 있다. 적용 후에도 저장/API/크론 기능은 OFF다.

begin;

create table if not exists public.map_filter_presets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_key text not null,
  app_user_id uuid references public.app_users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint map_filter_presets_actor_key_check check (
    (app_user_id is not null and actor_key = 'app_user:' || app_user_id::text)
    or
    (app_user_id is null and actor_key = 'legacy_owner:' || company_id::text)
  ),
  unique (company_id, actor_key, name)
);

alter table public.map_filter_presets enable row level security;

revoke all on table public.map_filter_presets from public, anon, authenticated;
grant select, insert, update, delete on table public.map_filter_presets to service_role;

comment on table public.map_filter_presets is
  'service_role 전용. 서버 API가 고객 세션을 검증하고 company_id/actor_key/app_user_id를 주입한다. MAJU 관리자 미리보기는 저장하지 않는다.';

comment on column public.map_filter_presets.actor_key is
  '서버 파생 저장 주체. app_users 세션은 app_user:<uuid>, userId 없는 기존 대표 세션은 legacy_owner:<company_uuid>. 요청 body 값은 받지 않는다.';

comment on column public.map_filter_presets.app_user_id is
  'app_users 기반 고객 세션이면 필수. 기존 auth_credentials/환경변수 대표 세션만 null을 허용하며 회사 단위 legacy_owner actor를 공유한다.';

alter table public.company_lead_search_regions
  add column if not exists area_kind text not null default 'assigned';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'company_lead_search_regions_area_kind_check'
      and conrelid = 'public.company_lead_search_regions'::regclass
  ) then
    alter table public.company_lead_search_regions
      add constraint company_lead_search_regions_area_kind_check
      check (area_kind in ('assigned', 'expansion_candidate'));
  end if;
end
$$;

create index if not exists company_lead_search_regions_company_kind_idx
  on public.company_lead_search_regions(company_id, area_kind, created_at desc);

comment on column public.company_lead_search_regions.area_kind is
  'assigned=내 영업 지역(매일 수집), expansion_candidate=영업 필요 지역(시범/요청 수집만)';

commit;

-- 승인 후 작업
-- 1. 필터 API는 getRequestAuthScope 계열로 customerSession만 허용한다. MAJU 관리자 미리보기/대행 저장은 허용하지 않는다.
-- 2. company_id/actor_key/app_user_id는 요청 body를 신뢰하지 않고 검증된 고객 세션에서 서버가 주입한다.
-- 3. session.userId가 있으면 app_user:<userId>를 사용하고 company_members.status='active'를 매 요청 확인한다.
-- 4. session.userId가 없고 workspaceRole='owner'인 기존 auth_credentials/환경변수 대표만 legacy_owner:<companyId>를 사용한다.
-- 5. userId 없는 manager/staff/temporary 또는 위 두 규칙에 맞지 않는 세션은 저장 성공처럼 처리하지 말고
--    actor_identity_required(409)로 실패시킨다. app_users/company_members 전환 후에만 개인 preset을 허용한다.
-- 6. legacy_owner preset은 기존 회사 대표 자격 증명의 회사 단위 저장 공간이다. 대표 계정을 app_users로 전환할 때
--    명시적 이관 작업으로 app_user:<uuid>에 옮기며, 조회 시 두 actor를 암묵적으로 합치거나 조용히 누락하지 않는다.
-- 7. 고객사 사용자는 자기 actor_key의 preset만 CRUD한다.
-- 8. anon/authenticated 직접 접근은 계속 금지하고 service_role 서버 경로만 사용한다.
-- 9. 5건 SQL 초안 일괄 승인 후 이 DDL을 timestamp migration으로 옮겨 staging → production 순서로 적용한다.
-- 10. DDL 단독 적용은 기존 company_lead_search_regions 행을 기본값 assigned로 유지하며, 현재 코드가 area_kind를
--     읽거나 expansion_candidate를 쓰지 않으므로 기존 수집 동작을 바꾸지 않는다.
-- 11. DDL 적용 직후 기존 행 assigned 건수, map_filter_presets RLS/권한/제약을 확인하되
--     MAP_FILTER_PERSISTENCE_ENABLED=false와 확장 후보 저장 경로 OFF를 유지한다.
-- 12. 별도 기능 승인에서 actor resolver/API, expansion_candidate 저장·조회, 크론 제외 로직, 지도 점선 표시를 함께 검증한다.
-- 13. 그 승인 후에만 expansion_candidate를 매일 수집 대상에서 제외하고 기능 플래그를 활성화한다.
-- 14. 적용 전 staging에서 이 파일을 연속 2회 실행하고 아래 권한/제약 확인 쿼리 결과를 승인 기록에 첨부한다.

-- 재실행·권한 경계 확인 쿼리 (운영 적용 명령이 아님)
-- select relrowsecurity
-- from pg_class
-- where oid = 'public.map_filter_presets'::regclass;
--
-- select grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public' and table_name = 'map_filter_presets'
-- order by grantee, privilege_type;
--
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid in (
--   'public.map_filter_presets'::regclass,
--   'public.company_lead_search_regions'::regclass
-- )
-- order by conrelid::regclass::text, conname;

-- P1-5 K 지도 필터 저장 + 영업 필요 지역 구분 대표 승인 후보
-- 승인 전 실행 금지. 이 파일은 migration이 아니며 운영 DB에 적용하지 않는다.
-- MAP_FILTER_PERSISTENCE_ENABLED는 기본 OFF이며, API·크론·운영 migration을 함께 승인하기 전까지 켜지 않는다.

begin;

create table if not exists public.map_filter_presets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id, name)
);

alter table public.map_filter_presets enable row level security;

revoke all on table public.map_filter_presets from public, anon, authenticated;
grant select, insert, update, delete on table public.map_filter_presets to service_role;

comment on table public.map_filter_presets is
  'service_role 전용. 서버 API가 커스텀 세션과 활성 company_members를 검증하고 company_id/user_id를 주입한다.';

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
-- 1. 필터 API는 getRequestAuthScope 계열의 커스텀 세션 검증 후 company_members.status='active'를 매 요청 확인
-- 2. company_id/user_id는 요청 body를 신뢰하지 않고 검증된 세션의 회사와 app_users.id에서 서버가 주입
-- 3. 고객사 사용자는 자기 user_id의 preset만 CRUD, MAJU 관리자 대행 범위는 별도 승인 전 허용하지 않음
-- 4. anon/authenticated 직접 접근은 계속 금지하고 service_role 서버 경로만 사용
-- 5. 위 DDL을 timestamp migration으로 옮기고 MAP_FILTER_PERSISTENCE_ENABLED는 명시적 승인 뒤에만 활성화
-- 6. 기존 company_lead_search_regions 행은 assigned로 유지하는 드라이런 건수 보고
-- 7. area_kind 저장/조회 API와 크론 제외 로직을 함께 승인하기 전에는 칼럼 DDL도 migration으로 옮기지 않음
-- 8. 승인 후 API는 expansion_candidate를 매일 수집 대상에서 제외하고 지도 점선 경계/별도 목록에만 제공
-- 9. 적용 전 staging에서 이 파일을 연속 2회 실행하고 아래 권한/제약 확인 쿼리 결과를 승인 기록에 첨부

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

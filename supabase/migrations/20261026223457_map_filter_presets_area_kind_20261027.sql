-- RECORD ONLY FOR PRODUCTION: this DDL was manually applied and verified on 2026-10-27 KST.
-- DO NOT RUN THIS MIGRATION AGAIN AGAINST THE CURRENT PRODUCTION DATABASE.
-- Reconcile the production migration-history version separately; keep this executable for new/local databases.
-- MAP_FILTER_PERSISTENCE_ENABLED remains false. This migration does not activate API, UI, or cron behavior.

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

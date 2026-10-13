-- Task O: 외부 정보 보강/인스타그램 수정 같은 기술 기록을 영업 컨택 이력과 분리합니다.
create table if not exists public.lead_enrichment_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.business_permit_leads(id) on delete cascade,
  source text not null check (source in ('cron', 'manual', 'legacy_unknown')),
  actor_user_id uuid references public.app_users(id) on delete set null,
  actor_name text,
  attempted_at timestamptz not null default now(),
  succeeded boolean,
  message text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create index if not exists lead_enrichment_events_company_lead_attempted_idx
  on public.lead_enrichment_events (company_id, lead_id, attempted_at desc);

alter table public.lead_enrichment_events enable row level security;

-- 이 앱의 DB 접근은 서버의 service role만 사용합니다. 새 Data API 기본 권한 정책과 무관하게
-- 허용 범위를 명시하고, anon/authenticated의 직접 접근은 차단합니다.
revoke all on table public.lead_enrichment_events from anon, authenticated;
grant select, insert, update, delete on table public.lead_enrichment_events to service_role;

-- 최근 시도 후 기본 7일, 최근 3회가 모두 실패한 경우 30일이 지난 리드만 반환합니다.
-- LIMIT은 재시도 조건을 적용한 뒤 실행되어 대기 중인 리드가 후보 슬롯을 점유하지 않습니다.
create or replace function public.list_leads_due_for_enrichment(
  p_company_id uuid,
  p_limit integer default 30
)
returns table (lead_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select lead.id as lead_id
  from public.business_permit_leads as lead
  left join lateral (
    select
      max(recent.attempted_at) as last_attempted_at,
      count(*) filter (where recent.succeeded is false) as consecutive_failures
    from (
      select event.attempted_at, event.succeeded
      from public.lead_enrichment_events as event
      where event.company_id = p_company_id
        and event.lead_id = lead.id
        and event.source = 'cron'
        and event.metadata ->> 'event_type' = 'external_info_enrichment'
      order by event.attempted_at desc
      limit 3
    ) as recent
  ) as retry_history on true
  where lead.company_id = p_company_id
    and lead.status <> '제외'
    and (lead.phone is null or lead.address is null)
    and (
      retry_history.last_attempted_at is null
      or retry_history.last_attempted_at <= now() - case
        when retry_history.consecutive_failures >= 3 then interval '30 days'
        else interval '7 days'
      end
    )
  order by retry_history.last_attempted_at asc nulls first, lead.created_at asc
  limit greatest(1, least(coalesce(p_limit, 30), 500));
$$;

revoke all on function public.list_leads_due_for_enrichment(uuid, integer) from public, anon, authenticated;
grant execute on function public.list_leads_due_for_enrichment(uuid, integer) to service_role;

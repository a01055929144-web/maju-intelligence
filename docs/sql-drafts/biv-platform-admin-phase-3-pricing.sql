-- BIV platform admin phase 3: benchmark settings/snapshots and reverse proposals.
-- REVIEW ONLY. DO NOT EXECUTE. Depends on phases 1 and 2.

begin;

create table if not exists public.platform_market_benchmark_settings (
  singleton boolean primary key default true constraint platform_market_benchmark_settings_singleton_check check(singleton),
  active_policy_version text not null,
  minimum_other_company_count integer not null default 3,
  lookback_days integer not null default 90,
  reverse_proposal_threshold_percent numeric(7,2) not null default 10,
  updated_by_admin text not null,
  updated_at timestamptz not null default now(),
  constraint platform_market_benchmark_settings_minimum_check check (minimum_other_company_count >= 3),
  constraint platform_market_benchmark_settings_lookback_check check (lookback_days between 1 and 3650),
  constraint platform_market_benchmark_settings_threshold_check check (reverse_proposal_threshold_percent > 0)
);

create table if not exists public.platform_cost_benchmark_snapshots (
  id uuid default gen_random_uuid() constraint platform_cost_benchmark_snapshots_pkey primary key,
  platform_product_id uuid not null constraint platform_cost_benchmark_snapshots_product_fk
    references public.platform_products(id) on delete cascade,
  as_of_date date not null,
  policy_version text not null,
  source_company_count integer not null,
  median_unit_cost numeric(14,2) not null,
  p25_unit_cost numeric(14,2) not null,
  p75_unit_cost numeric(14,2) not null,
  created_at timestamptz not null default now(),
  constraint platform_cost_benchmark_snapshots_key unique(platform_product_id,as_of_date,policy_version),
  constraint platform_cost_benchmark_snapshots_count_check check(source_company_count >= 3),
  constraint platform_cost_benchmark_snapshots_price_check check(
    median_unit_cost >= 0 and p25_unit_cost >= 0 and p75_unit_cost >= 0
  )
);
create index if not exists platform_cost_benchmark_snapshots_latest_idx
  on public.platform_cost_benchmark_snapshots(platform_product_id,as_of_date desc);

create table if not exists public.platform_reverse_proposals (
  id uuid default gen_random_uuid() constraint platform_reverse_proposals_pkey primary key,
  company_id uuid not null constraint platform_reverse_proposals_company_fk references public.companies(id) on delete restrict,
  platform_product_id uuid not null constraint platform_reverse_proposals_product_fk references public.platform_products(id) on delete restrict,
  status text not null default 'candidate',
  company_unit_cost_snapshot numeric(14,2) not null,
  benchmark_median_snapshot numeric(14,2) not null,
  difference_percent_snapshot numeric(9,4) not null,
  source_company_count_snapshot integer not null,
  last_observed_at date not null,
  expected_monthly_quantity numeric(14,3),
  estimated_monthly_savings bigint,
  commission_rate_percent numeric(7,4),
  confirmed_commission_amount bigint,
  assigned_admin_email text,
  memo text,
  proposed_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_reverse_proposals_admin_fk foreign key (assigned_admin_email)
    references public.platform_admin_roles(admin_email) on delete set null,
  constraint platform_reverse_proposals_status_check check(status in ('candidate','proposed','accepted','rejected','commission_confirmed')),
  constraint platform_reverse_proposals_cost_check check(company_unit_cost_snapshot >= 0 and benchmark_median_snapshot >= 0),
  constraint platform_reverse_proposals_sources_check check(source_company_count_snapshot >= 3),
  constraint platform_reverse_proposals_quantity_check check(expected_monthly_quantity is null or expected_monthly_quantity >= 0),
  constraint platform_reverse_proposals_savings_check check(estimated_monthly_savings is null or estimated_monthly_savings >= 0),
  constraint platform_reverse_proposals_commission_check check(commission_rate_percent is null or commission_rate_percent between 0 and 100)
);
create unique index if not exists platform_reverse_proposals_open_uq
  on public.platform_reverse_proposals(company_id,platform_product_id)
  where status in ('candidate','proposed','accepted');
create index if not exists platform_reverse_proposals_worklist_idx
  on public.platform_reverse_proposals(status,difference_percent_snapshot desc,updated_at desc);

create table if not exists public.platform_reverse_proposal_events (
  id uuid default gen_random_uuid() constraint platform_reverse_proposal_events_pkey primary key,
  proposal_id uuid not null constraint platform_reverse_proposal_events_proposal_fk
    references public.platform_reverse_proposals(id) on delete cascade,
  from_status text,
  to_status text not null,
  admin_email text not null constraint platform_reverse_proposal_events_admin_fk
    references public.platform_admin_roles(admin_email) on delete restrict,
  memo text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint platform_reverse_proposal_events_status_check check(
    to_status in ('candidate','proposed','accepted','rejected','commission_confirmed')
    and (from_status is null or from_status in ('candidate','proposed','accepted','rejected','commission_confirmed'))
  )
);
create index if not exists platform_reverse_proposal_events_timeline_idx
  on public.platform_reverse_proposal_events(proposal_id,created_at desc);

-- Company-facing aggregate returns nothing below the threshold. The server must derive the
-- requesting company ID from its signed session and must re-check source_count >= 3.
create or replace function public.get_company_market_benchmark(
  p_requesting_company_id uuid,
  p_platform_product_id uuid,
  p_as_of_date date default ((now() at time zone 'Asia/Seoul')::date)
) returns table (
  platform_product_id uuid,
  median_unit_cost numeric,
  p25_unit_cost numeric,
  p75_unit_cost numeric,
  source_count_bucket text
) language sql security invoker set search_path=public,pg_temp as $$
  with settings as (
    select active_policy_version,minimum_other_company_count,lookback_days
    from public.platform_market_benchmark_settings where singleton=true
  ), company_costs as (
    select l.company_id,
      percentile_cont(0.5) within group(order by sp.latest_cost/l.source_to_platform_ratio)::numeric as company_unit_cost
    from public.company_product_platform_links l
    join public.supplier_products sp on sp.company_id=l.company_id and sp.id=l.supplier_product_id
    join public.company_platform_data_consents c on c.company_id=l.company_id
      and c.purpose='cost_benchmarking' and c.consent_status='granted'
    cross join settings s
    where l.platform_product_id=p_platform_product_id
      and l.source_type='supplier_product' and l.match_status='confirmed'
      and l.conversion_confirmed=true and l.source_to_platform_ratio>0
      and sp.cost_confirmed=true and sp.is_active=true and sp.latest_cost is not null
      and sp.last_seen_date >= p_as_of_date-s.lookback_days
      and c.policy_version=s.active_policy_version and l.company_id<>p_requesting_company_id
    group by l.company_id
  ), a as (
    select count(*)::int n,
      percentile_cont(0.5) within group(order by company_unit_cost)::numeric median_cost,
      percentile_cont(0.25) within group(order by company_unit_cost)::numeric p25_cost,
      percentile_cont(0.75) within group(order by company_unit_cost)::numeric p75_cost
    from company_costs
  )
  select p_platform_product_id,round(a.median_cost,2),round(a.p25_cost,2),round(a.p75_cost,2),
    case when a.n between 3 and 5 then '3-5' when a.n between 6 and 10 then '6-10' else '11+' end
  from a cross join settings s where a.n>=greatest(3,s.minimum_other_company_count);
$$;

create or replace function public.reject_platform_proposal_event_mutation()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception '역제안 이벤트는 수정하거나 삭제할 수 없습니다.' using errcode='55000'; end;
$$;
drop trigger if exists platform_reverse_proposal_events_append_only on public.platform_reverse_proposal_events;
create trigger platform_reverse_proposal_events_append_only before update or delete
  on public.platform_reverse_proposal_events for each row execute function public.reject_platform_proposal_event_mutation();

alter table public.platform_market_benchmark_settings enable row level security;
alter table public.platform_cost_benchmark_snapshots enable row level security;
alter table public.platform_reverse_proposals enable row level security;
alter table public.platform_reverse_proposal_events enable row level security;
revoke all on public.platform_market_benchmark_settings,public.platform_cost_benchmark_snapshots,
  public.platform_reverse_proposals,public.platform_reverse_proposal_events from public,anon,authenticated;
grant all on public.platform_market_benchmark_settings,public.platform_cost_benchmark_snapshots,
  public.platform_reverse_proposals,public.platform_reverse_proposal_events to service_role;
revoke execute on function public.get_company_market_benchmark(uuid,uuid,date) from public,anon,authenticated;
revoke execute on function public.reject_platform_proposal_event_mutation() from public,anon,authenticated;
grant execute on function public.get_company_market_benchmark(uuid,uuid,date) to service_role;

commit;

-- Rollback draft: export proposals/events, then drop events -> proposals -> snapshots -> settings/functions.

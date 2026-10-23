-- 운영 적용 완료(2026-10-23). 재실행 금지.
-- 원본: docs/sql-drafts/lead-sync-run-history.sql
begin;
create table if not exists public.lead_sync_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source text not null check (source in ('gov','seoul','kakao_keyword','manual')),
  trigger text not null default 'cron' check (trigger in ('cron','manual','ingest')),
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null check (status in ('running','success','error')),
  fetched_count integer not null default 0 check (fetched_count >= 0),
  inside_sales_area_count integer not null default 0 check (inside_sales_area_count >= 0),
  outside_sales_area_count integer not null default 0 check (outside_sales_area_count >= 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  closed_count integer not null default 0 check (closed_count >= 0),
  closure_review_count integer not null default 0 check (closure_review_count >= 0),
  ownership_change_count integer not null default 0 check (ownership_change_count >= 0),
  non_target_count integer not null default 0 check (non_target_count >= 0),
  cross_source_link_count integer not null default 0 check (cross_source_link_count >= 0),
  batch_duplicate_count integer not null default 0 check (batch_duplicate_count >= 0),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint lead_sync_runs_company_id_id_key unique(company_id,id)
);
create index if not exists lead_sync_runs_company_started_idx
  on public.lead_sync_runs(company_id,started_at desc);
create index if not exists lead_sync_runs_retention_idx on public.lead_sync_runs(created_at);
alter table public.lead_sync_runs enable row level security;
revoke all on table public.lead_sync_runs from public,anon,authenticated;
grant select,insert,update on table public.lead_sync_runs to service_role;
commit;

-- 보관 기간 삭제는 운영 감사 정책 확정 전까지 활성화하지 않습니다.
-- delete from public.lead_sync_runs where created_at < now() - interval '1 year';

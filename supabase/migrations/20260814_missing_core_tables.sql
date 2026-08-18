-- 운영 DB가 schema.sql의 예전 버전으로 처음 생성된 뒤로 아래 5개 핵심 테이블이 한 번도 만들어지지 않았습니다.
-- (admin_audit_logs, column_mappings, health_score_snapshots, lead_recommendations, raw_customer_rows)
-- 이로 인해 데이터 등록 저장 중 감사 로그/리드 추천/건강도 스냅샷 저장이 실패하고,
-- "방문 히스토리 조회 실패: ... lead_recommendations ..." 같은 오류가 발생했습니다.
-- companies, ai_reports, app_users, customer_imports는 이미 존재하므로 바로 실행 가능합니다.
-- 이 마이그레이션을 먼저 실행한 뒤, 20260814_visit_results_lead_fk.sql을 실행(또는 재실행)하세요.

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.app_users(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.column_mappings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  import_id uuid not null references public.customer_imports(id) on delete cascade,
  source_header text not null,
  target_field text not null,
  confidence integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.raw_customer_rows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  import_id uuid not null references public.customer_imports(id) on delete cascade,
  row_index integer not null,
  raw_data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.health_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  report_id uuid not null references public.ai_reports(id) on delete cascade,
  total integer not null,
  sales_power integer not null,
  delivery_efficiency integer not null,
  crm_management integer not null,
  new_sales integer not null,
  concentration integer not null,
  risk integer not null,
  formula_version text not null default 'v1',
  created_at timestamptz not null default now()
);

create table if not exists public.lead_recommendations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  report_id uuid not null references public.ai_reports(id) on delete cascade,
  name text not null,
  region text,
  score integer not null default 0,
  reasons jsonb not null default '[]'::jsonb,
  status text not null default 'this-week',
  created_at timestamptz not null default now()
);

create index if not exists idx_column_mappings_import on public.column_mappings(import_id);
create index if not exists idx_raw_customer_rows_import on public.raw_customer_rows(import_id);
create index if not exists idx_health_score_snapshots_company_created on public.health_score_snapshots(company_id, created_at desc);
create index if not exists idx_lead_recommendations_score on public.lead_recommendations(score desc);
create index if not exists idx_admin_audit_logs_company_created on public.admin_audit_logs(company_id, created_at desc);

alter table public.column_mappings enable row level security;
alter table public.raw_customer_rows enable row level security;
alter table public.health_score_snapshots enable row level security;
alter table public.lead_recommendations enable row level security;
alter table public.admin_audit_logs enable row level security;

notify pgrst, 'reload schema';

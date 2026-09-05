-- 직원 카카오/소셜 가입 매핑 보강: 초대 시 지정한 이메일을 가입 계정 이메일과 대조하고,
-- 가입 완료 후 accepted_by/accepted_at으로 실제 app_users와 연결 상태를 관리합니다.
alter table public.staff_invitations
  add column if not exists employee_email text,
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by uuid references public.app_users(id) on delete set null;

create index if not exists idx_staff_invitations_company_email
  on public.staff_invitations(company_id, lower(employee_email))
  where employee_email is not null;

create index if not exists idx_staff_invitations_accepted_by
  on public.staff_invitations(accepted_by)
  where accepted_by is not null;

-- GPS 기반 일자별 물류 코스/비용 요약.
-- staff_location_events 원천 이벤트를 기준으로 배치/크론/관리 화면에서 집계해 저장하는 운영 테이블입니다.
create table if not exists public.staff_route_daily_summaries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references public.app_users(id) on delete set null,
  driver_name text not null,
  delivery_vehicle text,
  route_date date not null,
  first_location_at timestamptz,
  last_location_at timestamptz,
  location_event_count integer not null default 0,
  visited_customer_count integer not null default 0,
  actual_distance_km numeric not null default 0,
  driving_minutes integer not null default 0,
  estimated_fuel_cost_won integer not null default 0,
  estimated_labor_cost_won integer not null default 0,
  estimated_total_cost_won integer not null default 0,
  cost_basis jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_route_daily_summaries_unique unique (company_id, user_id, driver_name, route_date)
);

create index if not exists idx_staff_route_daily_summaries_company_date
  on public.staff_route_daily_summaries(company_id, route_date desc);

create index if not exists idx_staff_route_daily_summaries_user_date
  on public.staff_route_daily_summaries(user_id, route_date desc)
  where user_id is not null;

alter table public.staff_route_daily_summaries enable row level security;

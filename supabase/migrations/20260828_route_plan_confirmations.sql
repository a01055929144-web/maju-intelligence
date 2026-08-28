-- 2026-08-28 피드백 대응: 데스크톱(코스 탭)에서 배송담당자별로 확정한 오늘 방문 순서가 화면
-- 상태로만 존재하고 서버에 저장되지 않아, 모바일(기사님 휴대폰)에는 전혀 반영되지 않던 문제를
-- 고칩니다. 담당자·날짜별로 확정된 거래처 순서를 저장해두고, getTodayRoutePlan이 이 값을 읽어
-- 해당 담당자의 stop 순서에 반영합니다.
create table if not exists public.route_plan_confirmations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  driver_name text not null,
  route_date date not null,
  customer_ids jsonb not null default '[]'::jsonb,
  confirmed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_plan_confirmations_unique unique (company_id, driver_name, route_date)
);

create index if not exists idx_route_plan_confirmations_company_date
  on public.route_plan_confirmations(company_id, route_date desc);

alter table public.route_plan_confirmations enable row level security;

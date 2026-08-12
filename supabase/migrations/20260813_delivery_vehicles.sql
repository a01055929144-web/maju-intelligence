-- Persists per-driver delivery vehicle settings (fuel type today) so they
-- survive across devices/sessions instead of living only in browser localStorage.
-- A "vehicle" in this app is currently keyed 1:1 by delivery manager (driver) name.

create table if not exists public.delivery_vehicles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  driver_name text not null,
  fuel_type text not null default 'diesel' check (fuel_type in ('diesel', 'gasoline')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_vehicles_company_driver_unique unique (company_id, driver_name)
);

create index if not exists idx_delivery_vehicles_company
  on public.delivery_vehicles(company_id);

alter table public.delivery_vehicles enable row level security;

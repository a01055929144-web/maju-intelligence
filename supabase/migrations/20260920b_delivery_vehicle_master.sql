-- Canonical company vehicle master. Existing delivery_vehicles remains as the
-- legacy per-driver fuel setting until all route grouping is migrated to IDs.
create table if not exists public.delivery_vehicle_master (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  plate_number text not null,
  fuel_type text not null default 'diesel' check (fuel_type in ('diesel', 'gasoline', 'electric', 'hybrid', 'lpg')),
  operational_status text not null default 'active' check (operational_status in ('active', 'maintenance', 'inactive')),
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_vehicle_master_company_plate_unique unique (company_id, plate_number)
);

create index if not exists idx_delivery_vehicle_master_company_status
  on public.delivery_vehicle_master(company_id, operational_status);

alter table public.delivery_vehicle_master enable row level security;

alter table public.staff_invitations
  add column if not exists assigned_vehicle_master_id uuid references public.delivery_vehicle_master(id) on delete set null;

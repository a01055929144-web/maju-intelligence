-- PHASE 1 / step 3: territory route units (already applied to production on 2026-10-15).
-- This file mirrors the live schema and is idempotent for fresh/staging environments.
create table if not exists public.delivery_route_units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  territory_id uuid not null,
  name text not null check (length(btrim(name)) > 0),
  current_vehicle_id uuid,
  default_driver_staff_member_id uuid,
  is_active boolean not null default true,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.delivery_route_units'::regclass and conname = 'delivery_route_units_name_check') then
    alter table public.delivery_route_units add constraint delivery_route_units_name_check check (length(btrim(name)) > 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.delivery_route_units'::regclass and conname = 'delivery_route_units_company_id_id_unique') then
    alter table public.delivery_route_units add constraint delivery_route_units_company_id_id_unique unique (company_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.delivery_route_units'::regclass and conname = 'delivery_route_units_company_name_unique') then
    alter table public.delivery_route_units add constraint delivery_route_units_company_name_unique unique (company_id, name);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.delivery_route_units'::regclass and conname = 'delivery_route_units_territory_fk') then
    alter table public.delivery_route_units add constraint delivery_route_units_territory_fk
      foreign key (company_id, territory_id) references public.delivery_territories(company_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.delivery_route_units'::regclass and conname = 'delivery_route_units_vehicle_fk') then
    alter table public.delivery_route_units add constraint delivery_route_units_vehicle_fk
      foreign key (company_id, current_vehicle_id) references public.delivery_vehicle_master(company_id, id)
      on delete set null (current_vehicle_id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.delivery_route_units'::regclass and conname = 'delivery_route_units_driver_fk') then
    alter table public.delivery_route_units add constraint delivery_route_units_driver_fk
      foreign key (company_id, default_driver_staff_member_id) references public.company_members(company_id, id)
      on delete set null (default_driver_staff_member_id);
  end if;
end $$;

create index if not exists idx_delivery_route_units_territory
  on public.delivery_route_units(company_id, territory_id) where is_active;
create index if not exists idx_delivery_route_units_driver
  on public.delivery_route_units(company_id, default_driver_staff_member_id)
  where default_driver_staff_member_id is not null;
create unique index if not exists uq_delivery_route_units_active_vehicle
  on public.delivery_route_units(company_id, current_vehicle_id)
  where is_active and current_vehicle_id is not null;

alter table public.delivery_route_units enable row level security;
revoke all on table public.delivery_route_units from anon, authenticated;
grant all on table public.delivery_route_units to service_role;

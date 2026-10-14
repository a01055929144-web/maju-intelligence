-- Already applied to production on 2026-10-14. This migration mirrors the
-- deployed schema and is intentionally safe to run again.

create table if not exists public.delivery_territories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_territory_areas (
  company_id uuid not null,
  territory_id uuid not null,
  administrative_area text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.territory_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  territory_id uuid not null,
  staff_member_id uuid not null,
  assignment_role text not null default 'customer_default',
  priority integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.normalized_customers
  add column if not exists delivery_territory_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'delivery_territories_company_id_fkey') then
    alter table public.delivery_territories
      add constraint delivery_territories_company_id_fkey
      foreign key (company_id) references public.companies(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'delivery_territories_company_id_id_unique') then
    alter table public.delivery_territories
      add constraint delivery_territories_company_id_id_unique unique (company_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'delivery_territories_company_name_unique') then
    alter table public.delivery_territories
      add constraint delivery_territories_company_name_unique unique (company_id, name);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'delivery_territories_name_check') then
    alter table public.delivery_territories
      add constraint delivery_territories_name_check check (length(btrim(name)) > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'delivery_territory_areas_pkey') then
    alter table public.delivery_territory_areas
      add constraint delivery_territory_areas_pkey primary key (company_id, administrative_area);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'delivery_territory_areas_administrative_area_check') then
    alter table public.delivery_territory_areas
      add constraint delivery_territory_areas_administrative_area_check check (length(btrim(administrative_area)) > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'delivery_territory_areas_territory_fk') then
    alter table public.delivery_territory_areas
      add constraint delivery_territory_areas_territory_fk
      foreign key (company_id, territory_id)
      references public.delivery_territories(company_id, id) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'territory_staff_assignments_assignment_role_check') then
    alter table public.territory_staff_assignments
      add constraint territory_staff_assignments_assignment_role_check
      check (assignment_role = 'customer_default');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'territory_staff_assignments_priority_check') then
    alter table public.territory_staff_assignments
      add constraint territory_staff_assignments_priority_check check (priority > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'territory_staff_assignments_territory_fk') then
    alter table public.territory_staff_assignments
      add constraint territory_staff_assignments_territory_fk
      foreign key (company_id, territory_id)
      references public.delivery_territories(company_id, id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'territory_staff_assignments_member_fk') then
    alter table public.territory_staff_assignments
      add constraint territory_staff_assignments_member_fk
      foreign key (company_id, staff_member_id)
      references public.company_members(company_id, id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'territory_staff_assignments_member_unique') then
    alter table public.territory_staff_assignments
      add constraint territory_staff_assignments_member_unique
      unique (company_id, territory_id, assignment_role, staff_member_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'territory_staff_assignments_priority_unique') then
    alter table public.territory_staff_assignments
      add constraint territory_staff_assignments_priority_unique
      unique (company_id, territory_id, assignment_role, priority)
      deferrable initially deferred;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'normalized_customers_delivery_territory_fk') then
    alter table public.normalized_customers
      add constraint normalized_customers_delivery_territory_fk
      foreign key (company_id, delivery_territory_id)
      references public.delivery_territories(company_id, id)
      on delete set null (delivery_territory_id);
  end if;
end
$$;

create index if not exists idx_delivery_territory_areas_territory
  on public.delivery_territory_areas(company_id, territory_id);
create index if not exists idx_territory_staff_assignment_member
  on public.territory_staff_assignments(company_id, staff_member_id);
create index if not exists idx_territory_staff_assignment_order
  on public.territory_staff_assignments(company_id, territory_id, assignment_role, priority)
  where is_active;
create index if not exists idx_normalized_customers_company_territory
  on public.normalized_customers(company_id, delivery_territory_id)
  where delivery_territory_id is not null;

alter table public.delivery_territories enable row level security;
alter table public.delivery_territory_areas enable row level security;
alter table public.territory_staff_assignments enable row level security;

revoke all on table public.delivery_territories from anon, authenticated;
revoke all on table public.delivery_territory_areas from anon, authenticated;
revoke all on table public.territory_staff_assignments from anon, authenticated;

-- PHASE 1: stable, tenant-safe customer assignment references.
-- This migration intentionally does not backfill either ID column.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.normalized_customers
  add column if not exists assigned_staff_member_id uuid,
  add column if not exists delivery_vehicle_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.company_members'::regclass
      and conname = 'company_members_company_id_id_unique'
  ) then
    alter table public.company_members
      add constraint company_members_company_id_id_unique unique (company_id, id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.delivery_vehicle_master'::regclass
      and conname = 'delivery_vehicle_master_company_id_id_unique'
  ) then
    alter table public.delivery_vehicle_master
      add constraint delivery_vehicle_master_company_id_id_unique unique (company_id, id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.normalized_customers'::regclass
      and conname = 'normalized_customers_assigned_staff_member_fk'
  ) then
    alter table public.normalized_customers
      add constraint normalized_customers_assigned_staff_member_fk
      foreign key (company_id, assigned_staff_member_id)
      references public.company_members (company_id, id)
      on delete set null (assigned_staff_member_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.normalized_customers'::regclass
      and conname = 'normalized_customers_delivery_vehicle_fk'
  ) then
    alter table public.normalized_customers
      add constraint normalized_customers_delivery_vehicle_fk
      foreign key (company_id, delivery_vehicle_id)
      references public.delivery_vehicle_master (company_id, id)
      on delete set null (delivery_vehicle_id);
  end if;
end
$$;

create index if not exists idx_normalized_customers_company_staff_assignment
  on public.normalized_customers (company_id, assigned_staff_member_id)
  where assigned_staff_member_id is not null;

create index if not exists idx_normalized_customers_company_vehicle_assignment
  on public.normalized_customers (company_id, delivery_vehicle_id)
  where delivery_vehicle_id is not null;

comment on column public.normalized_customers.assigned_staff_member_id is
  'Stable company membership assignment. delivery_manager remains the legacy display snapshot during transition.';

comment on column public.normalized_customers.delivery_vehicle_id is
  'User-confirmed territory-to-vehicle assignment. delivery_vehicle remains the territory label.';

commit;

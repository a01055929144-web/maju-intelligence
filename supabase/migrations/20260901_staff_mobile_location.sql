alter table public.staff_mobile_devices
  add column if not exists last_lat numeric,
  add column if not exists last_lng numeric,
  add column if not exists last_accuracy_m numeric,
  add column if not exists last_location_at timestamptz,
  add column if not exists location_status text not null default 'active',
  add column if not exists current_customer_id uuid references public.normalized_customers(id) on delete set null,
  add column if not exists driver_name text,
  add column if not exists delivery_vehicle text,
  add column if not exists user_agent text;

create unique index if not exists idx_staff_mobile_devices_company_user_platform
  on public.staff_mobile_devices(company_id, user_id, platform);

create index if not exists idx_staff_mobile_devices_company_location
  on public.staff_mobile_devices(company_id, last_location_at desc);

create table if not exists public.staff_location_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  device_id uuid references public.staff_mobile_devices(id) on delete set null,
  current_customer_id uuid references public.normalized_customers(id) on delete set null,
  driver_name text,
  delivery_vehicle text,
  latitude numeric not null,
  longitude numeric not null,
  accuracy_m numeric,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_staff_location_events_company_recorded
  on public.staff_location_events(company_id, recorded_at desc);

create index if not exists idx_staff_location_events_user_recorded
  on public.staff_location_events(user_id, recorded_at desc);

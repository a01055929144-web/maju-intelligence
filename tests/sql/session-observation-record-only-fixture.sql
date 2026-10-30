\set ON_ERROR_STOP on

do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

create extension if not exists pgcrypto;

create table public.companies (id uuid primary key);
create table public.app_users (id uuid primary key);
create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references public.app_users(id) on delete set null,
  role text not null default 'member',
  permission_role text,
  membership_expires_at timestamptz,
  status text not null default 'active'
);
create table public.staff_account_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  device_hash text not null,
  device_label text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(company_id, user_id, device_hash)
);
create table public.staff_security_alerts (
  id uuid primary key default gen_random_uuid(),
  marker text not null
);

insert into public.companies(id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');
insert into public.app_users(id) values
  ('00000000-0000-0000-0000-000000000011'),
  ('00000000-0000-0000-0000-000000000012'),
  ('00000000-0000-0000-0000-000000000013');
insert into public.company_members(company_id, user_id, role, permission_role, status) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'owner', 'owner', 'active'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 'member', 'staff', 'inactive'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', 'member', 'staff', 'active');
insert into public.staff_security_alerts(marker) values ('sentinel');

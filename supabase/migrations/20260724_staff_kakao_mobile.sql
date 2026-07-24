alter table public.app_users
  add column if not exists kakao_user_id text,
  add column if not exists auth_provider text not null default 'password',
  add column if not exists avatar_url text,
  add column if not exists last_login_at timestamptz;

create unique index if not exists idx_app_users_kakao_user_id
  on public.app_users(kakao_user_id)
  where kakao_user_id is not null;

create table if not exists public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invited_by uuid references public.app_users(id) on delete set null,
  invite_code text not null unique,
  employee_name text,
  employee_phone text,
  role text not null default 'driver',
  status text not null default 'pending',
  expires_at timestamptz,
  accepted_by uuid references public.app_users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_mobile_devices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  device_label text,
  platform text not null default 'mobile_web',
  push_token text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_staff_invitations_company_status
  on public.staff_invitations(company_id, status, created_at desc);

create index if not exists idx_staff_mobile_devices_user
  on public.staff_mobile_devices(user_id, last_seen_at desc);

alter table public.staff_invitations enable row level security;
alter table public.staff_mobile_devices enable row level security;

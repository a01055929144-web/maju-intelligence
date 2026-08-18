create table if not exists public.auth_credentials (
  id text primary key,
  admin_email text not null,
  admin_password text not null,
  customer_email text not null,
  customer_password text not null,
  customer_company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.auth_credentials enable row level security;

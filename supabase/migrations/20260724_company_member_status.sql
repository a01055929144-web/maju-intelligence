alter table public.company_members
  add column if not exists status text not null default 'active',
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_company_members_company_status
  on public.company_members(company_id, status, role);

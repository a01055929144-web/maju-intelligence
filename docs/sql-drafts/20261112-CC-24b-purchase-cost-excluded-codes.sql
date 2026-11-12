-- DRAFT ONLY (CC-24b). Never run against production without the CEO's explicit approval phrase.
-- Company-wide list of purchase-price upload codes that must be skipped on every upload ("이 코드 다음에도 제외", CC-24 4-1).
-- One new table, no changes to existing tables, no data. Service-only: no anon/authenticated grants;
-- the app server enforces company boundaries and roles (owner/manager).
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if to_regclass('public.purchase_cost_excluded_codes') is not null then raise exception 'cc24b_already_applied'; end if;
  if to_regclass('public.companies') is null then raise exception 'cc24b_dependency_missing'; end if;
end $$;

create table public.purchase_cost_excluded_codes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- The upload's product code, trimmed. Compared case-insensitively (unique index below).
  code text not null check (code = btrim(code) and length(code) between 1 and 80),
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  unique (company_id, id)
);
create unique index purchase_cost_excluded_codes_company_code_uq on public.purchase_cost_excluded_codes(company_id, lower(code));
alter table public.purchase_cost_excluded_codes enable row level security;
revoke all on public.purchase_cost_excluded_codes from public, anon, authenticated;
grant select, insert, delete on public.purchase_cost_excluded_codes to service_role;
commit;

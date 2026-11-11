-- DRAFT ONLY (CC-22a). Never run against production without the CEO's explicit approval phrase.
-- Adds a per-company kind used by the MAJU admin screens. Existing rows become 'customer'; two known accounts are set explicitly.
-- Service-only: customer screens and APIs never write this column (admin API only, audited in admin_audit_logs).
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'companies' and column_name = 'company_kind')
    then raise exception 'cc22a_already_applied'; end if;
end $$;
alter table public.companies add column company_kind text not null default 'customer'
  constraint companies_company_kind_check check (company_kind in ('customer','pilot','internal'));
-- Vibe (HQ) = internal, JS Retail = pilot. Every other company stays 'customer'.
update public.companies set company_kind = 'internal' where id = '898d85fc-c475-47e0-9943-91709e13a4bb';
update public.companies set company_kind = 'pilot' where id = '04ebb7bb-8da0-4723-8211-f2a947939344';
commit;

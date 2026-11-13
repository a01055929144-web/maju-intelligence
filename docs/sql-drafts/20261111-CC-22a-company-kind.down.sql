-- DOWN for CC-22a. Drops the column; the admin screens (CC-22b) must be rolled back first.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
alter table public.companies drop column company_kind;
commit;

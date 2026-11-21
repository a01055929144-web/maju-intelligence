-- DRAFT ONLY. Refuse rollback while any company deliberately exposes its account.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin if exists(select 1 from public.company_profiles where show_settlement_account_to_stores) then raise exception 'cx101_down_refused_enabled_company'; end if; end $$;
alter table public.company_profiles drop column show_settlement_account_to_stores;
commit;

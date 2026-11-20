\set ON_ERROR_STOP on
do $$ begin if current_setting('server_version_num')::int/10000<>17 then raise exception 'cx101_pg17_required'; end if; end $$;
alter table public.company_profiles add column if not exists settlement_bank text;
alter table public.company_profiles add column if not exists settlement_account_number text;
alter table public.company_profiles add column if not exists settlement_account_holder text;
insert into public.company_profiles(company_id)
values ('00000000-0000-4000-8000-000000000101')
on conflict (company_id) do nothing;
\ir ../../docs/sql-drafts/20261118-CX-101-store-settlement-account.sql
do $$ declare company uuid; begin
  select company_id into strict company from public.company_profiles limit 1;
  if (select show_settlement_account_to_stores from public.company_profiles where company_id=company) then raise exception 'cx101_default_not_off'; end if;
  update public.company_profiles set settlement_bank='합성은행',settlement_account_number='123-456',settlement_account_holder='합성 예금주',show_settlement_account_to_stores=true where company_id=company;
  if not (select show_settlement_account_to_stores and settlement_account_number='123-456' from public.company_profiles where company_id=company)
    then raise exception 'cx101_setting_not_saved'; end if;
end $$;
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/20261118-CX-101-store-settlement-account.down.sql
\set ON_ERROR_STOP on
do $$ begin if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='company_profiles' and column_name='show_settlement_account_to_stores') then raise exception 'cx101_guarded_down_removed_enabled_setting'; end if; end $$;
update public.company_profiles set show_settlement_account_to_stores=false;
\ir ../../docs/sql-drafts/20261118-CX-101-store-settlement-account.down.sql
\ir ../../docs/sql-drafts/20261118-CX-101-store-settlement-account.sql
delete from public.company_profiles where company_id='00000000-0000-4000-8000-000000000101';
select 'CX-101 store settlement account PG17 passed' result;

-- DRAFT ONLY. Production apply requires separate DB approval.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$ begin if to_regclass('public.company_profiles') is null then raise exception 'cx101_company_profiles_required'; end if; end $$;
alter table public.company_profiles add column show_settlement_account_to_stores boolean not null default false;
comment on column public.company_profiles.show_settlement_account_to_stores is
  'CX-101 default OFF. Server may show settlement account only to an active linked store member when the company rollout is also enabled.';
commit;

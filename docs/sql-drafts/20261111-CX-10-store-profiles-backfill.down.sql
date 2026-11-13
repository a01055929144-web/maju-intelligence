-- DRAFT ONLY (CX-10 backfill rollback). Removes only backfilled profiles that nothing else uses yet.
begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
do $$ begin
  if exists(select 1 from public.store_accounts a join public.store_profiles p on p.id = a.store_profile_id
      where p.origin = 'backfill' and a.id <> p.backfilled_from_store_account_id)
    then raise exception 'cx10_backfill_down_refused_profile_reused'; end if;
end $$;
update public.store_accounts a set store_profile_id = null, updated_at = clock_timestamp()
  from public.store_profiles p where p.id = a.store_profile_id and p.origin = 'backfill';
delete from public.store_profile_members m using public.store_profiles p
  where p.id = m.store_profile_id and p.origin = 'backfill';
delete from public.store_profiles where origin = 'backfill';
commit;

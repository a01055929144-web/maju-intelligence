-- Does not restore closed accounts, removed memberships or revoked links.
begin;
set local lock_timeout='3s';
do $$ begin
  if exists(select 1 from public.store_account_member_events where reason in ('store_connection_closed','store_connection_left'))
    then raise exception 'store_connection_history_requires_manual_recovery_review'; end if;
end $$;
drop function public.change_store_connection_v1(uuid,uuid,uuid,uuid,text);
notify pgrst,'reload schema';
commit;

-- DRAFT DOWN ONLY. Refuses to erase a confirmation or its audit history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

do $$ begin
  if to_regclass('public.store_price_visibility_events') is null
    or not exists(select 1 from information_schema.columns
      where table_schema='public' and table_name='store_accounts' and column_name='price_visibility_status')
    then raise exception 'cx122_not_applied'; end if;
  if exists(select 1 from public.store_accounts where price_visibility_status='confirmed')
    or exists(select 1 from public.store_price_visibility_events)
    then raise exception 'cx122_down_refused_visibility_history'; end if;
end $$;

drop function public.pending_store_price_visibility_count_v1(uuid,uuid);
drop function public.store_price_visible_v1(uuid,uuid);
drop function public.set_store_price_visibility_v1(uuid,uuid,uuid,text,text,jsonb);
drop table public.store_price_visibility_events;
alter table public.store_accounts
  drop constraint store_accounts_price_visibility_actor_fk,
  drop constraint store_accounts_price_visibility_state_ck,
  drop column price_visibility_confirmed_by_member_id,
  drop column price_visibility_confirmed_at,
  drop column price_visibility_status;
notify pgrst,'reload schema';
commit;

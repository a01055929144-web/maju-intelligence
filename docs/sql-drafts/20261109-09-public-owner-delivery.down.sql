-- REVIEW ONLY. Turn the separate company feature OFF before an approved rollback.
begin;
set local lock_timeout='3s';
set local statement_timeout='10s';
do $$ begin
  if exists(select 1 from public.store_accounts where verification_request_id like 'public-delivery-v1:%')
    then raise exception 'public_owner_delivery_down_refused_history_exists'; end if;
end $$;
drop function public.activate_public_store_owner_with_delivery_v1(text,uuid,text,timestamptz,text,text,timestamptz,text,uuid);
notify pgrst,'reload schema';
commit;

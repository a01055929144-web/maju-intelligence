-- DOWN for CX-12. Refuses when any distributor connection was made through an invite code (no data deleted to get around it).
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

do $$ begin
  if exists(select 1 from public.store_accounts where invite_code_id is not null)
    then raise exception 'cx12_down_refused_existing_connections'; end if;
end $$;

drop function if exists public.connect_store_profile_by_invite_code_v1(uuid,uuid,text);
notify pgrst, 'reload schema';
commit;

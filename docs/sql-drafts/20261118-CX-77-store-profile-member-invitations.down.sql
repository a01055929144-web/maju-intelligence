-- Turn STORE_PROFILE_INVITATIONS off before this guarded rollback.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
do $$ begin
  if exists(select 1 from public.store_profile_member_invitations) then raise exception 'cx77_invitation_history_exists'; end if;
end $$;
drop function public.remove_store_profile_member_v1(uuid,uuid,uuid);
drop function public.accept_store_profile_member_invitation_v1(text,uuid);
drop function public.create_store_profile_member_invitation_v1(uuid,uuid,text,text,text);
drop table public.store_profile_member_invitations;
notify pgrst,'reload schema';
commit;

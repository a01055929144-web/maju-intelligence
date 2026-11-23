-- Turn STORE_ACCESS_PASSWORD_READ off before this rollback.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
drop function public.read_store_access_password_v1(uuid,uuid,uuid,uuid);
notify pgrst,'reload schema';
commit;

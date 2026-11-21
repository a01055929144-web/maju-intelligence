-- DRAFT ONLY. Remove runtime callers first; no tables/data are changed.
begin;
set local lock_timeout = '3s';
drop function public.assert_store_distributor_industry_v1(uuid,uuid,uuid);
drop function public.check_store_distributor_industry_v1(uuid,uuid,uuid);
notify pgrst, 'reload schema';
commit;

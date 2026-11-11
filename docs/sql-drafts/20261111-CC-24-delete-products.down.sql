-- DOWN for CC-24. Drops the delete function only. Products already deleted cannot be restored by this script;
-- products that were hidden stay hidden (re-activate them from the screen).
begin;
set local lock_timeout = '3s';
do $$ begin
  if to_regprocedure('public.cc24_delete_products(uuid,uuid[],boolean)') is null then raise exception 'cc24_not_applied'; end if;
end $$;
drop function public.cc24_delete_products(uuid,uuid[],boolean);
commit;

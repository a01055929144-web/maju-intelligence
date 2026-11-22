-- CX-123 rollback draft. Refuse to remove functions that other objects depend on.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

do $$ begin
  if exists (
    select 1 from pg_depend dependency
    join pg_proc function on function.oid=dependency.refobjid
    where function.oid in (
      to_regprocedure('public.store_member_catalog_v2(uuid,uuid,date,uuid,text,text,text,text,integer)'),
      to_regprocedure('public.cx123_store_price_visible(uuid,uuid,text[])')
    ) and dependency.deptype='n'
  ) then raise exception 'cx123_down_dependency_exists'; end if;
end $$;

drop function if exists public.store_member_catalog_v2(uuid,uuid,date,uuid,text,text,text,text,integer);
drop function if exists public.cx123_store_price_visible(uuid,uuid,text[]);
commit;

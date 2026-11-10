-- OPERATING FOLLOW-UP DRAFT ONLY. Do not rerun the already-applied base-address up SQL.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';

do $$ begin
  if to_regprocedure('public.copy_public_owner_delivery_address_v1()') is null
    then raise exception 'public_owner_base_address_trigger_function_required'; end if;
end $$;

revoke all on function public.copy_public_owner_delivery_address_v1() from public,anon,authenticated,service_role;
grant execute on function public.copy_public_owner_delivery_address_v1() to service_role;
commit;

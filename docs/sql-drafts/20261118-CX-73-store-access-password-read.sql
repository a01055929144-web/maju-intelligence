-- S-3e / CX-73 DRAFT ONLY. Do not run in production without representative DB approval.
-- Dedicated point read only: never reuse this function for lists, exports, logs, or notifications.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if to_regclass('public.store_profiles') is null
    or to_regclass('public.store_accounts') is null
    or to_regclass('public.company_members') is null
    or to_regclass('public.delivery_route_stops') is null
    or not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='store_profiles' and column_name='access_password'
    )
  then raise exception 'cx73_dependencies_required'; end if;
  if to_regprocedure('public.read_store_access_password_v1(uuid,uuid,uuid,uuid)') is not null
  then raise exception 'cx73_already_applied'; end if;
end $$;

create function public.read_store_access_password_v1(
  p_company uuid,
  p_actor_user uuid,
  p_store_profile uuid,
  p_route_stop uuid default null
) returns text
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_member public.company_members%rowtype;
  v_permission_role text;
  v_authorized boolean := false;
  v_password text;
begin
  if p_company is null or p_actor_user is null or p_store_profile is null then
    raise exception 'store_access_password_read_invalid';
  end if;

  select * into v_member
    from public.company_members
   where company_id=p_company
     and user_id=p_actor_user
     and status='active'
     and (membership_expires_at is null or membership_expires_at>clock_timestamp());
  if not found then raise exception 'store_access_password_read_forbidden'; end if;

  v_permission_role := coalesce(
    v_member.permission_role,
    case when v_member.role in ('owner','manager','driver') then v_member.role else 'staff' end
  );

  -- Office access is explicit and never inferred from a caller-supplied role.
  if v_permission_role in ('owner','manager') then
    v_authorized := exists(
      select 1 from public.store_accounts sa
       where sa.company_id=p_company
         and sa.store_profile_id=p_store_profile
         and sa.status='active'
    );
  -- A driver must present the exact current-day delivery stop for this store.
  elsif (v_member.role='driver' or 'delivery'=any(coalesce(v_member.duties,'{}'::text[])))
    and p_route_stop is not null
  then
    v_authorized := exists(
      select 1
        from public.delivery_route_stops drs
        join public.store_accounts sa
          on sa.company_id=drs.company_id
         and sa.customer_id=drs.customer_id
         and sa.status='active'
       where drs.id=p_route_stop
         and drs.company_id=p_company
         and drs.driver_member_id=v_member.id
         and drs.stop_type='delivery'
         and drs.route_date=(clock_timestamp() at time zone 'Asia/Seoul')::date
         and drs.status in ('planned','arrived')
         and sa.store_profile_id=p_store_profile
    );
  end if;

  if not v_authorized then raise exception 'store_access_password_read_forbidden'; end if;

  select access_password into v_password
    from public.store_profiles
   where id=p_store_profile and status='active';
  if not found then raise exception 'store_profile_not_found'; end if;
  return v_password;
end $$;

revoke all on function public.read_store_access_password_v1(uuid,uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.read_store_access_password_v1(uuid,uuid,uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;

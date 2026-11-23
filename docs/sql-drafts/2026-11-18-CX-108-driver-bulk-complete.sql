-- CX-108 draft only. DO NOT APPLY without representative approval.
begin;

create or replace function public.complete_driver_delivery_stops_atomic(
  p_company_id uuid,
  p_driver_member_id uuid,
  p_route_date date,
  p_stop_ids uuid[]
) returns timestamptz
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  expected_count integer;
  completed_token timestamptz := clock_timestamp();
  updated_count integer;
begin
  expected_count := coalesce(cardinality(p_stop_ids), 0);
  if expected_count = 0
     or (select count(distinct input.stop_id) from unnest(p_stop_ids) as input(stop_id)) <> expected_count
  then
    raise exception using errcode = '22023', message = 'invalid stop payload';
  end if;

  perform 1
    from public.delivery_route_stops
   where company_id = p_company_id
     and driver_member_id = p_driver_member_id
     and route_date = p_route_date
     and id = any(p_stop_ids)
   for update;

  if (select count(*)
        from public.delivery_route_stops
       where company_id = p_company_id
         and driver_member_id = p_driver_member_id
         and route_date = p_route_date
         and stop_type = 'delivery'
         and status in ('planned', 'arrived')
         and id = any(p_stop_ids)) <> expected_count
  then
    raise exception using errcode = '40001', message = 'route changed or stop is not completable';
  end if;

  update public.delivery_route_stops
     set status = 'completed',
         completed_at = completed_token,
         updated_at = completed_token
   where company_id = p_company_id
     and driver_member_id = p_driver_member_id
     and route_date = p_route_date
     and stop_type = 'delivery'
     and status in ('planned', 'arrived')
     and id = any(p_stop_ids);

  get diagnostics updated_count = row_count;
  if updated_count <> expected_count then
    raise exception using errcode = '40001', message = 'route changed during completion';
  end if;
  return completed_token;
end $$;

revoke all on function public.complete_driver_delivery_stops_atomic(uuid,uuid,date,uuid[]) from public,anon,authenticated;
grant execute on function public.complete_driver_delivery_stops_atomic(uuid,uuid,date,uuid[]) to service_role;

commit;

-- CX-65 draft only. DO NOT APPLY without representative approval.
begin;

create or replace function public.reorder_driver_delivery_stops(
  p_company_id uuid,
  p_driver_member_id uuid,
  p_route_date date,
  p_stop_ids uuid[],
  p_stop_orders integer[]
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare expected_count integer; updated_count integer;
begin
  if coalesce(cardinality(p_stop_ids),0)=0
     or cardinality(p_stop_ids)<>cardinality(p_stop_orders)
     or (select count(distinct value) from unnest(p_stop_ids) value)<>cardinality(p_stop_ids)
     or (select count(distinct value) from unnest(p_stop_orders) value)<>cardinality(p_stop_orders)
  then raise exception using errcode='22023',message='invalid stop order payload'; end if;

  perform 1 from public.delivery_route_stops
  where company_id=p_company_id and driver_member_id=p_driver_member_id and route_date=p_route_date
  for update;

  select count(*) into expected_count
  from public.delivery_route_stops
  where company_id=p_company_id and driver_member_id=p_driver_member_id
    and route_date=p_route_date and stop_type='delivery';

  if expected_count<>cardinality(p_stop_ids)
     or exists(
       select 1 from public.delivery_route_stops
       where company_id=p_company_id and driver_member_id=p_driver_member_id
         and route_date=p_route_date and status<>'planned'
     )
     or exists(
       select 1 from unnest(p_stop_ids) value
       where not exists(
         select 1 from public.delivery_route_stops s
         where s.company_id=p_company_id and s.driver_member_id=p_driver_member_id
           and s.route_date=p_route_date and s.stop_type='delivery' and s.id=value
       )
     )
  then raise exception using errcode='40001',message='route changed or already started'; end if;

  set constraints delivery_route_stops_driver_order_uq deferred;
  update public.delivery_route_stops s
     set stop_order=input.stop_order,updated_at=clock_timestamp()
    from unnest(p_stop_ids,p_stop_orders) input(stop_id,stop_order)
   where s.company_id=p_company_id and s.driver_member_id=p_driver_member_id
     and s.route_date=p_route_date and s.id=input.stop_id and s.status='planned';

  get diagnostics updated_count=row_count;
  if updated_count<>expected_count then raise exception using errcode='40001',message='route changed'; end if;
end $$;

create or replace function public.undo_driver_route_stop(
  p_company_id uuid,
  p_driver_member_id uuid,
  p_stop_id uuid,
  p_completed_at timestamptz
) returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare previous_status text;
begin
  update public.delivery_route_stops
     set status=case when arrived_at is null then 'planned' else 'arrived' end,
         completed_at=null,reason_category=null,reason_code=null,reason_detail=null,
         handed_to_owner=false,updated_at=clock_timestamp()
   where company_id=p_company_id and driver_member_id=p_driver_member_id and id=p_stop_id
     and status in('completed','partial','problem','not_delivered')
     and completed_at=p_completed_at
     and clock_timestamp()<=p_completed_at+interval '5 seconds'
  returning status into previous_status;
  if previous_status is null then
    raise exception using errcode='40001',message='undo window expired or stop changed';
  end if;
  return previous_status;
end $$;

revoke all on function public.reorder_driver_delivery_stops(uuid,uuid,date,uuid[],integer[]) from public,anon,authenticated;
revoke all on function public.undo_driver_route_stop(uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.reorder_driver_delivery_stops(uuid,uuid,date,uuid[],integer[]) to service_role;
grant execute on function public.undo_driver_route_stop(uuid,uuid,uuid,timestamptz) to service_role;

commit;

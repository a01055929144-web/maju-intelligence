-- CX-46c rollback draft. Disable callers first. Never discard route evidence.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
do $$ begin
  if exists(select 1 from public.delivery_route_stops
    where source<>'legacy_customer_ids' or status<>'planned'
       or arrived_at is not null or completed_at is not null)
    or exists(select 1 from public.delivery_route_stop_photos)
  then raise exception 'CX-46c down refused: route activity or photo evidence exists'; end if;
end $$;
drop table public.delivery_route_stop_photos;
drop table public.delivery_route_stops;
drop table public.delivery_route_reason_codes;
alter table public.delivery_vehicle_master drop constraint delivery_vehicle_master_company_id_id_uq;
alter table public.route_plan_confirmations drop constraint route_plan_confirmations_company_id_id_uq;
commit;

-- CX-65 draft rollback. Refuse to discard captured values.
begin;

do $$
begin
  if exists (select 1 from public.delivery_route_stops where extra_minutes is not null) then
    raise exception 'refusing rollback: delivery_route_stops.extra_minutes contains data';
  end if;
end $$;

alter table public.delivery_route_stops
  drop constraint delivery_route_stops_extra_minutes_range;
alter table public.delivery_route_stops
  drop column extra_minutes;

commit;

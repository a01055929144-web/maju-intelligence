-- CX-65 draft only. DO NOT APPLY without representative approval.
-- Stores the driver's optional "+n분" detour allowance; it never changes money or documents.
begin;

alter table public.delivery_route_stops
  add column extra_minutes smallint;

alter table public.delivery_route_stops
  add constraint delivery_route_stops_extra_minutes_range
  check (extra_minutes is null or extra_minutes between 0 and 240);

comment on column public.delivery_route_stops.extra_minutes is
  'Optional added travel minutes for a sales detour. CX-65 draft; no price/document effect.';

commit;

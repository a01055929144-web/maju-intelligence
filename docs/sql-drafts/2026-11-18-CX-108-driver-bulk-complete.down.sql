-- CX-108 draft rollback. DO NOT APPLY without representative approval.
drop function if exists public.complete_driver_delivery_stops_atomic(uuid,uuid,date,uuid[]);

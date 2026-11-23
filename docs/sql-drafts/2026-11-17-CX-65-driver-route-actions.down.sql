begin;
drop function if exists public.undo_driver_route_stop(uuid,uuid,uuid,timestamptz);
drop function if exists public.reorder_driver_delivery_stops(uuid,uuid,date,uuid[],integer[]);
commit;

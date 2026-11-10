begin;
set local lock_timeout='3s';
do $$ begin
  if exists(select 1 from public.store_order_delivery_resolutions_09) then raise exception 'pending_resolution_history_requires_review'; end if;
end $$;
drop function public.resolve_pending_order_delivery_09(uuid,uuid,uuid,uuid,uuid,integer,date,text);
drop index public.store_orders_pending_inbox_09_idx;
drop table public.store_order_delivery_resolutions_09;
notify pgrst,'reload schema';
commit;

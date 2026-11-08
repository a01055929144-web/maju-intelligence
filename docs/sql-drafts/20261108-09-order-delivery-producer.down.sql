-- REVIEW ONLY. Disable callers first. Retain 02 snapshot columns/guard and all original order RPCs.
begin;
lock table public.store_order_delivery_requests_09,public.store_order_delivery_completions_09,public.store_order_delivery_completion_orders_09 in access exclusive mode;
do $$ begin
  if exists(select from public.store_order_delivery_requests_09) or exists(select from public.store_order_delivery_completions_09)
    or exists(select from public.store_order_delivery_completion_orders_09) then
    raise exception 'store_order_delivery_09_down_refused_data_exists';
  end if;
end $$;
drop function public.place_store_order_with_delivery_snapshot_09(text,date,jsonb,uuid,jsonb,uuid,integer,text,uuid,uuid,uuid);
drop function public.complete_store_order_delivery_09(uuid,uuid,date,uuid[],jsonb,timestamptz,text);
drop table public.store_order_delivery_completion_orders_09;
drop table public.store_order_delivery_requests_09,public.store_order_delivery_completions_09;
commit;

begin;
set local lock_timeout='3s';
do $$ begin
  if exists(select 1 from public.store_orders where delivery_confirmation='pending' or delivery_date is null)
    then raise exception 'pending_delivery_orders_require_review_before_down'; end if;
end $$;
drop function public.place_store_pending_delivery_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid);
alter table public.store_orders drop constraint store_orders_delivery_schedule_shape_check;
alter table public.store_orders alter column delivery_date set not null;
alter table public.store_orders drop column delivery_confirmation;
notify pgrst,'reload schema';
commit;

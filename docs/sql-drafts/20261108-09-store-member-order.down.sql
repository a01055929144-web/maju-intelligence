-- REVIEW ONLY: keep legacy link ordering untouched. Do not roll back while member orders exist.
begin;
lock table public.store_orders in share row exclusive mode;
do $$ begin
  if exists(select from public.store_orders where store_account_id is not null or ordered_by_member_id is not null) then
    raise exception 'member_order_down_refused_data_exists';
  end if;
end $$;
drop function public.place_store_member_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid);
commit;

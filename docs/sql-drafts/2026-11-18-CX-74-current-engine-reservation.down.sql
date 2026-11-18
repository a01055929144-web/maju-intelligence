-- DRAFT ONLY. Revert this variant before D4 / CX-66 columns / CX-75.
-- Preserve the current non-cancelled status rule and every order row.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
do $patch$
declare f record; name text; definition text;
begin
  foreach name in array array['cx75_place_store_order_impl','cx75_place_store_member_order_impl',
    'cx75_place_store_catalog_order_core_v1_impl','cx75_place_store_account_order_impl'] loop
    if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname=name)<>1 then
      raise exception 'cx74_unreviewed_current_engine: %',name;
    end if;
    select pg_get_functiondef(oid) body into strict f from pg_proc
      where pronamespace='public'::regnamespace and proname=name;
    if (length(f.body)-length(replace(f.body,'sum(sl.quantity - sl.cancelled_quantity)','')))
      /length('sum(sl.quantity - sl.cancelled_quantity)')<>2
      or (length(f.body)-length(replace(f.body,'so.status <> ''cancelled'' and so.id <> v_order.id','')))
        /length('so.status <> ''cancelled'' and so.id <> v_order.id')<>1 then
      raise exception 'cx74_unreviewed_current_reservation_down: %',name;
    end if;
    execute replace(f.body,'sum(sl.quantity - sl.cancelled_quantity)','sum(sl.quantity)');
  end loop;
  select pg_get_functiondef('public.promotion_remaining_v1(uuid,uuid[])'::regprocedure) into definition;
  if (length(definition)-length(replace(definition,'sum(line.quantity - line.cancelled_quantity)','')))
    /length('sum(line.quantity - line.cancelled_quantity)')<>2 then
    raise exception 'cx74_unreviewed_remaining_down';
  end if;
  execute replace(definition,'sum(line.quantity - line.cancelled_quantity)','sum(line.quantity)');
end $patch$;
notify pgrst,'reload schema';
commit;

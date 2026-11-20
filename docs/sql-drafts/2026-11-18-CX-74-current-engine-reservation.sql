-- DRAFT ONLY: variant for the read-verified current CX-75 engines.
-- Apply only after separately approved D4 and CX-66 partial-final-cancel.
-- This replaces the legacy-fixture variant; never apply both variants.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
do $patch$
declare f record; name text; definition text;
begin
  if not exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='store_order_lines' and column_name='cancelled_quantity' and is_nullable='NO')
    or to_regprocedure('public.promotion_remaining_v1(uuid,uuid[])') is null then
    raise exception 'cx74_partial_cancel_prerequisite_missing';
  end if;
  foreach name in array array['cx75_place_store_order_impl','cx75_place_store_member_order_impl',
    'cx75_place_store_catalog_order_core_v1_impl','cx75_place_store_account_order_impl'] loop
    if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname=name)<>1 then
      raise exception 'cx74_unreviewed_current_engine: %',name;
    end if;
    select pg_get_functiondef(oid) body into strict f from pg_proc
      where pronamespace='public'::regnamespace and proname=name;
    if (length(f.body)-length(replace(f.body,'sum(sl.quantity)','')))/length('sum(sl.quantity)')<>2
      or (length(f.body)-length(replace(f.body,'so.status <> ''cancelled'' and so.id <> v_order.id','')))
        /length('so.status <> ''cancelled'' and so.id <> v_order.id')<>1
      or position('sl.cancelled_quantity' in f.body)>0 then
      raise exception 'cx74_unreviewed_current_reservation: %',name;
    end if;
    -- Current engines already count every non-cancelled state. Preserve that rule.
    execute replace(f.body,'sum(sl.quantity)','sum(sl.quantity - sl.cancelled_quantity)');
  end loop;
  select pg_get_functiondef('public.promotion_remaining_v1(uuid,uuid[])'::regprocedure) into definition;
  if (length(definition)-length(replace(definition,'sum(line.quantity)','')))/length('sum(line.quantity)')<>2
    or position('line.cancelled_quantity' in definition)>0 then
    raise exception 'cx74_unreviewed_remaining_definition';
  end if;
  execute replace(definition,'sum(line.quantity)','sum(line.quantity - line.cancelled_quantity)');
end $patch$;
notify pgrst,'reload schema';
commit;

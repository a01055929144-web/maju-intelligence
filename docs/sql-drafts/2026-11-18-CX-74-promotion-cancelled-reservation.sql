-- DRAFT ONLY. Prerequisites: CX-75, D4 remaining RPC, CX-66 partial-final-cancel.
-- No historical row updates. Keep shipped units consumed; release only final cancellations.
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
  -- CX-75 retains these reviewed engines behind every document/catalog/account entry.
  -- The pending-delivery entry is separate and must use the same reservation rule.
  foreach name in array array['cx75_place_store_order_impl','cx75_place_store_member_order_impl',
    'cx75_place_store_catalog_order_core_v1_impl','cx75_place_store_account_order_impl',
    'place_store_pending_delivery_order'] loop
    if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname=name)<>1 then
      raise exception 'cx74_unreviewed_order_engine: %',name;
    end if;
    select oid,pg_get_functiondef(oid) body into strict f from pg_proc
      where pronamespace='public'::regnamespace and proname=name;
    definition:=replace(f.body,'sum(sl.quantity)','sum(sl.quantity - sl.cancelled_quantity)');
    if (length(f.body)-length(replace(f.body,'sum(sl.quantity)','')))/length('sum(sl.quantity)')<>2
      or position('sl.cancelled_quantity' in f.body)>0 then
      raise exception 'cx74_unreviewed_reservation_definition: %',name;
    end if;
    if name in ('cx75_place_store_order_impl','cx75_place_store_member_order_impl','place_store_pending_delivery_order') then
      if (length(definition)-length(replace(definition,
        'and so.status = ''submitted'' and so.id <> v_order.id','')))
        /length('and so.status = ''submitted'' and so.id <> v_order.id')<>1 then
        raise exception 'cx74_unreviewed_reservation_status: %',name;
      end if;
      -- Received / shipped / delivered units still consume the promotion budget.
      definition:=replace(definition,'and so.status = ''submitted'' and so.id <> v_order.id',
        'and so.status <> ''cancelled'' and so.id <> v_order.id');
    end if;
    execute definition; -- CREATE OR REPLACE preserves OID, owner and ACL.
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

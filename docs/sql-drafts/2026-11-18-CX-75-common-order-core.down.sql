-- Turn off company rollout first. Existing order/cart/notification data is retained.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
lock table public.store_order_settings,public.store_orders in share row exclusive mode;
do $restore$
declare
  f record;
  v_original text;
  v_wrapper oid;
begin
  if exists(select 1 from public.store_order_settings where unified_order_core_enabled) then
    raise exception 'cx75_disable_companies_before_down';
  end if;
  for f in select p.oid,p.proname,pg_get_function_identity_arguments(p.oid) arguments
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'cx75_place_store_%_impl'
  loop
    v_original := substring(f.proname from 6 for length(f.proname)-10);
    select p.oid into v_wrapper from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=v_original;
    if v_wrapper is null or position('place_store_order_core_v2' in pg_get_functiondef(v_wrapper))=0 then
      raise exception 'cx75_wrapper_changed: %',v_original;
    end if;
    execute replace(pg_get_functiondef(f.oid),
      'FUNCTION public.' || f.proname || '(', 'FUNCTION public.' || v_original || '(');
    execute format('drop function public.%I(%s)',f.proname,f.arguments);
    execute format('grant execute on function public.%I(%s) to service_role',v_original,f.arguments);
  end loop;
end $restore$;
drop function public.place_store_order_core_v2(text,jsonb);
alter table public.store_order_settings drop column unified_order_core_enabled;
notify pgrst,'reload schema';
commit;

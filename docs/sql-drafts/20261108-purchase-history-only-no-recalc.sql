-- Approval required. Do not apply to production from this file without the DB approval runbook.
-- History-only batches keep every receipt row but must not touch current prices, sales prices, or documents.
do $migration$
declare
  v_definition text;
  v_old constant text := $old$  select id into v_before_run from public.price_recalc_runs
    where company_id=p_company order by created_at desc,id desc limit 1;
  perform public.pricing_p0_command(p_company,'{"action":"recalculate"}'::jsonb);
  select id into v_after_run from public.price_recalc_runs
    where company_id=p_company order by created_at desc,id desc limit 1;
  if v_after_run is distinct from v_before_run then v_recalc_run:=v_after_run; end if;$old$;
  v_new constant text := $new$  if jsonb_object_length(v_current_product_ids)>0 then
    select id into v_before_run from public.price_recalc_runs
      where company_id=p_company order by created_at desc,id desc limit 1;
    perform public.pricing_p0_command(p_company,'{"action":"recalculate"}'::jsonb);
    select id into v_after_run from public.price_recalc_runs
      where company_id=p_company order by created_at desc,id desc limit 1;
    if v_after_run is distinct from v_before_run then v_recalc_run:=v_after_run; end if;
  end if;$new$;
begin
  select pg_get_functiondef(p.oid) into strict v_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='save_purchase_cost_date_batch_v2';
  if position(v_old in v_definition)=0 or position(v_old in replace(v_definition,v_old,''))>0 then
    raise exception 'unexpected_purchase_cost_date_function_definition';
  end if;
  execute replace(v_definition,v_old,v_new);
end
$migration$;

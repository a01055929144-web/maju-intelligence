-- CX-117 rollback draft. Preserve active product deadlines until a forward fix is ready.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
lock table public.store_orders in share row exclusive mode;

do $patch$
declare
  fn regprocedure := to_regprocedure('public.place_store_order_core_v2(text,jsonb)');
  definition text;
  original_acl aclitem[];
  original_owner oid;
  source_gate constant text := $s$if p_entry<>'place_store_account_orders' and (
    coalesce(v_enabled,false) or exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(p_request->'p_lines')='array'
          then p_request->'p_lines' else '[]'::jsonb end
      ) line
      join public.product_catalog product on product.company_id=v_company
        and product.id=(line.value->>'productId')::uuid
      where product.is_active and product.order_cutoff_days_before is not null
    )
  ) then$s$;
  target_gate constant text := $t$if coalesce(v_enabled,false) and p_entry<>'place_store_account_orders' then$t$;
  source_error constant text := $s$raise exception 'product_cutoff_passed: %', coalesce(nullif(v_product->>'sales_product_name',''),nullif(v_product->>'purchase_product_name',''),'품목');$s$;
  target_error constant text := $t$raise exception 'Delivery date unavailable';$t$;
begin
  if fn is null then raise exception 'cx117_core_missing'; end if;
  if exists(select 1 from public.product_catalog
    where is_active and order_cutoff_days_before is not null)
  then raise exception 'cx117_clear_active_product_cutoffs_before_down'; end if;
  select proacl,proowner into original_acl,original_owner
    from pg_proc where oid=fn and prosecdef;
  if not found then raise exception 'cx117_core_security_changed'; end if;
  definition := pg_get_functiondef(fn);
  if (length(definition)-length(replace(definition,source_gate,'')))/length(source_gate)<>1
    or (length(definition)-length(replace(definition,source_error,'')))/length(source_error)<>1
  then raise exception 'cx117_core_definition_changed'; end if;
  execute replace(replace(definition,source_gate,target_gate),source_error,target_error);
  if fn::oid<>to_regprocedure('public.place_store_order_core_v2(text,jsonb)')::oid
    or (select proacl from pg_proc where oid=fn) is distinct from original_acl
    or (select proowner from pg_proc where oid=fn)<>original_owner
    or not (select prosecdef from pg_proc where oid=fn)
  then raise exception 'cx117_core_identity_acl_or_security_changed'; end if;
end $patch$;
commit;


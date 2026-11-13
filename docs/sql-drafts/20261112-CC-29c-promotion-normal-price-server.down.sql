-- DOWN for CC-29c. Restores the CC-29b lines in both order functions and drops margin_template_price_v1.
-- Note: this brings back the request-input / default_sales_price behavior of CC-29b (the defect 29c fixes); use only to roll back.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
lock table public.store_orders in share row exclusive mode;
do $patch$
declare signature text; fn regprocedure; definition text; original_acl aclitem[]; i integer;
 sources constant text[] := array[
  $s$-- cc29c: not a target and no agreement -> grade price, 가격 관리 sale price, document normal price (all server-side; request input is never a price).$s$,
  $s$v_price := coalesce(public.margin_template_price_v1(v_link.company_id, v_link.customer_id, v_product_id), (select e.price from public.pricing_p0_effective e where e.company_id = v_link.company_id and e.product_id = v_product_id and e.price > 0), v_normal_price); -- cc29c$s$];
 targets constant text[] := array[
  $t$-- cc29b: not a target and no agreement -> server grade price, document normal price, product default price.$t$,
  $t$v_price := coalesce(nullif(v_line->>'normalPrice','')::bigint, v_normal_price, round(v_product.default_sales_price)::bigint);$t$];
begin
  if to_regprocedure('public.margin_template_price_v1(uuid,uuid,uuid)') is null then raise exception 'cc29c_not_applied'; end if;
  foreach signature in array array[
    'public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)',
    'public.place_store_member_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)'
  ] loop
    fn := to_regprocedure(signature);
    if fn is null then raise exception 'cc29c_order_dependency_missing: %', signature; end if;
    select proacl into original_acl from pg_proc where oid = fn and not prosecdef;
    if not found then raise exception 'cc29c_invoker_required'; end if;
    definition := pg_get_functiondef(fn);
    for i in 1..array_length(sources,1) loop
      if (length(definition)-length(replace(definition,sources[i],'')))/length(sources[i]) <> 1
        then raise exception 'cc29c_definition_changed: % anchor %', signature, i; end if;
    end loop;
    for i in 1..array_length(sources,1) loop definition := replace(definition, sources[i], targets[i]); end loop;
    execute definition;
    if fn::oid <> to_regprocedure(signature)::oid or (select proacl from pg_proc where oid = fn) is distinct from original_acl
      or (select prosecdef from pg_proc where oid = fn) then raise exception 'cc29c_identity_acl_or_security_changed'; end if;
  end loop;
end $patch$;
drop function public.margin_template_price_v1(uuid,uuid,uuid);
commit;

-- DOWN for CC-29b. Restores the two order functions and drops save_promotion_audience_v1.
-- Refused while any promotion has a restricted audience (the order functions would stop enforcing it); set those back to "all stores" first.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
lock table public.store_orders in share row exclusive mode;
do $patch$
declare signature text; fn regprocedure; definition text; original_acl aclitem[]; i integer; nl text;
 sources constant text[] := array[
  $s$v_seen text[] := '{}';
  v_promo_id uuid; v_applies boolean := true; v_normal jsonb; v_normal_price bigint; v_not_applied integer := 0; -- cc29b$s$,
  $s$v_includes_tax := false;
    -- cc29b: promotion audience. A store that is not a target gets the normal line, never the promotion price/stock.
    v_promo_id := null; v_applies := true; v_normal := null; v_normal_price := null;
    if v_print_line->>'promotionId' is not null then
      v_promo_id := (v_print_line->>'promotionId')::uuid;
      perform 1 from public.pricing_promotions p
        where p.company_id = v_link.company_id and p.id = v_promo_id and p.product_id = v_product_id;
      if not found then raise exception 'Promotion unavailable'; end if;
      v_applies := public.promotion_applies_to(v_link.company_id, v_promo_id, v_link.customer_id);
      if not v_applies then
        v_not_applied := v_not_applied + 1; v_promo_id := null; v_price := null;
        select value into v_normal from jsonb_array_elements(v_version.content->'lines')
          where value->>'productId' = v_product_id::text and value->>'promotionId' is null and (value->>'visible')::boolean limit 1;
        if found then v_print_line := v_normal; v_tax_type := v_normal->>'taxType'; v_normal_price := (v_normal->>'price')::bigint; end if;
      end if;
    end if;$s$,
  $s$and a.sales_unit = v_print_line->>'unit'
        and not (v_promo_id is not null and v_applies) -- cc29b: a promotion price is never overwritten by an agreement$s$,
  $s$-- cc29b: not a target and no agreement -> server grade price, document normal price, product default price.
    if not v_applies and v_price is null and not v_market then
      v_price := coalesce(nullif(v_line->>'normalPrice','')::bigint, v_normal_price, round(v_product.default_sales_price)::bigint);
      if v_price is null or v_price <= 0 then raise exception 'Normal price unavailable'; end if;
    end if;
    if v_promo_id is not null then$s$,
  $s$values(v_link.company_id,v_order.id,v_product_id,v_promo_id,$s$,
  $s$'knownTotal',v_order.known_total,'marketPricePending',v_order.has_market_price,'promotionNotApplied',v_not_applied));$s$,
  $s$'knownTotal',v_order.known_total,'marketPricePending',v_order.has_market_price,'promotionNotApplied',v_not_applied);$s$];
 targets constant text[] := array[
  $t$v_seen text[] := '{}';$t$,
  $t$v_includes_tax := false;$t$,
  $t$and a.sales_unit = v_print_line->>'unit'$t$,
  $t$if v_print_line->>'promotionId' is not null then$t$,
  $t$values(v_link.company_id,v_order.id,v_product_id,(v_print_line->>'promotionId')::uuid,$t$,
  $t$'knownTotal',v_order.known_total,'marketPricePending',v_order.has_market_price));$t$,
  $t$'knownTotal',v_order.known_total,'marketPricePending',v_order.has_market_price);$t$];
begin
  if to_regprocedure('public.save_promotion_audience_v1(uuid,uuid,integer,text,jsonb)') is null then raise exception 'cc29b_not_applied'; end if;
  if exists(select 1 from public.pricing_promotions where audience <> 'all') then raise exception 'cc29b_down_refused_audience_in_use'; end if;
  foreach signature in array array[
    'public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)',
    'public.place_store_member_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)'
  ] loop
    fn := to_regprocedure(signature);
    if fn is null then raise exception 'cc29b_order_dependency_missing: %', signature; end if;
    select proacl into original_acl from pg_proc where oid = fn and not prosecdef;
    if not found then raise exception 'cc29b_invoker_required'; end if;
    definition := pg_get_functiondef(fn);
    -- A function body may use CRLF (older definitions) or LF; the patch text follows the function's own newline.
    nl := case when strpos(definition, E'
') > 0 then E'
' else E'
' end;
    for i in 1..array_length(sources,1) loop
      if (length(definition)-length(replace(definition,replace(sources[i],E'
',nl),'')))/length(replace(sources[i],E'
',nl)) <> 1
        then raise exception 'cc29b_definition_changed: % anchor %', signature, i; end if;
    end loop;
    for i in 1..array_length(sources,1) loop definition := replace(definition, replace(sources[i],E'
',nl), replace(targets[i],E'
',nl)); end loop;
    execute definition;
    if fn::oid <> to_regprocedure(signature)::oid or (select proacl from pg_proc where oid = fn) is distinct from original_acl
      or (select prosecdef from pg_proc where oid = fn) then raise exception 'cc29b_identity_acl_or_security_changed'; end if;
  end loop;
end $patch$;
drop function public.save_promotion_audience_v1(uuid,uuid,integer,text,jsonb);
commit;

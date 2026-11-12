-- DRAFT ONLY (CC-29c). Never run against production without the CEO's explicit approval phrase.
-- Fixes CC-29b (applied 11/12): for a promotion line of a store that is NOT a target, the "normal price" used
-- the request input v_line->>'normalPrice' and the product's default_sales_price. Request input must never be a price,
-- and default_sales_price is empty for real companies (JS Retail), which made such orders fail.
-- New server-side order, after a valid agreement price (unchanged, handled before this point):
--   (2) the grade price of the store's own margin_template_id  (margin_template_price_v1, same rules as templatePrice in the app)
--   (3) pricing_p0_effective.price  (the sale price shown on 가격 관리, same source as E1 sales vouchers; 0 = not set)
--   (4) the price of the normal line in the published document
--   none of them -> 'Normal price unavailable' (rejected, as before).
-- Both place_store_order and place_store_member_order are patched in place (every anchor must match exactly once). No data changes.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if to_regprocedure('public.save_promotion_audience_v1(uuid,uuid,integer,text,jsonb)') is null then raise exception 'cc29c_requires_cc29b'; end if;
  if to_regprocedure('public.margin_template_price_v1(uuid,uuid,uuid)') is not null then raise exception 'cc29c_already_applied'; end if;
  if to_regclass('public.margin_template_items') is null or to_regclass('public.margin_template_categories') is null
    or to_regclass('public.pricing_p0_effective') is null or to_regprocedure('public.pricing_p0_price(numeric,integer,integer,bigint)') is null
    then raise exception 'cc29c_dependency_missing'; end if;
end $$;

-- Grade price of one product for one store. NULL when the store has no grade or no usable price (the caller then falls through).
-- Priority (same as templatePrice): template item direct price > template item margin > deepest matching category margin > template margin.
create function public.margin_template_price_v1(p_company uuid, p_customer uuid, p_product uuid) returns bigint
language plpgsql stable security invoker set search_path = public,pg_temp as $$
declare t public.margin_templates%rowtype; it public.margin_template_items%rowtype; cost numeric; have text[]; bp integer; price bigint;
begin
  select m.* into t from public.margin_templates m join public.normalized_customers c on c.company_id = m.company_id and c.margin_template_id = m.id
    where c.company_id = p_company and c.id = p_customer;
  if not found then return null; end if;
  select p.purchase_price, array(select trim(x) from unnest(string_to_array(coalesce(p.category,''), '>')) x where trim(x) <> '')
    into cost, have from public.product_catalog p where p.company_id = p_company and p.id = p_product;
  select * into it from public.margin_template_items i where i.template_id = t.id and i.product_id = p_product;
  if found and it.direct_price is not null then return nullif(it.direct_price, 0); end if;
  if cost is null or cost <= 0 then return null; end if;
  bp := case when found and it.margin_bp is not null then it.margin_bp else null end;
  if bp is null then
    select k.margin_bp into bp from public.margin_template_categories k,
      lateral (select array(select trim(x) from unnest(string_to_array(k.category, '>')) x where trim(x) <> '') want) w
      where k.template_id = t.id and cardinality(w.want) > 0 and cardinality(w.want) <= cardinality(have) and have[1:cardinality(w.want)] = w.want
      order by cardinality(w.want) desc limit 1;
  end if;
  price := public.pricing_p0_price(cost, coalesce(bp, t.margin_bp), t.rounding);
  return nullif(price, 0);
end $$;
revoke all on function public.margin_template_price_v1(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.margin_template_price_v1(uuid,uuid,uuid) to service_role;

lock table public.store_orders in share row exclusive mode;
do $patch$
declare signature text; fn regprocedure; definition text; original_acl aclitem[]; i integer;
 sources constant text[] := array[
  $s$-- cc29b: not a target and no agreement -> server grade price, document normal price, product default price.$s$,
  $s$v_price := coalesce(nullif(v_line->>'normalPrice','')::bigint, v_normal_price, round(v_product.default_sales_price)::bigint);$s$];
 targets constant text[] := array[
  $t$-- cc29c: not a target and no agreement -> grade price, 가격 관리 sale price, document normal price (all server-side; request input is never a price).$t$,
  $t$v_price := coalesce(public.margin_template_price_v1(v_link.company_id, v_link.customer_id, v_product_id), (select e.price from public.pricing_p0_effective e where e.company_id = v_link.company_id and e.product_id = v_product_id and e.price > 0), v_normal_price); -- cc29c$t$];
begin
  foreach signature in array array[
    'public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)',
    'public.place_store_member_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)'
  ] loop
    fn := to_regprocedure(signature);
    if fn is null then raise exception 'cc29c_order_dependency_missing: %', signature; end if;
    select proacl into original_acl from pg_proc where oid = fn and not prosecdef;
    if not found then raise exception 'cc29c_invoker_required'; end if;
    definition := pg_get_functiondef(fn);
    if strpos(definition,'-- cc29c') > 0 then raise exception 'cc29c_already_applied: %', signature; end if;
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
commit;

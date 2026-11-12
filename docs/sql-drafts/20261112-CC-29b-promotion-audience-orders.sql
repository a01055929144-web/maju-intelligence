-- DRAFT ONLY (CC-29b). Never run against production without the CEO's explicit approval phrase.
-- Needs CC-29a (audience column, pricing_promotion_targets, promotion_applies_to) applied first.
-- 1) save_promotion_audience_v1: one transaction replaces a promotion's audience + targets (revision checked, company checked).
-- 2) place_store_order / place_store_member_order patched in place (same text-patch style as CX-08, every anchor must match exactly once):
--    * promotion line + store IS a target  -> promotion price kept, stock/limit checked as before; a store agreement price no longer overwrites it.
--    * promotion line + store is NOT a target -> normal line: agreement price -> server "normalPrice" (grade price) -> the document's normal line price
--      -> product default_sales_price; no promotion stock check, order line promotion_id stays empty, result gets promotionNotApplied.
--    * lines without a promotion behave exactly as before.
-- Service-only (no anon/authenticated). Existing promotions are audience = 'all', so nothing changes until a promotion is restricted.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if to_regprocedure('public.promotion_applies_to(uuid,uuid,uuid)') is null or to_regclass('public.pricing_promotion_targets') is null
    then raise exception 'cc29b_requires_cc29a'; end if;
  if not exists(select from information_schema.columns where table_schema='public' and table_name='product_catalog' and column_name='default_sales_price')
    then raise exception 'cc29b_default_sales_price_missing'; end if;
  if to_regprocedure('public.save_promotion_audience_v1(uuid,uuid,integer,text,jsonb)') is not null then raise exception 'cc29b_already_applied'; end if;
end $$;

create function public.save_promotion_audience_v1(p_company uuid, p_promotion uuid, p_expected_revision integer, p_audience text, p_targets jsonb)
returns jsonb language plpgsql security invoker set search_path = public,pg_temp as $$
declare pr public.pricing_promotions%rowtype; n integer;
begin
  if p_company is null or p_promotion is null or p_expected_revision is null or p_audience is null
    or p_audience not in ('all','only','except') or p_targets is null or jsonb_typeof(p_targets) <> 'array'
    or jsonb_array_length(p_targets) > 200 then raise exception 'Invalid audience request'; end if;
  if exists(select 1 from jsonb_array_elements(p_targets) e
    where jsonb_typeof(e) <> 'object' or coalesce(e->>'kind','') not in ('customer','template')
      or coalesce(e->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'Invalid audience target'; end if;
  select * into pr from public.pricing_promotions where company_id = p_company and id = p_promotion for update;
  if not found then raise exception 'Promotion not found'; end if;
  if pr.revision <> p_expected_revision then raise exception 'Stale promotion'; end if;
  select count(distinct (e->>'kind', lower(e->>'id'))) into n from jsonb_array_elements(p_targets) e;
  if p_audience = 'all' and n > 0 then raise exception 'Targets not allowed for all stores'; end if;
  if p_audience = 'only' and n = 0 then raise exception 'Audience targets required'; end if;
  if exists(select 1 from jsonb_array_elements(p_targets) e where e->>'kind' = 'customer'
      and not exists(select 1 from public.normalized_customers c where c.company_id = p_company and c.id = (e->>'id')::uuid))
    or exists(select 1 from jsonb_array_elements(p_targets) e where e->>'kind' = 'template'
      and not exists(select 1 from public.margin_templates m where m.company_id = p_company and m.id = (e->>'id')::uuid))
    then raise exception 'Audience target outside company'; end if;
  delete from public.pricing_promotion_targets where company_id = p_company and promotion_id = p_promotion;
  insert into public.pricing_promotion_targets(company_id, promotion_id, customer_id, template_id)
    select distinct p_company, p_promotion,
      case when e->>'kind' = 'customer' then (e->>'id')::uuid end,
      case when e->>'kind' = 'template' then (e->>'id')::uuid end
    from jsonb_array_elements(p_targets) e;
  update public.pricing_promotions set audience = p_audience, revision = revision + 1
    where company_id = p_company and id = p_promotion returning * into pr;
  return jsonb_build_object('id', pr.id, 'revision', pr.revision, 'audience', pr.audience, 'targets', n);
end $$;
revoke all on function public.save_promotion_audience_v1(uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_promotion_audience_v1(uuid,uuid,integer,text,jsonb) to service_role;

lock table public.store_orders in share row exclusive mode;
do $patch$
declare signature text; fn regprocedure; definition text; original_acl aclitem[]; i integer; nl text;
 sources constant text[] := array[
  $s$v_seen text[] := '{}';$s$,
  $s$v_includes_tax := false;$s$,
  $s$and a.sales_unit = v_print_line->>'unit'$s$,
  $s$if v_print_line->>'promotionId' is not null then$s$,
  $s$values(v_link.company_id,v_order.id,v_product_id,(v_print_line->>'promotionId')::uuid,$s$,
  $s$'knownTotal',v_order.known_total,'marketPricePending',v_order.has_market_price));$s$,
  $s$'knownTotal',v_order.known_total,'marketPricePending',v_order.has_market_price);$s$];
 targets constant text[] := array[
  $t$v_seen text[] := '{}';
  v_promo_id uuid; v_applies boolean := true; v_normal jsonb; v_normal_price bigint; v_not_applied integer := 0; -- cc29b$t$,
  $t$v_includes_tax := false;
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
    end if;$t$,
  $t$and a.sales_unit = v_print_line->>'unit'
        and not (v_promo_id is not null and v_applies) -- cc29b: a promotion price is never overwritten by an agreement$t$,
  $t$-- cc29b: not a target and no agreement -> server grade price, document normal price, product default price.
    if not v_applies and v_price is null and not v_market then
      v_price := coalesce(nullif(v_line->>'normalPrice','')::bigint, v_normal_price, round(v_product.default_sales_price)::bigint);
      if v_price is null or v_price <= 0 then raise exception 'Normal price unavailable'; end if;
    end if;
    if v_promo_id is not null then$t$,
  $t$values(v_link.company_id,v_order.id,v_product_id,v_promo_id,$t$,
  $t$'knownTotal',v_order.known_total,'marketPricePending',v_order.has_market_price,'promotionNotApplied',v_not_applied));$t$,
  $t$'knownTotal',v_order.known_total,'marketPricePending',v_order.has_market_price,'promotionNotApplied',v_not_applied);$t$];
begin
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
    if strpos(definition,'-- cc29b') > 0 then raise exception 'cc29b_already_applied: %', signature; end if;
    for i in 1..array_length(sources,1) loop
      if (length(definition)-length(replace(definition,replace(sources[i],E'
',nl),'')))/length(replace(sources[i],E'
',nl)) <> 1
        then raise exception 'cc29b_definition_changed: % anchor %', signature, i; end if;
    end loop;
    -- Reverse order: targets[2] contains sources[4], which must already be replaced by then.
    for i in reverse array_length(sources,1)..1 loop definition := replace(definition, replace(sources[i],E'
',nl), replace(targets[i],E'
',nl)); end loop;
    execute definition;
    if fn::oid <> to_regprocedure(signature)::oid or (select proacl from pg_proc where oid = fn) is distinct from original_acl
      or (select prosecdef from pg_proc where oid = fn) then raise exception 'cc29b_identity_acl_or_security_changed'; end if;
  end loop;
end $patch$;
commit;

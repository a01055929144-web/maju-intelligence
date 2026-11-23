-- DRAFT ONLY. Refuses rollback while a live link can create a row-snapshot order,
-- or while an active taxable promotion can create a fixed-final-price account order.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
lock table public.store_orders in share row exclusive mode;

do $$ begin
  if exists(
    select 1 from public.storefront_links l
    join public.pricing_document_versions v on v.company_id=l.company_id and v.id=l.document_version_id
    cross join lateral jsonb_array_elements(v.content->'lines') line
    where l.revoked_at is null and l.expires_at>clock_timestamp() and line ? 'priceIncludesTax'
  ) then raise exception 'store_order_vat_down_live_row_snapshots'; end if;
  if exists(select 1 from public.pricing_promotions where tax_type='taxable' and starts_on<=current_date and ends_on>=current_date and stock is distinct from 0)
    then raise exception 'store_order_vat_down_active_taxable_promotions'; end if;
  if exists(
    select 1 from public.store_orders o
    join public.store_order_lines l on l.company_id=o.company_id and l.order_id=o.id
    where l.price_includes_tax
      and o.status in ('submitted','received')
      and not exists(
        select 1 from public.business_documents d
        where d.company_id=o.company_id and d.source_type='order' and d.source_id=o.id
          and d.document_type='sale' and d.status in ('draft','confirmed')
          and not exists(
            select 1 from (
              select required.product_id,required.product_name,
                coalesce(nullif(required.sales_unit,''),'EA') normalized_unit,required.tax_type,
                required.quantity,required.unit_price,required.supply_amount,required.tax_amount,required.total_amount,
                count(*) required_count
              from public.store_order_lines required
              where required.company_id=o.company_id and required.order_id=o.id and required.price_includes_tax
              group by required.product_id,required.product_name,coalesce(nullif(required.sales_unit,''),'EA'),required.tax_type,
                required.quantity,required.unit_price,required.supply_amount,required.tax_amount,required.total_amount
            ) required
            where required.required_count > (
              select count(*)
              from public.business_document_lines consumed
              where consumed.company_id=d.company_id and consumed.document_id=d.id
                and consumed.product_catalog_id is not distinct from required.product_id
                and consumed.product_name_snapshot is not distinct from required.product_name
                and consumed.unit_snapshot is not distinct from required.normalized_unit
                and consumed.tax_type_snapshot is not distinct from required.tax_type
                and consumed.quantity is not distinct from required.quantity
                and consumed.unit_price is not distinct from required.unit_price
                and consumed.price_includes_tax_snapshot
                and consumed.supply_amount is not distinct from required.supply_amount
                and consumed.tax_amount is not distinct from required.tax_amount
                and consumed.total_amount is not distinct from required.total_amount
            )
          )
      )
  ) then raise exception 'store_order_vat_down_pending_snapshot_orders'; end if;
end $$;

do $patch$
declare public_signature text; implementation_signature text; fn regprocedure; definition text; original_acl aclitem[]; original_security boolean;
  source text := $body$v_includes_tax := case
      when jsonb_typeof(v_print_line->'priceIncludesTax') = 'boolean'
        then (v_print_line->>'priceIncludesTax')::boolean
      else false
    end; -- cx-vat-row-snapshot$body$;
  target text := 'v_includes_tax := false;';
begin
  foreach public_signature in array array['public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)','public.place_store_member_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)'] loop
    implementation_signature:=replace(replace(public_signature,'public.place_','public.cx75_place_'),'(','_impl(');
    fn:=coalesce(to_regprocedure(implementation_signature),to_regprocedure(public_signature));
    if fn is null then raise exception 'store_order_vat_down_dependency_missing'; end if;
    select proacl,prosecdef,pg_get_functiondef(oid) into original_acl,original_security,definition from pg_proc where oid=fn;
    if strpos(definition,'-- cx-vat-fallback-source')>0 then
      if (length(definition)-length(replace(definition,'v_not_applied := v_not_applied + 1; v_promo_id := null; v_price := null; v_includes_tax := false; -- cx-vat-fallback-source','')))/length('v_not_applied := v_not_applied + 1; v_promo_id := null; v_price := null; v_includes_tax := false; -- cx-vat-fallback-source')<>1
        then raise exception 'store_order_vat_down_cc29b_definition_changed: %',fn; end if;
      definition:=replace(definition,'v_not_applied := v_not_applied + 1; v_promo_id := null; v_price := null; v_includes_tax := false; -- cx-vat-fallback-source','v_not_applied := v_not_applied + 1; v_promo_id := null; v_price := null;');
      definition:=replace(definition,$s$if found then
          v_print_line := v_normal; v_tax_type := v_normal->>'taxType'; v_normal_price := (v_normal->>'price')::bigint;
          v_includes_tax := case when jsonb_typeof(v_normal->'priceIncludesTax')='boolean' then (v_normal->>'priceIncludesTax')::boolean else false end;
        end if;$s$,$s$if found then v_print_line := v_normal; v_tax_type := v_normal->>'taxType'; v_normal_price := (v_normal->>'price')::bigint; end if;$s$);
      execute definition;
      definition:=pg_get_functiondef(fn);
    end if;
    if (length(definition)-length(replace(definition,source,'')))/length(source)<>1 then raise exception 'store_order_vat_down_definition_changed: %',fn; end if;
    execute replace(definition,source,target);
    if fn::oid is distinct from coalesce(to_regprocedure(implementation_signature),to_regprocedure(public_signature))::oid or (select proacl from pg_proc where oid=fn) is distinct from original_acl or (select prosecdef from pg_proc where oid=fn) is distinct from original_security then raise exception 'store_order_vat_down_identity_acl_or_security_changed'; end if;
  end loop;
end $patch$;

do $patch$
declare public_signature text:='public.place_store_account_order(uuid,date,jsonb,uuid,uuid,integer,text,uuid,uuid)'; implementation_signature text:='public.cx75_place_store_account_order_impl(uuid,date,jsonb,uuid,uuid,integer,text,uuid,uuid)'; fn regprocedure; definition text; original_acl aclitem[]; original_security boolean;
  source text := 'v_price := v_promotion.price; v_tax_type := v_promotion.tax_type; v_includes_tax := v_tax_type = ''taxable''; -- cx-vat-promotion-final';
  target text := 'v_price := v_promotion.price; v_tax_type := v_promotion.tax_type;';
begin
  fn:=coalesce(to_regprocedure(implementation_signature),to_regprocedure(public_signature));
  if fn is null then raise exception 'store_account_order_vat_down_dependency_missing'; end if;
  select proacl,prosecdef,pg_get_functiondef(oid) into original_acl,original_security,definition from pg_proc where oid=fn;
  if (length(definition)-length(replace(definition,source,'')))/length(source)<>1 then raise exception 'store_account_order_vat_down_definition_changed'; end if;
  execute replace(definition,source,target);
  if fn::oid is distinct from coalesce(to_regprocedure(implementation_signature),to_regprocedure(public_signature))::oid or (select proacl from pg_proc where oid=fn) is distinct from original_acl or (select prosecdef from pg_proc where oid=fn) is distinct from original_security then raise exception 'store_account_order_vat_down_identity_acl_or_security_changed'; end if;
end $patch$;
commit;

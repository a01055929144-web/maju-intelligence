-- DRAFT ONLY. Do not apply to production without the task-specific approval phrase.
-- Keeps published document rows immutable: only a boolean priceIncludesTax already
-- present in a row changes future order interpretation; an absent key stays legacy false.
-- Deployment prerequisite and order: CX-38b document snapshot consumer, then CX-66
-- partial-dispatch compatibility, then this order producer patch.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
lock table public.store_orders in share row exclusive mode;

do $$ declare cx66 regprocedure; definition text; begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='business_document_lines' and column_name='price_includes_tax_snapshot')
    then raise exception 'store_order_vat_requires_cx38b'; end if;
  cx66:=to_regprocedure('public.dispatch_store_orders_partial_final_cancel(uuid,jsonb,uuid,uuid,text)');
  if cx66 is null
    then raise exception 'store_order_vat_requires_cx66_partial_dispatch'; end if;
  definition:=pg_get_functiondef(cx66);
  if strpos(definition,'partial_dispatch_snapshot_ambiguous')=0 or strpos(definition,'price_includes_tax_snapshot')=0
    then raise exception 'store_order_vat_requires_cx66_snapshot_contract'; end if;
end $$;

do $patch$
declare
  public_signature text;
  implementation_signature text;
  fn regprocedure;
  definition text;
  original_acl aclitem[];
  original_security boolean;
  source text := 'v_includes_tax := false;';
  target text := $body$v_includes_tax := case
      when jsonb_typeof(v_print_line->'priceIncludesTax') = 'boolean'
        then (v_print_line->>'priceIncludesTax')::boolean
      else false
    end; -- cx-vat-row-snapshot$body$;
begin
  foreach public_signature in array array[
    'public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)',
    'public.place_store_member_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)'
  ] loop
    implementation_signature := replace(public_signature, 'public.place_', 'public.cx75_place_');
    implementation_signature := replace(implementation_signature, '(', '_impl(');
    fn := coalesce(to_regprocedure(implementation_signature), to_regprocedure(public_signature));
    if fn is null then raise exception 'store_order_vat_dependency_missing: %', public_signature; end if;
    select proacl,prosecdef,pg_get_functiondef(oid) into original_acl,original_security,definition from pg_proc where oid=fn;
    if strpos(definition,'-- cx-vat-row-snapshot')>0 then raise exception 'store_order_vat_already_applied: %',fn; end if;
    if (length(definition)-length(replace(definition,source,'')))/length(source)<>1 then
      raise exception 'store_order_vat_definition_changed: %',fn;
    end if;
    execute replace(definition,source,target);
    definition := pg_get_functiondef(fn);
    if strpos(definition,'-- cc29b')>0 then
      if (length(definition)-length(replace(definition,'v_not_applied := v_not_applied + 1; v_promo_id := null; v_price := null;','')))/length('v_not_applied := v_not_applied + 1; v_promo_id := null; v_price := null;')<>1
        or (length(definition)-length(replace(definition,$s$if found then v_print_line := v_normal; v_tax_type := v_normal->>'taxType'; v_normal_price := (v_normal->>'price')::bigint; end if;$s$,'')))/length($s$if found then v_print_line := v_normal; v_tax_type := v_normal->>'taxType'; v_normal_price := (v_normal->>'price')::bigint; end if;$s$)<>1
        then raise exception 'store_order_vat_cc29b_definition_changed: %',fn; end if;
      definition := replace(definition,'v_not_applied := v_not_applied + 1; v_promo_id := null; v_price := null;',
        'v_not_applied := v_not_applied + 1; v_promo_id := null; v_price := null; v_includes_tax := false; -- cx-vat-fallback-source');
      definition := replace(definition,$s$if found then v_print_line := v_normal; v_tax_type := v_normal->>'taxType'; v_normal_price := (v_normal->>'price')::bigint; end if;$s$,
        $s$if found then
          v_print_line := v_normal; v_tax_type := v_normal->>'taxType'; v_normal_price := (v_normal->>'price')::bigint;
          v_includes_tax := case when jsonb_typeof(v_normal->'priceIncludesTax')='boolean' then (v_normal->>'priceIncludesTax')::boolean else false end;
        end if;$s$);
      execute definition;
    end if;
    if fn::oid is distinct from coalesce(to_regprocedure(implementation_signature),to_regprocedure(public_signature))::oid
      or (select proacl from pg_proc where oid=fn) is distinct from original_acl
      or (select prosecdef from pg_proc where oid=fn) is distinct from original_security then
      raise exception 'store_order_vat_identity_acl_or_security_changed: %',fn;
    end if;
  end loop;
end $patch$;

do $patch$
declare
  public_signature text := 'public.place_store_account_order(uuid,date,jsonb,uuid,uuid,integer,text,uuid,uuid)';
  implementation_signature text := 'public.cx75_place_store_account_order_impl(uuid,date,jsonb,uuid,uuid,integer,text,uuid,uuid)';
  fn regprocedure;
  definition text;
  original_acl aclitem[];
  original_security boolean;
  source text := 'v_price := v_promotion.price; v_tax_type := v_promotion.tax_type;';
  target text := 'v_price := v_promotion.price; v_tax_type := v_promotion.tax_type; v_includes_tax := v_tax_type = ''taxable''; -- cx-vat-promotion-final';
begin
  fn := coalesce(to_regprocedure(implementation_signature),to_regprocedure(public_signature));
  if fn is null then raise exception 'store_account_order_vat_dependency_missing'; end if;
  select proacl,prosecdef,pg_get_functiondef(oid) into original_acl,original_security,definition from pg_proc where oid=fn;
  if strpos(definition,'-- cx-vat-promotion-final')>0 then raise exception 'store_account_order_vat_already_applied'; end if;
  if (length(definition)-length(replace(definition,source,'')))/length(source)<>1 then raise exception 'store_account_order_vat_definition_changed'; end if;
  execute replace(definition,source,target);
  if fn::oid is distinct from coalesce(to_regprocedure(implementation_signature),to_regprocedure(public_signature))::oid
    or (select proacl from pg_proc where oid=fn) is distinct from original_acl
    or (select prosecdef from pg_proc where oid=fn) is distinct from original_security then
    raise exception 'store_account_order_vat_identity_acl_or_security_changed';
  end if;
end $patch$;
commit;

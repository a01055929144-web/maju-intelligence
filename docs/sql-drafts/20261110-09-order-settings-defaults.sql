-- REVIEW ONLY. Separate operating approval required. No data writes, new grants, or new RPCs.
-- Preserve function identity, invoker security, ACL and all existing order rules.
begin;
do $patch$
declare
  signature text; fn regprocedure; definition text; replaced text; original_acl aclitem[];
  source constant text := $source$if not found then raise exception 'Order settings missing'; end if;$source$;
  target constant text := $target$if not found then
    -- 09 safe defaults: no settings row is required; territory weekdays remain required.
    v_company.cutoff_days_before := 1;
    v_company.cutoff_time := time '22:00';
    v_company.minimum_amount := 0;
    v_company.minimum_policy := 'notice';
    v_company.delivery_fee := 0;
  end if;$target$;
begin
  foreach signature in array array[
    'public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)',
    'public.place_store_member_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)'
  ] loop
    fn := to_regprocedure(signature);
    if fn is null then raise exception 'order_defaults_dependency_missing: %',signature; end if;
    select proacl into original_acl from pg_proc where oid=fn and not prosecdef;
    if not found then raise exception 'order_defaults_invoker_required'; end if;
    definition := pg_get_functiondef(fn);
    if strpos(definition,source)=0 or strpos(substr(definition,strpos(definition,source)+length(source)),source)>0 then
      raise exception 'order_defaults_definition_changed_or_already_applied: %',signature;
    end if;
    replaced := replace(definition,source,target);
    execute replaced;
    if to_regprocedure(signature)::oid<>fn::oid or (select proacl from pg_proc where oid=fn) is distinct from original_acl then
      raise exception 'order_defaults_identity_or_acl_changed';
    end if;
  end loop;
end $patch$;
commit;

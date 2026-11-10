-- REVIEW ONLY. Separate operating SQL approval required. No data/backfill/grant changes.
-- Single predicate patch preserves defaults, preopening, authorization and promotion row locks.
begin;
set local lock_timeout='3s';
set local statement_timeout='10s';
lock table public.store_orders in share row exclusive mode;
do $patch$
declare signature text; fn regprocedure; definition text; original_acl aclitem[];
 source constant text := $source$and so.status = 'submitted' and so.id <> v_order.id;$source$;
 target constant text := $target$and so.status <> 'cancelled' and so.id <> v_order.id;$target$;
begin
  foreach signature in array array[
    'public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)',
    'public.place_store_member_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)'
  ] loop
    fn:=to_regprocedure(signature);
    if fn is null then raise exception 'cx08_order_dependency_missing: %',signature;end if;
    select proacl into original_acl from pg_proc where oid=fn and not prosecdef;
    if not found then raise exception 'cx08_invoker_required';end if;
    definition:=pg_get_functiondef(fn);
    if (length(definition)-length(replace(definition,source,'')))/length(source)<>1
      or strpos(definition,'order by p.id for update;')=0
      or strpos(definition,'so.company_id = sl.company_id and so.id = sl.order_id')=0
      or strpos(definition,'where sl.company_id = v_link.company_id and sl.promotion_id = v_promotion.id')=0 then
      raise exception 'cx08_definition_changed_or_already_applied: %',signature;
    end if;
    execute replace(definition,source,target);
    if fn::oid<>to_regprocedure(signature)::oid or (select proacl from pg_proc where oid=fn) is distinct from original_acl
      or (select prosecdef from pg_proc where oid=fn) then raise exception 'cx08_identity_acl_or_security_changed';end if;
  end loop;
end $patch$;
commit;

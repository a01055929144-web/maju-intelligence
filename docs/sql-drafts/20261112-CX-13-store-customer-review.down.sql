-- DOWN for CX-13. Restores the CX-12 connect function, drops the guard/functions/history table and the review columns.
-- Refused while any store account still awaits review (its state would be lost) or any review history exists.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if not exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'store_accounts' and column_name = 'customer_review_status')
    then raise exception 'cx13_not_applied'; end if;
  if exists(select 1 from public.store_accounts where customer_review_status = 'needs_review') then raise exception 'cx13_down_refused_unconfirmed_accounts'; end if;
  if exists(select 1 from public.store_customer_review_events) then raise exception 'cx13_down_refused_review_history_exists'; end if;
end $$;

do $patch$
declare fn constant regprocedure := to_regprocedure('public.connect_store_profile_by_invite_code_v1(uuid,uuid,text)');
  definition text; original_acl aclitem[];
  sources constant text[] := array[$s$status, store_profile_id, invite_code_id, customer_review_status)$s$, $s$'active', prof.id, code.id, 'needs_review') returning id into v_account; -- cx13$s$];
  targets constant text[] := array[$t$status, store_profile_id, invite_code_id)$t$, $t$'active', prof.id, code.id) returning id into v_account;$t$];
  i integer;
begin
  select proacl into original_acl from pg_proc where oid = fn and not prosecdef;
  if not found then raise exception 'cx13_invoker_required'; end if;
  definition := pg_get_functiondef(fn);
  for i in 1 .. array_length(sources, 1) loop
    if (length(definition) - length(replace(definition, sources[i], ''))) / length(sources[i]) <> 1 then raise exception 'cx13_definition_changed: anchor %', i; end if;
  end loop;
  for i in 1 .. array_length(sources, 1) loop definition := replace(definition, sources[i], targets[i]); end loop;
  execute definition;
  if fn::oid <> to_regprocedure('public.connect_store_profile_by_invite_code_v1(uuid,uuid,text)')::oid
    or (select proacl from pg_proc where oid = fn) is distinct from original_acl or (select prosecdef from pg_proc where oid = fn)
    then raise exception 'cx13_identity_acl_or_security_changed'; end if;
end $patch$;

drop trigger store_orders_review_guard on public.store_orders;
drop function public.store_orders_review_guard();
drop function public.link_store_account_to_customer_v1(uuid,uuid,uuid,uuid,text);
drop function public.store_customer_review_candidates_v1(uuid,uuid);
drop function public.confirm_store_customer_v1(uuid,uuid,uuid,text);
drop function public.store_customer_confirmed(uuid,uuid);
drop table public.store_customer_review_events;
alter table public.store_accounts drop column customer_review_status, drop column customer_confirmed_by_user_id, drop column customer_confirmed_at;
commit;

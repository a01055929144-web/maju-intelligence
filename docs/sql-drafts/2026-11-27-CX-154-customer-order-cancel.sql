-- CX-154 draft only. Do not apply without operating approval.
-- CX-62 receipt cancellation cleanup must already exist.
begin;

do $$ begin
  if to_regclass('public.store_orders') is null
    or to_regclass('public.admin_audit_logs') is null
    or to_regprocedure('public.remove_cancelled_order_sale_draft()') is null then
    raise exception 'cx154_cancel_dependencies_missing';
  end if;
end $$;

create function public.cancel_customer_store_order(
  p_company_id uuid,
  p_order_id uuid,
  p_expected_revision integer,
  p_reason text,
  p_idempotency_key uuid,
  p_actor_user_id uuid,
  p_actor_name text
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_order public.store_orders%rowtype;
  v_audit public.admin_audit_logs%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_result jsonb;
begin
  if p_company_id is null or p_order_id is null or p_idempotency_key is null
    or p_expected_revision is null or p_expected_revision < 1
    or char_length(v_reason) not between 1 and 500 then
    raise exception 'order_cancel_invalid_request';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_idempotency_key::text, 0));
  select * into v_audit
    from public.admin_audit_logs
    where company_id = p_company_id
      and action = 'customer_store_order_cancelled'
      and metadata->>'requestKey' = p_idempotency_key::text
    order by created_at desc
    limit 1;
  if found then
    if v_audit.target_id is distinct from p_order_id
      or v_audit.metadata->>'reason' is distinct from v_reason
      or (v_audit.metadata->>'expectedRevision')::integer is distinct from p_expected_revision then
      raise exception 'order_cancel_idempotency_conflict';
    end if;
    return v_audit.metadata->'result';
  end if;

  select * into v_order
    from public.store_orders
    where company_id = p_company_id and id = p_order_id
    for update;
  if not found or v_order.status not in ('submitted', 'received')
    or v_order.revision is distinct from p_expected_revision then
    raise exception 'order_cancel_state_conflict';
  end if;

  update public.store_orders
    set status = 'cancelled', revision = revision + 1, updated_at = clock_timestamp()
    where company_id = p_company_id and id = p_order_id
      and status = v_order.status and revision = p_expected_revision
    returning * into v_order;
  if not found then raise exception 'order_cancel_state_conflict'; end if;

  v_result := jsonb_build_object('id', v_order.id, 'status', v_order.status, 'revision', v_order.revision);
  insert into public.admin_audit_logs(actor_user_id, company_id, action, target_type, target_id, metadata)
  values (p_actor_user_id, p_company_id, 'customer_store_order_cancelled', 'store_order', p_order_id,
    jsonb_build_object(
      'actorName', nullif(btrim(coalesce(p_actor_name, '')), ''),
      'expectedRevision', p_expected_revision,
      'reason', v_reason,
      'requestKey', p_idempotency_key,
      'result', v_result
    ));
  return v_result;
end $$;

revoke all on function public.cancel_customer_store_order(uuid, uuid, integer, text, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_customer_store_order(uuid, uuid, integer, text, uuid, uuid, text)
  to service_role;

notify pgrst, 'reload schema';
commit;

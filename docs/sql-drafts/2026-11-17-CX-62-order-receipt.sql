-- CX-62 draft. Apply only after approval. CX-38 RPCs and CX-13 order guard must already exist.
begin;

create function public.receive_store_order_with_sale_document(
  p_company_id uuid, p_order_id uuid, p_expected_revision integer,
  p_actor_user_id uuid, p_actor_name text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_order public.store_orders%rowtype;
  v_document public.business_documents%rowtype;
begin
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'order_receipt_conflict';
  end if;
  select * into v_order from public.store_orders
    where company_id = p_company_id and id = p_order_id for update;
  if not found then raise exception 'order_receipt_conflict'; end if;

  if v_order.status = 'submitted' and v_order.revision = p_expected_revision then
    select * into v_document from public.confirm_order_sale_document(
      p_company_id, p_order_id, p_actor_user_id, p_actor_name);
    if v_order.revision > 1 then
      select * into v_document from public.revise_order_sale_document(
        p_company_id, p_order_id, p_expected_revision, p_actor_user_id, p_actor_name, '고객사 접수');
    end if;
  elsif v_order.status = 'received' and v_order.revision - 1 = p_expected_revision then
    select * into v_document from public.business_documents
      where company_id = p_company_id and source_type = 'order' and source_key = 'order:' || p_order_id;
  else
    raise exception 'order_receipt_conflict';
  end if;

  if v_document.id is null or v_document.status is distinct from 'confirmed'
    or v_document.document_type is distinct from 'sale'
    or v_document.company_id is distinct from p_company_id
    or v_document.source_type is distinct from 'order'
    or v_document.source_id is distinct from p_order_id
    or v_document.source_key is distinct from 'order:' || p_order_id
    or v_document.customer_id is distinct from v_order.customer_id then
    raise exception 'order_receipt_document_unlinked';
  end if;

  if v_order.status = 'submitted' then
    update public.store_orders set status = 'received', revision = revision + 1, updated_at = clock_timestamp()
      where company_id = p_company_id and id = p_order_id and status = 'submitted' and revision = p_expected_revision
      returning * into v_order;
    if not found then raise exception 'order_receipt_conflict'; end if;
  end if;
  return jsonb_build_object('id', v_order.id, 'status', v_order.status, 'revision', v_order.revision);
end $$;

revoke all on function public.receive_store_order_with_sale_document(uuid, uuid, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.receive_store_order_with_sale_document(uuid, uuid, integer, uuid, text) to service_role;
notify pgrst, 'reload schema';
commit;
